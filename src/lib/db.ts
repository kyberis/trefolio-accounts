import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";

import { normalizeIdpLocale } from "@/lib/i18n/idp-locale";

const postgresUrl = process.env.DATABASE_URL ?? "";
const usePostgres =
  postgresUrl.startsWith("postgresql://") ||
  postgresUrl.startsWith("postgres://");

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let pgSchemaReady: Promise<void> | null = null;

function newSub(): string {
  return "u_" + randomBytes(9).toString("base64url");
}

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return value;
  }
  return String(value);
}

export interface DbUser {
  sub: string;
  email: string;
  name: string;
  password_plain: string;
  password_hash: string;
  google_id: string | null;
  apple_id: string | null;
  email_verified: number;
  /** BCP47 primary language tag for UI + transactional email (en, de, es, fr, it). */
  locale: string;
}

export interface SeedUserRow {
  sub: string;
  email: string;
  name: string | null;
  plan: "free" | "pro" | null;
  pro_until: string | null;
}

export interface AdminUserRow {
  sub: string;
  email: string;
  name: string;
  plan: "free" | "pro";
  pro_until: string | null;
  source: string | null;
  google_id: string | null;
  apple_id: string | null;
  email_verified: number;
  created_at: string | null;
}

export interface AdminUserListResult {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

function sqliteRowToUser(row: any): DbUser {
  return {
    sub: String(row.sub),
    email: String(row.email),
    name: String(row.name ?? ""),
    password_plain: String(row.password_plain ?? ""),
    password_hash: String(row.password_hash ?? ""),
    google_id: row.google_id ?? null,
    apple_id: row.apple_id ?? null,
    email_verified: Number(row.email_verified ?? 0) ? 1 : 0,
    locale: String(row.locale ?? "en"),
  };
}

function pgRowToUser(row: any): DbUser {
  return {
    sub: String(row.sub),
    email: String(row.email),
    name: String(row.name ?? ""),
    password_plain: String(row.password_plain ?? ""),
    password_hash: String(row.password_hash ?? ""),
    google_id: row.google_id ?? null,
    apple_id: row.apple_id ?? null,
    email_verified: row.email_verified ? 1 : 0,
    locale: String(row.locale ?? "en"),
  };
}

function getPool(): Pool {
  if (!postgresUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: postgresUrl,
      max: 10,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

async function ensurePostgresSchema(): Promise<void> {
  if (!usePostgres) return;
  if (pgSchemaReady) return pgSchemaReady;
  pgSchemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          sub TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          password_plain TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL DEFAULT '',
          google_id TEXT UNIQUE,
          apple_id TEXT UNIQUE,
          email_verified BOOLEAN NOT NULL DEFAULT FALSE,
          locale TEXT NOT NULL DEFAULT 'en',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
        CREATE TABLE IF NOT EXISTS entitlements (
          sub TEXT PRIMARY KEY,
          plan TEXT NOT NULL DEFAULT 'free',
          pro_until TIMESTAMPTZ,
          source TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS auth_codes (
          code TEXT PRIMARY KEY,
          sub TEXT NOT NULL,
          client_id TEXT NOT NULL,
          redirect_uri TEXT NOT NULL,
          code_challenge TEXT NOT NULL,
          code_challenge_method TEXT NOT NULL,
          nonce TEXT,
          scope TEXT NOT NULL DEFAULT 'openid email profile',
          expires_at BIGINT NOT NULL,
          used BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS telegram_links (
          tg_user_id TEXT PRIMARY KEY,
          sub TEXT NOT NULL,
          verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS passkeys (
          id TEXT PRIMARY KEY,
          sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
          public_key TEXT NOT NULL,
          counter BIGINT NOT NULL DEFAULT 0,
          transports TEXT NOT NULL DEFAULT '',
          backed_up BOOLEAN NOT NULL DEFAULT FALSE,
          device_name TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS passkeys_sub_idx ON passkeys(sub);
        CREATE TABLE IF NOT EXISTS stripe_customers (
          sub TEXT PRIMARY KEY REFERENCES users(sub) ON DELETE CASCADE,
          stripe_customer_id TEXT NOT NULL UNIQUE,
          stripe_subscription_id TEXT,
          current_period_end TIMESTAMPTZ,
          cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } finally {
      client.release();
    }
  })();
  return pgSchemaReady;
}

function safeAlter(db: Database.Database, sql: string): void {
  try {
    db.exec(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("duplicate column")) {
      throw err;
    }
  }
}

function getSqliteDb(): Database.Database {
  if (sqliteDb) return sqliteDb;
  const file = path.join(process.cwd(), "idp-dev.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      sub TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      password_plain TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      google_id TEXT,
      apple_id TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      locale TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS entitlements (
      sub TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      pro_until TEXT,
      source TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS auth_codes (
      code TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      code_challenge_method TEXT NOT NULL,
      nonce TEXT,
      scope TEXT NOT NULL DEFAULT 'openid email profile',
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS telegram_links (
      tg_user_id TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      verified_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '',
      backed_up INTEGER NOT NULL DEFAULT 0,
      device_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS passkeys_sub_idx ON passkeys(sub);
    CREATE TABLE IF NOT EXISTS stripe_customers (
      sub TEXT PRIMARY KEY,
      stripe_customer_id TEXT NOT NULL UNIQUE,
      stripe_subscription_id TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  safeAlter(db, `ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN google_id TEXT`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN apple_id TEXT`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'`);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users(google_id) WHERE google_id IS NOT NULL`,
  );
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_apple_id_unique ON users(apple_id) WHERE apple_id IS NOT NULL`,
  );

  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (sub, email, name, password_plain, email_verified) VALUES (?, ?, ?, ?, 1)`,
  );
  insert.run("dev-user-1", "dev@trefolio.test", "Dev User", "password123");
  insert.run("dev-user-2", "free@trefolio.test", "Free User", "password123");
  db.prepare(
    `INSERT OR IGNORE INTO entitlements (sub, plan, pro_until, source) VALUES (?, 'pro', ?, 'dev-grant')`,
  ).run(
    "dev-user-1",
    new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
  );
  db.prepare(`INSERT OR IGNORE INTO entitlements (sub, plan) VALUES (?, 'free')`).run("dev-user-2");

  sqliteDb = db;
  return sqliteDb;
}

export async function listUsersWithEntitlements(): Promise<SeedUserRow[]> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT u.sub, u.email, u.name, e.plan, e.pro_until
       FROM users u
       LEFT JOIN entitlements e ON e.sub = u.sub
       ORDER BY u.created_at`,
    );
    return rows.map((row: any) => ({
      sub: String(row.sub),
      email: String(row.email),
      name: row.name ?? null,
      plan: (row.plan as "free" | "pro" | null) ?? null,
      pro_until: toIsoString(row.pro_until),
    }));
  }

  const rows = getSqliteDb()
    .prepare(
      `SELECT u.sub, u.email, u.name, e.plan, e.pro_until
       FROM users u
       LEFT JOIN entitlements e ON e.sub = u.sub
       ORDER BY u.created_at`,
    )
    .all() as any[];
  return rows.map((row) => ({
    sub: String(row.sub),
    email: String(row.email),
    name: row.name ?? null,
    plan: (row.plan as "free" | "pro" | null) ?? null,
    pro_until: toIsoString(row.pro_until),
  }));
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const normalized = email.trim().toLowerCase();
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
       FROM users WHERE email = $1`,
      [normalized],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
       FROM users WHERE email = ?`,
    )
    .get(normalized) as any;
  return row ? sqliteRowToUser(row) : null;
}

export async function findUserByGoogleId(googleId: string): Promise<DbUser | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
       FROM users WHERE google_id = $1`,
      [googleId],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }
  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
       FROM users WHERE google_id = ?`,
    )
    .get(googleId) as any;
  return row ? sqliteRowToUser(row) : null;
}

export async function findUserBySub(sub: string): Promise<DbUser | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
       FROM users WHERE sub = $1`,
      [sub],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
       FROM users WHERE sub = ?`,
    )
    .get(sub) as any;
  return row ? sqliteRowToUser(row) : null;
}

export async function getEntitlement(
  sub: string,
): Promise<{ plan: string; pro_until: string | null; source: string | null }> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT plan, pro_until, source FROM entitlements WHERE sub = $1`,
      [sub],
    );
    const row = rows[0];
    if (!row) return { plan: "free", pro_until: null, source: null };
    return {
      plan: String(row.plan ?? "free"),
      pro_until: toIsoString(row.pro_until),
      source: row.source ?? null,
    };
  }

  const row = getSqliteDb()
    .prepare(`SELECT plan, pro_until, source FROM entitlements WHERE sub = ?`)
    .get(sub) as any;
  return row
    ? {
        plan: String(row.plan ?? "free"),
        pro_until: toIsoString(row.pro_until),
        source: row.source ?? null,
      }
    : { plan: "free", pro_until: null, source: null };
}

export async function setPlan(
  sub: string,
  plan: "free" | "pro",
  proUntilIso: string | null,
  source: string = "dev-toggle",
): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO entitlements (sub, plan, pro_until, source, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (sub)
       DO UPDATE SET plan = EXCLUDED.plan, pro_until = EXCLUDED.pro_until, source = EXCLUDED.source, updated_at = NOW()`,
      [sub, plan, proUntilIso, source],
    );
    return;
  }

  getSqliteDb()
    .prepare(
      `INSERT INTO entitlements (sub, plan, pro_until, source, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(sub) DO UPDATE SET plan = excluded.plan, pro_until = excluded.pro_until, source = excluded.source, updated_at = datetime('now')`,
    )
    .run(sub, plan, proUntilIso, source);
}

export async function createUser(args: {
  email: string;
  name: string;
  passwordPlain?: string;
  passwordHash?: string;
  googleId?: string;
  appleId?: string;
  emailVerified?: boolean;
  locale?: string;
}): Promise<DbUser> {
  const sub = newSub();
  const email = args.email.trim().toLowerCase();
  const passwordPlain = args.passwordPlain ?? "";
  const passwordHash = args.passwordHash ?? "";
  const locale = normalizeIdpLocale(args.locale);

  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `INSERT INTO users (
        sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale`,
      [
        sub,
        email,
        args.name,
        passwordPlain,
        passwordHash,
        args.googleId ?? null,
        args.appleId ?? null,
        Boolean(args.emailVerified),
        locale,
      ],
    );
    await getPool().query(
      `INSERT INTO entitlements (sub, plan) VALUES ($1, 'free')
       ON CONFLICT (sub) DO NOTHING`,
      [sub],
    );
    return pgRowToUser(rows[0]);
  }

  getSqliteDb()
    .prepare(
      `INSERT INTO users (
        sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sub,
      email,
      args.name,
      passwordPlain,
      passwordHash,
      args.googleId ?? null,
      args.appleId ?? null,
      args.emailVerified ? 1 : 0,
      locale,
    );
  getSqliteDb().prepare(`INSERT INTO entitlements (sub, plan) VALUES (?, 'free')`).run(sub);
  return {
    sub,
    email,
    name: args.name,
    password_plain: passwordPlain,
    password_hash: passwordHash,
    google_id: args.googleId ?? null,
    apple_id: args.appleId ?? null,
    email_verified: args.emailVerified ? 1 : 0,
    locale,
  };
}

export async function updateUserBySub(
  sub: string,
  patch: Partial<
    Pick<
      DbUser,
      | "name"
      | "password_plain"
      | "password_hash"
      | "google_id"
      | "apple_id"
      | "email_verified"
      | "locale"
    >
  >,
): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const sets: string[] = [];
    const values: Array<string | number | boolean | null> = [];
    if (patch.name !== undefined) {
      values.push(patch.name);
      sets.push(`name = $${values.length}`);
    }
    if (patch.password_plain !== undefined) {
      values.push(patch.password_plain);
      sets.push(`password_plain = $${values.length}`);
    }
    if (patch.password_hash !== undefined) {
      values.push(patch.password_hash);
      sets.push(`password_hash = $${values.length}`);
    }
    if (patch.google_id !== undefined) {
      values.push(patch.google_id);
      sets.push(`google_id = $${values.length}`);
    }
    if (patch.apple_id !== undefined) {
      values.push(patch.apple_id);
      sets.push(`apple_id = $${values.length}`);
    }
    if (patch.email_verified !== undefined) {
      values.push(Boolean(patch.email_verified));
      sets.push(`email_verified = $${values.length}`);
    }
    if (patch.locale !== undefined) {
      values.push(patch.locale);
      sets.push(`locale = $${values.length}`);
    }
    if (sets.length === 0) return;
    values.push(sub);
    await getPool().query(
      `UPDATE users SET ${sets.join(", ")} WHERE sub = $${values.length}`,
      values,
    );
    return;
  }

  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.password_plain !== undefined) {
    sets.push("password_plain = ?");
    args.push(patch.password_plain);
  }
  if (patch.password_hash !== undefined) {
    sets.push("password_hash = ?");
    args.push(patch.password_hash);
  }
  if (patch.google_id !== undefined) {
    sets.push("google_id = ?");
    args.push(patch.google_id);
  }
  if (patch.apple_id !== undefined) {
    sets.push("apple_id = ?");
    args.push(patch.apple_id);
  }
  if (patch.email_verified !== undefined) {
    sets.push("email_verified = ?");
    args.push(patch.email_verified);
  }
  if (patch.locale !== undefined) {
    sets.push("locale = ?");
    args.push(patch.locale);
  }
  if (sets.length === 0) return;
  args.push(sub);
  getSqliteDb()
    .prepare(`UPDATE users SET ${sets.join(", ")} WHERE sub = ?`)
    .run(...args);
}

export async function saveAuthCode(args: {
  code: string;
  sub: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  nonce?: string | null;
  scope?: string;
}): Promise<void> {
  const expiresAt = Date.now() + 60_000;
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO auth_codes (
        code, sub, client_id, redirect_uri, code_challenge, code_challenge_method, nonce, scope, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        args.code,
        args.sub,
        args.clientId,
        args.redirectUri,
        args.codeChallenge,
        args.codeChallengeMethod,
        args.nonce ?? null,
        args.scope ?? "openid email profile",
        expiresAt,
      ],
    );
    return;
  }

  getSqliteDb()
    .prepare(
      `INSERT INTO auth_codes (code, sub, client_id, redirect_uri, code_challenge, code_challenge_method, nonce, scope, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.code,
      args.sub,
      args.clientId,
      args.redirectUri,
      args.codeChallenge,
      args.codeChallengeMethod,
      args.nonce ?? null,
      args.scope ?? "openid email profile",
      expiresAt,
    );
}

export async function consumeAuthCode(code: string): Promise<
  | {
      sub: string;
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      code_challenge_method: string;
      nonce: string | null;
      scope: string;
    }
  | null
> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT sub, client_id, redirect_uri, code_challenge, code_challenge_method, nonce, scope, expires_at, used
         FROM auth_codes WHERE code = $1 FOR UPDATE`,
        [code],
      );
      const row = rows[0];
      if (!row || row.used || Number(row.expires_at) < Date.now()) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(`UPDATE auth_codes SET used = TRUE WHERE code = $1`, [code]);
      await client.query("COMMIT");
      return {
        sub: String(row.sub),
        client_id: String(row.client_id),
        redirect_uri: String(row.redirect_uri),
        code_challenge: String(row.code_challenge),
        code_challenge_method: String(row.code_challenge_method),
        nonce: row.nonce ?? null,
        scope: String(row.scope ?? "openid email profile"),
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare(
      `SELECT sub, client_id, redirect_uri, code_challenge, code_challenge_method, nonce, scope, expires_at, used FROM auth_codes WHERE code = ?`,
    )
    .get(code) as any;
  if (!row) return null;
  if (row.used) return null;
  if (Number(row.expires_at) < Date.now()) return null;
  db.prepare(`UPDATE auth_codes SET used = 1 WHERE code = ?`).run(code);
  return {
    sub: String(row.sub),
    client_id: String(row.client_id),
    redirect_uri: String(row.redirect_uri),
    code_challenge: String(row.code_challenge),
    code_challenge_method: String(row.code_challenge_method),
    nonce: row.nonce ?? null,
    scope: String(row.scope ?? "openid email profile"),
  };
}

export async function linkTelegram(tgUserId: string, sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO telegram_links (tg_user_id, sub)
       VALUES ($1, $2)
       ON CONFLICT (tg_user_id) DO UPDATE SET sub = EXCLUDED.sub, verified_at = NOW()`,
      [tgUserId, sub],
    );
    return;
  }

  getSqliteDb()
    .prepare(
      `INSERT INTO telegram_links (tg_user_id, sub) VALUES (?, ?) ON CONFLICT(tg_user_id) DO UPDATE SET sub = excluded.sub`,
    )
    .run(tgUserId, sub);
}

export async function listUsersForAdmin(args: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminUserListResult> {
  const page = Math.max(0, args.page ?? 0);
  const pageSize = Math.min(200, Math.max(1, args.pageSize ?? 25));
  const offset = page * pageSize;
  const term = (args.search ?? "").trim().toLowerCase();
  const like = term ? `%${term}%` : null;

  if (usePostgres) {
    await ensurePostgresSchema();
    const where = like ? `WHERE LOWER(u.email) LIKE $1 OR LOWER(u.name) LIKE $1 OR u.sub = $1` : "";
    const params: Array<string | number> = like ? [like] : [];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const list = await getPool().query(
      `SELECT u.sub, u.email, u.name, u.google_id, u.apple_id, u.email_verified, u.created_at,
              COALESCE(e.plan, 'free') AS plan, e.pro_until, e.source
       FROM users u LEFT JOIN entitlements e ON e.sub = u.sub
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, pageSize, offset],
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::bigint AS n FROM users u ${where}`,
      params,
    );
    return {
      users: list.rows.map((row: any) => ({
        sub: String(row.sub),
        email: String(row.email),
        name: String(row.name ?? ""),
        plan: row.plan === "pro" ? "pro" : "free",
        pro_until: toIsoString(row.pro_until),
        source: row.source ?? null,
        google_id: row.google_id ?? null,
        apple_id: row.apple_id ?? null,
        email_verified: row.email_verified ? 1 : 0,
        created_at: toIsoString(row.created_at),
      })),
      total: Number(count.rows[0]?.n ?? 0),
      page,
      pageSize,
    };
  }

  const db = getSqliteDb();
  const where = like ? `WHERE LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ? OR u.sub = ?` : "";
  const whereArgs: Array<string | number> = like ? [like, like, term] : [];
  const rows = db
    .prepare(
      `SELECT u.sub, u.email, u.name, u.google_id, u.apple_id, u.email_verified, u.created_at,
              COALESCE(e.plan, 'free') AS plan, e.pro_until, e.source
       FROM users u LEFT JOIN entitlements e ON e.sub = u.sub
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...whereArgs, pageSize, offset) as any[];
  const total = (db
    .prepare(`SELECT COUNT(*) AS n FROM users u ${where}`)
    .get(...whereArgs) as any)?.n ?? 0;
  return {
    users: rows.map((row) => ({
      sub: String(row.sub),
      email: String(row.email),
      name: String(row.name ?? ""),
      plan: row.plan === "pro" ? "pro" : "free",
      pro_until: toIsoString(row.pro_until),
      source: row.source ?? null,
      google_id: row.google_id ?? null,
      apple_id: row.apple_id ?? null,
      email_verified: row.email_verified ? 1 : 0,
      created_at: toIsoString(row.created_at),
    })),
    total: Number(total),
    page,
    pageSize,
  };
}

export async function getAdminUserDetail(sub: string): Promise<AdminUserRow | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT u.sub, u.email, u.name, u.google_id, u.apple_id, u.email_verified, u.created_at,
              COALESCE(e.plan, 'free') AS plan, e.pro_until, e.source
       FROM users u LEFT JOIN entitlements e ON e.sub = u.sub
       WHERE u.sub = $1`,
      [sub],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      sub: String(row.sub),
      email: String(row.email),
      name: String(row.name ?? ""),
      plan: row.plan === "pro" ? "pro" : "free",
      pro_until: toIsoString(row.pro_until),
      source: row.source ?? null,
      google_id: row.google_id ?? null,
      apple_id: row.apple_id ?? null,
      email_verified: row.email_verified ? 1 : 0,
      created_at: toIsoString(row.created_at),
    };
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT u.sub, u.email, u.name, u.google_id, u.apple_id, u.email_verified, u.created_at,
              COALESCE(e.plan, 'free') AS plan, e.pro_until, e.source
       FROM users u LEFT JOIN entitlements e ON e.sub = u.sub
       WHERE u.sub = ?`,
    )
    .get(sub) as any;
  if (!row) return null;
  return {
    sub: String(row.sub),
    email: String(row.email),
    name: String(row.name ?? ""),
    plan: row.plan === "pro" ? "pro" : "free",
    pro_until: toIsoString(row.pro_until),
    source: row.source ?? null,
    google_id: row.google_id ?? null,
    apple_id: row.apple_id ?? null,
    email_verified: row.email_verified ? 1 : 0,
    created_at: toIsoString(row.created_at),
  };
}

export async function deleteUserBySub(sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(`DELETE FROM entitlements WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM telegram_links WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM auth_codes WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM passkeys WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM users WHERE sub = $1`, [sub]);
    return;
  }
  const db = getSqliteDb();
  db.prepare(`DELETE FROM entitlements WHERE sub = ?`).run(sub);
  db.prepare(`DELETE FROM telegram_links WHERE sub = ?`).run(sub);
  db.prepare(`DELETE FROM auth_codes WHERE sub = ?`).run(sub);
  db.prepare(`DELETE FROM passkeys WHERE sub = ?`).run(sub);
  db.prepare(`DELETE FROM users WHERE sub = ?`).run(sub);
}

export interface DbPasskey {
  id: string;
  sub: string;
  public_key: string;
  counter: number;
  transports: string[];
  backed_up: boolean;
  device_name: string;
  created_at: string | null;
  last_used_at: string | null;
}

function rowToPasskey(row: any): DbPasskey {
  return {
    id: String(row.id),
    sub: String(row.sub),
    public_key: String(row.public_key),
    counter: Number(row.counter ?? 0),
    transports: String(row.transports ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    backed_up: row.backed_up === 1 || row.backed_up === true,
    device_name: String(row.device_name ?? ""),
    created_at: toIsoString(row.created_at),
    last_used_at: toIsoString(row.last_used_at),
  };
}

export async function insertPasskey(args: {
  id: string;
  sub: string;
  publicKey: string;
  counter: number;
  transports: string[];
  backedUp: boolean;
  deviceName?: string;
}): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO passkeys (id, sub, public_key, counter, transports, backed_up, device_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        args.id,
        args.sub,
        args.publicKey,
        args.counter,
        args.transports.join(","),
        args.backedUp,
        args.deviceName ?? "",
      ],
    );
    return;
  }
  getSqliteDb()
    .prepare(
      `INSERT OR IGNORE INTO passkeys (id, sub, public_key, counter, transports, backed_up, device_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.id,
      args.sub,
      args.publicKey,
      args.counter,
      args.transports.join(","),
      args.backedUp ? 1 : 0,
      args.deviceName ?? "",
    );
}

export async function findPasskeyById(id: string): Promise<DbPasskey | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT * FROM passkeys WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToPasskey(rows[0]) : null;
  }
  const row = getSqliteDb()
    .prepare(`SELECT * FROM passkeys WHERE id = ?`)
    .get(id) as any;
  return row ? rowToPasskey(row) : null;
}

export async function listPasskeysForSub(sub: string): Promise<DbPasskey[]> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT * FROM passkeys WHERE sub = $1 ORDER BY created_at DESC`,
      [sub],
    );
    return rows.map(rowToPasskey);
  }
  const rows = getSqliteDb()
    .prepare(`SELECT * FROM passkeys WHERE sub = ? ORDER BY created_at DESC`)
    .all(sub) as any[];
  return rows.map(rowToPasskey);
}

export async function updatePasskeyCounter(
  id: string,
  counter: number,
): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `UPDATE passkeys SET counter = $1, last_used_at = NOW() WHERE id = $2`,
      [counter, id],
    );
    return;
  }
  getSqliteDb()
    .prepare(
      `UPDATE passkeys SET counter = ?, last_used_at = datetime('now') WHERE id = ?`,
    )
    .run(counter, id);
}

export async function deletePasskey(id: string, sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(`DELETE FROM passkeys WHERE id = $1 AND sub = $2`, [
      id,
      sub,
    ]);
    return;
  }
  getSqliteDb()
    .prepare(`DELETE FROM passkeys WHERE id = ? AND sub = ?`)
    .run(id, sub);
}

export async function renamePasskey(
  id: string,
  sub: string,
  deviceName: string,
): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `UPDATE passkeys SET device_name = $1 WHERE id = $2 AND sub = $3`,
      [deviceName, id, sub],
    );
    return;
  }
  getSqliteDb()
    .prepare(`UPDATE passkeys SET device_name = ? WHERE id = ? AND sub = ?`)
    .run(deviceName, id, sub);
}

export async function findSubByTelegramId(tgUserId: string): Promise<string | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub FROM telegram_links WHERE tg_user_id = $1`,
      [tgUserId],
    );
    return rows[0]?.sub ? String(rows[0].sub) : null;
  }

  const row = getSqliteDb()
    .prepare(`SELECT sub FROM telegram_links WHERE tg_user_id = ?`)
    .get(tgUserId) as any;
  return row?.sub ?? null;
}

export interface DbStripeCustomer {
  sub: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export async function getStripeCustomerBySub(sub: string): Promise<DbStripeCustomer | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end
       FROM stripe_customers WHERE sub = $1`,
      [sub],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      sub: String(row.sub),
      stripe_customer_id: String(row.stripe_customer_id),
      stripe_subscription_id: row.stripe_subscription_id ?? null,
      current_period_end: toIsoString(row.current_period_end),
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
    };
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT sub, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end
       FROM stripe_customers WHERE sub = ?`,
    )
    .get(sub) as any;
  if (!row) return null;
  return {
    sub: String(row.sub),
    stripe_customer_id: String(row.stripe_customer_id),
    stripe_subscription_id: row.stripe_subscription_id ?? null,
    current_period_end: toIsoString(row.current_period_end),
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
  };
}

export async function findSubByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub FROM stripe_customers WHERE stripe_customer_id = $1`,
      [stripeCustomerId],
    );
    return rows[0]?.sub ? String(rows[0].sub) : null;
  }

  const row = getSqliteDb()
    .prepare(`SELECT sub FROM stripe_customers WHERE stripe_customer_id = ?`)
    .get(stripeCustomerId) as any;
  return row?.sub ?? null;
}

export async function upsertStripeCustomerRow(args: {
  sub: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const cpe =
    args.currentPeriodEnd instanceof Date
      ? args.currentPeriodEnd.toISOString()
      : args.currentPeriodEnd ?? null;
  const cancel = Boolean(args.cancelAtPeriodEnd);

  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO stripe_customers (sub, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (sub) DO UPDATE SET
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, stripe_customers.stripe_subscription_id),
         current_period_end = COALESCE(EXCLUDED.current_period_end, stripe_customers.current_period_end),
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         updated_at = NOW()`,
      [
        args.sub,
        args.stripeCustomerId,
        args.stripeSubscriptionId ?? null,
        cpe,
        cancel,
      ],
    );
    return;
  }

  getSqliteDb()
    .prepare(
      `INSERT INTO stripe_customers (sub, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(sub) DO UPDATE SET
         stripe_customer_id = excluded.stripe_customer_id,
         stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, stripe_subscription_id),
         current_period_end = COALESCE(excluded.current_period_end, current_period_end),
         cancel_at_period_end = excluded.cancel_at_period_end,
         updated_at = datetime('now')`,
    )
    .run(
      args.sub,
      args.stripeCustomerId,
      args.stripeSubscriptionId ?? null,
      cpe,
      cancel ? 1 : 0,
    );
}
