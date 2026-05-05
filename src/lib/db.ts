import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";

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
}

export interface SeedUserRow {
  sub: string;
  email: string;
  name: string | null;
  plan: "free" | "pro" | null;
  pro_until: string | null;
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
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
  `);
  safeAlter(db, `ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN google_id TEXT`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN apple_id TEXT`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
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
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified
       FROM users WHERE email = $1`,
      [normalized],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified
       FROM users WHERE email = ?`,
    )
    .get(normalized) as any;
  return row ? sqliteRowToUser(row) : null;
}

export async function findUserBySub(sub: string): Promise<DbUser | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified
       FROM users WHERE sub = $1`,
      [sub],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified
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
): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO entitlements (sub, plan, pro_until, source, updated_at)
       VALUES ($1, $2, $3, 'dev-toggle', NOW())
       ON CONFLICT (sub)
       DO UPDATE SET plan = EXCLUDED.plan, pro_until = EXCLUDED.pro_until, source = EXCLUDED.source, updated_at = NOW()`,
      [sub, plan, proUntilIso],
    );
    return;
  }

  getSqliteDb()
    .prepare(
      `INSERT INTO entitlements (sub, plan, pro_until, source, updated_at)
       VALUES (?, ?, ?, 'dev-toggle', datetime('now'))
       ON CONFLICT(sub) DO UPDATE SET plan = excluded.plan, pro_until = excluded.pro_until, source = excluded.source, updated_at = datetime('now')`,
    )
    .run(sub, plan, proUntilIso);
}

export async function createUser(args: {
  email: string;
  name: string;
  passwordPlain?: string;
  passwordHash?: string;
  googleId?: string;
  appleId?: string;
  emailVerified?: boolean;
}): Promise<DbUser> {
  const sub = newSub();
  const email = args.email.trim().toLowerCase();
  const passwordPlain = args.passwordPlain ?? "";
  const passwordHash = args.passwordHash ?? "";

  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `INSERT INTO users (
        sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified`,
      [
        sub,
        email,
        args.name,
        passwordPlain,
        passwordHash,
        args.googleId ?? null,
        args.appleId ?? null,
        Boolean(args.emailVerified),
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
        sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
