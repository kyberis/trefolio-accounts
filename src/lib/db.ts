import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";

import { normalizeIdpLocale } from "@/lib/i18n/idp-locale";
import {
  inferIdpSignupAuthProvider,
  notifyAdminOfNewIdpUser,
} from "@/lib/idp-admin-new-user-notify";

const postgresUrl = process.env.DATABASE_URL ?? "";
const usePostgres =
  postgresUrl.startsWith("postgresql://") ||
  postgresUrl.startsWith("postgres://");

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let pgSchemaReady: Promise<void> | null = null;

/**
 * Hosted Postgres URLs often include `?sslmode=require` (Turso, Vercel, etc.).
 * `pg` v8+ emits a startup warning because `require`/`prefer`/`verify-ca` are
 * temporary aliases for `verify-full` until pg v9. We strip `sslmode` (and
 * redundant client-cert query params) because TLS is already set on the Pool
 * via `ssl: { rejectUnauthorized: false }` — same behavior, no warning.
 */
function postgresConnectionStringForPool(): string {
  const raw = postgresUrl.trim();
  if (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://")) {
    return raw;
  }
  try {
    const u = new URL(raw);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("sslcert");
    u.searchParams.delete("sslkey");
    u.searchParams.delete("sslrootcert");
    let out = u.toString();
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out;
  } catch {
    return raw;
  }
}

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
  /** Profile image URL; surfaced as OIDC `picture`. */
  avatar_url: string;
  /** ISO 3166-1 alpha-2 country code for tax residency (optional). */
  tax_residency: string;
  /**
   * Platform staff — may link the business ops Telegram bot from /account.
   * IdP env admins (`IDP_ADMIN_EMAILS`) are always treated as staff for linking.
   */
  is_staff: number;
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
  /** 1 = may use business ops Telegram from account hub. */
  is_staff: number;
  created_at: string | null;
  /** Password / passkey sign-in attempts (success + failure). */
  idp_auth_attempts: number;
  /** Subset of attempts that failed (wrong password, bad passkey, etc.). */
  idp_auth_failures: number;
  /** Pending complimentary membership invitation (email + activate). */
  membership_grant_pending: boolean;
  membership_grant_days: number | null;
  membership_grant_created_at: string | null;
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
    avatar_url: String(row.avatar_url ?? ""),
    tax_residency: String(row.tax_residency ?? ""),
    is_staff: Number(row.is_staff ?? 0) ? 1 : 0,
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
    avatar_url: String(row.avatar_url ?? ""),
    tax_residency: String(row.tax_residency ?? ""),
    is_staff: row.is_staff ? 1 : 0,
  };
}

function getPool(): Pool {
  if (!postgresUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: postgresConnectionStringForPool(),
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
        CREATE TABLE IF NOT EXISTS oauth_token_replays (
          code TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          redirect_uri TEXT NOT NULL,
          verifier_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          expires_at BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS telegram_links (
          tg_user_id TEXT PRIMARY KEY,
          sub TEXT NOT NULL,
          verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS ops_telegram_links (
          tg_user_id TEXT PRIMARY KEY,
          sub TEXT NOT NULL,
          verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS ops_telegram_link_codes (
          code TEXT PRIMARY KEY,
          sub TEXT NOT NULL,
          expires_at BIGINT NOT NULL,
          used BOOLEAN NOT NULL DEFAULT FALSE
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
        ALTER TABLE users ADD COLUMN IF NOT EXISTS idp_auth_attempts BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS idp_auth_failures BIGINT NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS stripe_customers (
          sub TEXT PRIMARY KEY REFERENCES users(sub) ON DELETE CASCADE,
          stripe_customer_id TEXT NOT NULL UNIQUE,
          stripe_subscription_id TEXT,
          current_period_end TIMESTAMPTZ,
          cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS subscription_checkout_intents (
          id BIGSERIAL PRIMARY KEY,
          sub TEXT NOT NULL,
          from_app TEXT NOT NULL DEFAULT '',
          interval_hint TEXT,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS subscription_checkout_intents_created_idx
          ON subscription_checkout_intents (created_at DESC);
        CREATE TABLE IF NOT EXISTS personal_access_tokens (
          id TEXT PRIMARY KEY,
          sub TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          prefix TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS personal_access_tokens_sub_idx
          ON personal_access_tokens (sub);
        ALTER TABLE personal_access_tokens ADD COLUMN IF NOT EXISTS scopes_json TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_grant_token TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_grant_plan TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_grant_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_grant_created_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_token TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_invited_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_activated_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_residency TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT FALSE;
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
    CREATE TABLE IF NOT EXISTS oauth_token_replays (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      verifier_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telegram_links (
      tg_user_id TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      verified_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ops_telegram_links (
      tg_user_id TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      verified_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ops_telegram_link_codes (
      code TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
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
    CREATE TABLE IF NOT EXISTS subscription_checkout_intents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sub TEXT NOT NULL,
      from_app TEXT NOT NULL DEFAULT '',
      interval_hint TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS subscription_checkout_intents_created_idx
      ON subscription_checkout_intents (created_at DESC);
    CREATE TABLE IF NOT EXISTS personal_access_tokens (
      id TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      expires_at TEXT,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS personal_access_tokens_sub_idx
      ON personal_access_tokens (sub);
  `);
  safeAlter(db, `ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN google_id TEXT`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN apple_id TEXT`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN idp_auth_attempts INTEGER NOT NULL DEFAULT 0`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN idp_auth_failures INTEGER NOT NULL DEFAULT 0`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN membership_grant_token TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN membership_grant_plan TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN membership_grant_days INTEGER NOT NULL DEFAULT 0`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN membership_grant_created_at TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN trial_token TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN trial_invited_at TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN trial_activated_at TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN tax_residency TEXT NOT NULL DEFAULT ''`);
  safeAlter(db, `ALTER TABLE users ADD COLUMN is_staff INTEGER NOT NULL DEFAULT 0`);
  safeAlter(db, `ALTER TABLE personal_access_tokens ADD COLUMN scopes_json TEXT`);
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

/** Successful password check at /oauth2/authorize or successful passkey verify. */
export async function recordIdpAuthAttemptSuccess(sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `UPDATE users SET idp_auth_attempts = idp_auth_attempts + 1 WHERE sub = $1`,
      [sub],
    );
    return;
  }
  getSqliteDb()
    .prepare(`UPDATE users SET idp_auth_attempts = idp_auth_attempts + 1 WHERE sub = ?`)
    .run(sub);
}

/** Wrong password or failed passkey verification for an existing IdP user. */
export async function recordIdpAuthAttemptFailure(sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `UPDATE users SET idp_auth_attempts = idp_auth_attempts + 1, idp_auth_failures = idp_auth_failures + 1 WHERE sub = $1`,
      [sub],
    );
    return;
  }
  getSqliteDb()
    .prepare(
      `UPDATE users SET idp_auth_attempts = idp_auth_attempts + 1, idp_auth_failures = idp_auth_failures + 1 WHERE sub = ?`,
    )
    .run(sub);
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
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
       FROM users WHERE lower(email) = $1`,
      [normalized],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
       FROM users WHERE lower(email) = ?`,
    )
    .get(normalized) as any;
  return row ? sqliteRowToUser(row) : null;
}

export async function findUserByGoogleId(googleId: string): Promise<DbUser | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
       FROM users WHERE google_id = $1`,
      [googleId],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }
  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
       FROM users WHERE google_id = ?`,
    )
    .get(googleId) as any;
  return row ? sqliteRowToUser(row) : null;
}

export async function findUserBySub(sub: string): Promise<DbUser | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
       FROM users WHERE sub = $1`,
      [sub],
    );
    return rows[0] ? pgRowToUser(rows[0]) : null;
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
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
  avatarUrl?: string;
  taxResidency?: string;
}): Promise<DbUser> {
  const sub = newSub();
  const email = args.email.trim().toLowerCase();
  const passwordPlain = args.passwordPlain ?? "";
  const passwordHash = args.passwordHash ?? "";
  const locale = normalizeIdpLocale(args.locale);
  const avatarUrl = args.avatarUrl ?? "";
  const taxResidency = args.taxResidency ?? "";

  let created: DbUser;

  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `INSERT INTO users (
        sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff`,
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
        args.avatarUrl ?? "",
        args.taxResidency ?? "",
        false,
      ],
    );
    await getPool().query(
      `INSERT INTO entitlements (sub, plan) VALUES ($1, 'free')
       ON CONFLICT (sub) DO NOTHING`,
      [sub],
    );
    created = pgRowToUser(rows[0]);
  } else {
    getSqliteDb()
      .prepare(
        `INSERT INTO users (
        sub, email, name, password_plain, password_hash, google_id, apple_id, email_verified, locale, avatar_url, tax_residency, is_staff
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        avatarUrl,
        taxResidency,
        0,
      );
    getSqliteDb().prepare(`INSERT INTO entitlements (sub, plan) VALUES (?, 'free')`).run(sub);
    created = {
      sub,
      email,
      name: args.name,
      password_plain: passwordPlain,
      password_hash: passwordHash,
      google_id: args.googleId ?? null,
      apple_id: args.appleId ?? null,
      email_verified: args.emailVerified ? 1 : 0,
      locale,
      avatar_url: avatarUrl,
      tax_residency: taxResidency,
      is_staff: 0,
    };
  }

  notifyAdminOfNewIdpUser({
    sub: created.sub,
    email: created.email,
    name: created.name,
    authProvider: inferIdpSignupAuthProvider(args),
  });

  return created;
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
      | "avatar_url"
      | "tax_residency"
      | "is_staff"
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
    if (patch.avatar_url !== undefined) {
      values.push(patch.avatar_url);
      sets.push(`avatar_url = $${values.length}`);
    }
    if (patch.tax_residency !== undefined) {
      values.push(patch.tax_residency);
      sets.push(`tax_residency = $${values.length}`);
    }
    if (patch.is_staff !== undefined) {
      values.push(Boolean(patch.is_staff));
      sets.push(`is_staff = $${values.length}`);
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
  if (patch.avatar_url !== undefined) {
    sets.push("avatar_url = ?");
    args.push(patch.avatar_url);
  }
  if (patch.tax_residency !== undefined) {
    sets.push("tax_residency = ?");
    args.push(patch.tax_residency);
  }
  if (patch.is_staff !== undefined) {
    sets.push("is_staff = ?");
    args.push(patch.is_staff ? 1 : 0);
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
  /** OAuth authz codes should be short-lived (RFC 6749); 60s was too tight for IdP→Google→IdP→app + serverless latency. */
  const expiresAt = Date.now() + 10 * 60_000;
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

/** PKCE verifier hash for idempotent duplicate token POSTs (OAuth code single-use + flaky retries). */
export function hashPkceVerifier(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export type ConsumedAuthCode = {
  sub: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  nonce: string | null;
  scope: string;
};

export type ConsumeAuthCodeResult =
  | { ok: true; stored: ConsumedAuthCode }
  | { ok: false; reason: "not_found" | "already_used" | "expired" };

export async function consumeAuthCode(code: string): Promise<ConsumeAuthCodeResult> {
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
      if (!row) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "not_found" };
      }
      if (row.used) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "already_used" };
      }
      if (Number(row.expires_at) < Date.now()) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "expired" };
      }
      await client.query(`UPDATE auth_codes SET used = TRUE WHERE code = $1`, [code]);
      await client.query("COMMIT");
      return {
        ok: true,
        stored: {
          sub: String(row.sub),
          client_id: String(row.client_id),
          redirect_uri: String(row.redirect_uri),
          code_challenge: String(row.code_challenge),
          code_challenge_method: String(row.code_challenge_method),
          nonce: row.nonce ?? null,
          scope: String(row.scope ?? "openid email profile"),
        },
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
  if (!row) return { ok: false, reason: "not_found" };
  if (row.used) return { ok: false, reason: "already_used" };
  if (Number(row.expires_at) < Date.now()) return { ok: false, reason: "expired" };
  db.prepare(`UPDATE auth_codes SET used = 1 WHERE code = ?`).run(code);
  return {
    ok: true,
    stored: {
      sub: String(row.sub),
      client_id: String(row.client_id),
      redirect_uri: String(row.redirect_uri),
      code_challenge: String(row.code_challenge),
      code_challenge_method: String(row.code_challenge_method),
      nonce: row.nonce ?? null,
      scope: String(row.scope ?? "openid email profile"),
    },
  };
}

export async function saveOAuthTokenReplay(args: {
  code: string;
  clientId: string;
  redirectUri: string;
  verifierHash: string;
  responseJson: string;
  expiresAt: number;
}): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO oauth_token_replays (code, client_id, redirect_uri, verifier_hash, response_json, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         redirect_uri = EXCLUDED.redirect_uri,
         verifier_hash = EXCLUDED.verifier_hash,
         response_json = EXCLUDED.response_json,
         expires_at = EXCLUDED.expires_at`,
      [
        args.code,
        args.clientId,
        args.redirectUri,
        args.verifierHash,
        args.responseJson,
        args.expiresAt,
      ],
    );
    return;
  }
  getSqliteDb()
    .prepare(
      `INSERT INTO oauth_token_replays (code, client_id, redirect_uri, verifier_hash, response_json, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         client_id = excluded.client_id,
         redirect_uri = excluded.redirect_uri,
         verifier_hash = excluded.verifier_hash,
         response_json = excluded.response_json,
         expires_at = excluded.expires_at`,
    )
    .run(
      args.code,
      args.clientId,
      args.redirectUri,
      args.verifierHash,
      args.responseJson,
      args.expiresAt,
    );
}

export async function findMatchingOAuthTokenReplay(args: {
  code: string;
  clientId: string;
  redirectUri: string;
  verifierHash: string;
}): Promise<string | null> {
  const now = Date.now();
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT response_json FROM oauth_token_replays
       WHERE code = $1 AND client_id = $2 AND redirect_uri = $3 AND verifier_hash = $4 AND expires_at > $5`,
      [args.code, args.clientId, args.redirectUri, args.verifierHash, now],
    );
    return rows[0] ? String(rows[0].response_json) : null;
  }
  const row = getSqliteDb()
    .prepare(
      `SELECT response_json FROM oauth_token_replays
       WHERE code = ? AND client_id = ? AND redirect_uri = ? AND verifier_hash = ? AND expires_at > ?`,
    )
    .get(args.code, args.clientId, args.redirectUri, args.verifierHash, now) as
    | { response_json: string }
    | undefined;
  return row ? String(row.response_json) : null;
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
              COALESCE(u.is_staff, false) AS is_staff,
              COALESCE(u.idp_auth_attempts, 0)::bigint AS idp_auth_attempts,
              COALESCE(u.idp_auth_failures, 0)::bigint AS idp_auth_failures,
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
        is_staff: row.is_staff ? 1 : 0,
        created_at: toIsoString(row.created_at),
        idp_auth_attempts: Number(row.idp_auth_attempts ?? 0),
        idp_auth_failures: Number(row.idp_auth_failures ?? 0),
        membership_grant_pending: false,
        membership_grant_days: null,
        membership_grant_created_at: null,
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
              COALESCE(u.is_staff, 0) AS is_staff,
              COALESCE(u.idp_auth_attempts, 0) AS idp_auth_attempts,
              COALESCE(u.idp_auth_failures, 0) AS idp_auth_failures,
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
      is_staff: Number(row.is_staff ?? 0) ? 1 : 0,
      created_at: toIsoString(row.created_at),
      idp_auth_attempts: Number(row.idp_auth_attempts ?? 0),
      idp_auth_failures: Number(row.idp_auth_failures ?? 0),
      membership_grant_pending: false,
      membership_grant_days: null,
      membership_grant_created_at: null,
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
              COALESCE(u.is_staff, false) AS is_staff,
              COALESCE(u.idp_auth_attempts, 0)::bigint AS idp_auth_attempts,
              COALESCE(u.idp_auth_failures, 0)::bigint AS idp_auth_failures,
              COALESCE(u.membership_grant_token, '') AS membership_grant_token,
              COALESCE(u.membership_grant_plan, '') AS membership_grant_plan,
              COALESCE(u.membership_grant_days, 0)::int AS membership_grant_days,
              u.membership_grant_created_at,
              COALESCE(e.plan, 'free') AS plan, e.pro_until, e.source
       FROM users u LEFT JOIN entitlements e ON e.sub = u.sub
       WHERE u.sub = $1`,
      [sub],
    );
    const row = rows[0];
    if (!row) return null;
    const tok = String(row.membership_grant_token ?? "").trim();
    const pending = tok.length > 0;
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
      is_staff: Number(row.is_staff ?? 0) ? 1 : 0,
      created_at: toIsoString(row.created_at),
      idp_auth_attempts: Number(row.idp_auth_attempts ?? 0),
      idp_auth_failures: Number(row.idp_auth_failures ?? 0),
      membership_grant_pending: pending,
      membership_grant_days: pending ? Number(row.membership_grant_days ?? 0) || null : null,
      membership_grant_created_at: pending ? toIsoString(row.membership_grant_created_at) : null,
    };
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT u.sub, u.email, u.name, u.google_id, u.apple_id, u.email_verified, u.created_at,
              COALESCE(u.is_staff, 0) AS is_staff,
              COALESCE(u.idp_auth_attempts, 0) AS idp_auth_attempts,
              COALESCE(u.idp_auth_failures, 0) AS idp_auth_failures,
              COALESCE(u.membership_grant_token, '') AS membership_grant_token,
              COALESCE(u.membership_grant_plan, '') AS membership_grant_plan,
              COALESCE(u.membership_grant_days, 0) AS membership_grant_days,
              u.membership_grant_created_at,
              COALESCE(e.plan, 'free') AS plan, e.pro_until, e.source
       FROM users u LEFT JOIN entitlements e ON e.sub = u.sub
       WHERE u.sub = ?`,
    )
    .get(sub) as any;
  if (!row) return null;
  const tok = String(row.membership_grant_token ?? "").trim();
  const pending = tok.length > 0;
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
    is_staff: Number(row.is_staff ?? 0) ? 1 : 0,
    created_at: toIsoString(row.created_at),
    idp_auth_attempts: Number(row.idp_auth_attempts ?? 0),
    idp_auth_failures: Number(row.idp_auth_failures ?? 0),
    membership_grant_pending: pending,
    membership_grant_days: pending ? Number(row.membership_grant_days ?? 0) || null : null,
    membership_grant_created_at: pending ? toIsoString(row.membership_grant_created_at) : null,
  };
}

export async function deleteUserBySub(sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(`DELETE FROM personal_access_tokens WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM subscription_checkout_intents WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM stripe_customers WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM entitlements WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM ops_telegram_link_codes WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM ops_telegram_links WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM telegram_links WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM auth_codes WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM passkeys WHERE sub = $1`, [sub]);
    await getPool().query(`DELETE FROM users WHERE sub = $1`, [sub]);
    return;
  }
  const db = getSqliteDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM personal_access_tokens WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM subscription_checkout_intents WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM stripe_customers WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM entitlements WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM ops_telegram_link_codes WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM ops_telegram_links WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM telegram_links WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM auth_codes WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM passkeys WHERE sub = ?`).run(sub);
    db.prepare(`DELETE FROM users WHERE sub = ?`).run(sub);
  });
  tx();
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

export const IDP_MEMBERSHIP_GRANT_MIN_DAYS = 1;
export const IDP_MEMBERSHIP_GRANT_MAX_DAYS = 730;

export async function logSubscriptionCheckoutIntent(args: {
  sub: string;
  fromApp: string;
  intervalHint?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const from = (args.fromApp || "").trim().slice(0, 64);
  const interval = args.intervalHint?.trim().slice(0, 16) ?? null;
  const ua = args.userAgent ? args.userAgent.trim().slice(0, 512) : null;

  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO subscription_checkout_intents (sub, from_app, interval_hint, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [args.sub, from, interval, ua],
    );
    return;
  }

  getSqliteDb()
    .prepare(
      `INSERT INTO subscription_checkout_intents (sub, from_app, interval_hint, user_agent)
       VALUES (?, ?, ?, ?)`,
    )
    .run(args.sub, from, interval, ua);
}

export async function findSubByMembershipGrantToken(
  token: string,
): Promise<string | null> {
  if (!token.trim()) return null;
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT sub FROM users WHERE membership_grant_token = $1 AND membership_grant_token != ''`,
      [token.trim()],
    );
    return rows[0]?.sub ? String(rows[0].sub) : null;
  }
  const row = getSqliteDb()
    .prepare(
      `SELECT sub FROM users WHERE membership_grant_token = ? AND membership_grant_token != ''`,
    )
    .get(token.trim()) as { sub: string } | undefined;
  return row?.sub ? String(row.sub) : null;
}

export async function setPendingMembershipGrantIdp(
  sub: string,
  plan: "pro",
  days: number,
): Promise<{ token: string }> {
  if (days < IDP_MEMBERSHIP_GRANT_MIN_DAYS || days > IDP_MEMBERSHIP_GRANT_MAX_DAYS) {
    throw new Error("invalid_grant_days");
  }
  const token = randomBytes(32).toString("hex");
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `UPDATE users SET
         membership_grant_token = $1,
         membership_grant_plan = $2,
         membership_grant_days = $3,
         membership_grant_created_at = NOW()
       WHERE sub = $4`,
      [token, plan, days, sub],
    );
    return { token };
  }
  getSqliteDb()
    .prepare(
      `UPDATE users SET
         membership_grant_token = ?,
         membership_grant_plan = ?,
         membership_grant_days = ?,
         membership_grant_created_at = datetime('now')
       WHERE sub = ?`,
    )
    .run(token, plan, days, sub);
  return { token };
}

export async function clearMembershipGrantFieldsIdp(sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `UPDATE users SET
         membership_grant_token = '',
         membership_grant_plan = '',
         membership_grant_days = 0,
         membership_grant_created_at = NULL
       WHERE sub = $1`,
      [sub],
    );
    return;
  }
  getSqliteDb()
    .prepare(
      `UPDATE users SET
         membership_grant_token = '',
         membership_grant_plan = '',
         membership_grant_days = 0,
         membership_grant_created_at = ''
       WHERE sub = ?`,
    )
    .run(sub);
}

/**
 * Pro-until for a complimentary grant: stacks on top of existing future pro_until when same tier.
 */
async function computeMembershipGrantProUntil(sub: string, days: number): Promise<string> {
  const ent = await getEntitlement(sub);
  const now = Date.now();
  const ms = days * 86400000;
  if (
    ent.plan === "pro" &&
    ent.pro_until &&
    !Number.isNaN(Date.parse(ent.pro_until)) &&
    new Date(ent.pro_until).getTime() > now
  ) {
    return new Date(new Date(ent.pro_until).getTime() + ms).toISOString();
  }
  return new Date(now + ms).toISOString();
}

export async function applyPendingMembershipGrantIdp(
  sessionSub: string,
  token: string,
): Promise<{ ok: true; proUntil: string } | { ok: false; error: string }> {
  const t = token.trim();
  if (!t) return { ok: false, error: "missing_token" };

  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT membership_grant_token, membership_grant_plan, membership_grant_days
       FROM users WHERE sub = $1`,
      [sessionSub],
    );
    const row = rows[0];
    if (!row || String(row.membership_grant_token ?? "") !== t) {
      return { ok: false, error: "invalid_or_used_token" };
    }
    if (String(row.membership_grant_plan ?? "") !== "pro") {
      return { ok: false, error: "no_pending_grant" };
    }
    const days = Number(row.membership_grant_days ?? 0);
    if (days < IDP_MEMBERSHIP_GRANT_MIN_DAYS || days > IDP_MEMBERSHIP_GRANT_MAX_DAYS) {
      return { ok: false, error: "invalid_grant" };
    }
    const proUntil = await computeMembershipGrantProUntil(sessionSub, days);
    await clearMembershipGrantFieldsIdp(sessionSub);
    await setPlan(sessionSub, "pro", proUntil, "membership-grant");
    return { ok: true, proUntil };
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT membership_grant_token, membership_grant_plan, membership_grant_days FROM users WHERE sub = ?`,
    )
    .get(sessionSub) as any;
  if (!row || String(row.membership_grant_token ?? "") !== t) {
    return { ok: false, error: "invalid_or_used_token" };
  }
  if (String(row.membership_grant_plan ?? "") !== "pro") {
    return { ok: false, error: "no_pending_grant" };
  }
  const days = Number(row.membership_grant_days ?? 0);
  if (days < IDP_MEMBERSHIP_GRANT_MIN_DAYS || days > IDP_MEMBERSHIP_GRANT_MAX_DAYS) {
    return { ok: false, error: "invalid_grant" };
  }
  const proUntil = await computeMembershipGrantProUntil(sessionSub, days);
  await clearMembershipGrantFieldsIdp(sessionSub);
  await setPlan(sessionSub, "pro", proUntil, "membership-grant");
  return { ok: true, proUntil };
}

export type TrialTokenStatusIdp = "valid" | "already_used" | "invalid";

export async function checkTrialTokenIdp(token: string): Promise<TrialTokenStatusIdp> {
  const t = token.trim();
  if (!t) return "invalid";

  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT trial_activated_at FROM users WHERE trial_token = $1 AND trial_token != ''`,
      [t],
    );
    const row = rows[0];
    if (!row) return "invalid";
    const activated = row.trial_activated_at;
    if (activated != null && activated !== "") return "already_used";
    return "valid";
  }

  const row = getSqliteDb()
    .prepare(`SELECT trial_activated_at FROM users WHERE trial_token = ? AND trial_token != ''`)
    .get(t) as { trial_activated_at?: string } | undefined;
  if (!row) return "invalid";
  const activated = String(row.trial_activated_at ?? "").trim();
  return activated !== "" ? "already_used" : "valid";
}

export async function syncTrialTokenFromProductApp(
  email: string,
  trialToken: string,
): Promise<{ ok: true } | { ok: false; error: "user_not_found" }> {
  const normalized = email.trim().toLowerCase();
  const tok = trialToken.trim();
  if (!normalized || !tok) return { ok: false, error: "user_not_found" };

  if (usePostgres) {
    await ensurePostgresSchema();
    const res = await getPool().query(
      `UPDATE users SET
         trial_token = $2,
         trial_invited_at = COALESCE(trial_invited_at, NOW())
       WHERE lower(email) = lower($1)`,
      [normalized, tok],
    );
    if (res.rowCount === 0) return { ok: false, error: "user_not_found" };
    return { ok: true };
  }

  const r = getSqliteDb()
    .prepare(
      `UPDATE users SET trial_token = ?, trial_invited_at = CASE WHEN trial_invited_at = '' THEN datetime('now') ELSE trial_invited_at END
       WHERE lower(email) = lower(?)`,
    )
    .run(tok, normalized);
  if (r.changes === 0) return { ok: false, error: "user_not_found" };
  return { ok: true };
}

export async function activateTrialForSub(
  sub: string,
  token: string,
): Promise<
  | { ok: true; proUntil: string }
  | { ok: false; error: "invalid_token" | "trial_already_activated" | "not_free" }
> {
  const t = token.trim();
  if (!t) return { ok: false, error: "invalid_token" };

  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT trial_token, trial_activated_at FROM users WHERE sub = $1`,
      [sub],
    );
    const row = rows[0];
    if (!row || String(row.trial_token ?? "").trim() !== t) {
      return { ok: false, error: "invalid_token" };
    }
    if (row.trial_activated_at != null) {
      return { ok: false, error: "trial_already_activated" };
    }
  } else {
    const row = getSqliteDb()
      .prepare(`SELECT trial_token, trial_activated_at FROM users WHERE sub = ?`)
      .get(sub) as { trial_token?: string; trial_activated_at?: string } | undefined;
    if (!row || String(row.trial_token ?? "").trim() !== t) {
      return { ok: false, error: "invalid_token" };
    }
    if (String(row.trial_activated_at ?? "").trim() !== "") {
      return { ok: false, error: "trial_already_activated" };
    }
  }

  const ent = await getEntitlement(sub);
  if (ent.plan !== "free") {
    return { ok: false, error: "not_free" };
  }

  const proUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await setPlan(sub, "pro", proUntil, "trial");

  if (usePostgres) {
    await getPool().query(`UPDATE users SET trial_activated_at = NOW() WHERE sub = $1`, [sub]);
  } else {
    getSqliteDb()
      .prepare(`UPDATE users SET trial_activated_at = datetime('now') WHERE sub = ?`)
      .run(sub);
  }

  return { ok: true, proUntil };
}

// ── Ops Telegram (business notifications, staff only) ───────────────────────

const OPS_LINK_CODE_TTL_MS = 15 * 60_000;

export async function mintOpsTelegramLinkCode(sub: string): Promise<{ code: string; expiresAt: number }> {
  const code = randomBytes(9).toString("base64url").replace(/=/g, "");
  const expiresAt = Date.now() + OPS_LINK_CODE_TTL_MS;
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(`DELETE FROM ops_telegram_link_codes WHERE sub = $1`, [sub]);
    await getPool().query(
      `INSERT INTO ops_telegram_link_codes (code, sub, expires_at, used) VALUES ($1, $2, $3, FALSE)`,
      [code, sub, expiresAt],
    );
    return { code, expiresAt };
  }
  const db = getSqliteDb();
  db.prepare(`DELETE FROM ops_telegram_link_codes WHERE sub = ?`).run(sub);
  db.prepare(`INSERT INTO ops_telegram_link_codes (code, sub, expires_at, used) VALUES (?, ?, ?, 0)`).run(
    code,
    sub,
    expiresAt,
  );
  return { code, expiresAt };
}

export type ConsumeOpsTelegramCodeResult =
  | { ok: true; sub: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export async function consumeOpsTelegramLinkCode(rawCode: string, tgUserId: string): Promise<ConsumeOpsTelegramCodeResult> {
  const code = rawCode.trim();
  if (!code) return { ok: false, reason: "invalid" };

  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT sub, expires_at, used FROM ops_telegram_link_codes WHERE code = $1 FOR UPDATE`,
        [code],
      );
      const row = rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "invalid" };
      }
      if (row.used) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "used" };
      }
      if (Number(row.expires_at) < Date.now()) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "expired" };
      }
      await client.query(`UPDATE ops_telegram_link_codes SET used = TRUE WHERE code = $1`, [code]);
      await client.query(
        `INSERT INTO ops_telegram_links (tg_user_id, sub)
         VALUES ($1, $2)
         ON CONFLICT (tg_user_id) DO UPDATE SET sub = EXCLUDED.sub, verified_at = NOW()`,
        [tgUserId, String(row.sub)],
      );
      await client.query("COMMIT");
      return { ok: true, sub: String(row.sub) };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare(`SELECT sub, expires_at, used FROM ops_telegram_link_codes WHERE code = ?`)
    .get(code) as { sub: string; expires_at: number; used: number } | undefined;
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used) return { ok: false, reason: "used" };
  if (Number(row.expires_at) < Date.now()) return { ok: false, reason: "expired" };
  db.prepare(`UPDATE ops_telegram_link_codes SET used = 1 WHERE code = ?`).run(code);
  db
    .prepare(
      `INSERT INTO ops_telegram_links (tg_user_id, sub) VALUES (?, ?)
       ON CONFLICT(tg_user_id) DO UPDATE SET sub = excluded.sub`,
    )
    .run(tgUserId, row.sub);
  return { ok: true, sub: row.sub };
}

export async function deleteOpsTelegramLinkForSub(sub: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(`DELETE FROM ops_telegram_links WHERE sub = $1`, [sub]);
    return;
  }
  getSqliteDb().prepare(`DELETE FROM ops_telegram_links WHERE sub = ?`).run(sub);
}

export async function findSubByOpsTelegramId(tgUserId: string): Promise<string | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(`SELECT sub FROM ops_telegram_links WHERE tg_user_id = $1`, [
      tgUserId,
    ]);
    return rows[0]?.sub ? String(rows[0].sub) : null;
  }
  const row = getSqliteDb()
    .prepare(`SELECT sub FROM ops_telegram_links WHERE tg_user_id = ?`)
    .get(tgUserId) as { sub: string } | undefined;
  return row?.sub ?? null;
}

export async function listOpsTelegramChatIds(): Promise<string[]> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(`SELECT tg_user_id FROM ops_telegram_links`);
    return rows.map((r: { tg_user_id: string }) => String(r.tg_user_id));
  }
  const rows = getSqliteDb()
    .prepare(`SELECT tg_user_id FROM ops_telegram_links`)
    .all() as { tg_user_id: string }[];
  return rows.map((r) => String(r.tg_user_id));
}

export async function hasOpsTelegramLinkForSub(sub: string): Promise<boolean> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT 1 FROM ops_telegram_links WHERE sub = $1 LIMIT 1`,
      [sub],
    );
    return rows.length > 0;
  }
  const row = getSqliteDb()
    .prepare(`SELECT 1 AS n FROM ops_telegram_links WHERE sub = ? LIMIT 1`)
    .get(sub) as { n: number } | undefined;
  return Boolean(row);
}

export interface IdpOpsDbStats {
  totalUsers: number;
  verifiedUsers: number;
  proEntitlements: number;
  signupsLast24h: number;
  signupsLast7d: number;
  checkoutIntentsLast7d: number;
}

export async function getIdpOpsDbStats(): Promise<IdpOpsDbStats> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const [
      totals,
      s24,
      s7,
      ci,
    ] = await Promise.all([
      getPool().query(`SELECT
          COUNT(*)::int AS n,
          COUNT(*) FILTER (WHERE email_verified = TRUE)::int AS nv
        FROM users`),
      getPool().query(
        `SELECT COUNT(*)::int AS n FROM users WHERE created_at > NOW() - INTERVAL '1 day'`,
      ),
      getPool().query(
        `SELECT COUNT(*)::int AS n FROM users WHERE created_at > NOW() - INTERVAL '7 days'`,
      ),
      getPool().query(
        `SELECT COUNT(*)::int AS n FROM subscription_checkout_intents WHERE created_at > NOW() - INTERVAL '7 days'`,
      ),
    ]);
    const pro = await getPool().query(`SELECT COUNT(*)::int AS n FROM entitlements WHERE plan = 'pro'`);
    return {
      totalUsers: Number(totals.rows[0]?.n ?? 0),
      verifiedUsers: Number(totals.rows[0]?.nv ?? 0),
      proEntitlements: Number(pro.rows[0]?.n ?? 0),
      signupsLast24h: Number(s24.rows[0]?.n ?? 0),
      signupsLast7d: Number(s7.rows[0]?.n ?? 0),
      checkoutIntentsLast7d: Number(ci.rows[0]?.n ?? 0),
    };
  }

  const db = getSqliteDb();
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS n,
        SUM(CASE WHEN email_verified != 0 THEN 1 ELSE 0 END) AS nv
      FROM users`,
    )
    .get() as { n: number; nv: number };
  const s24 = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE datetime(created_at) > datetime('now', '-1 day')`)
    .get() as { n: number };
  const s7 = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE datetime(created_at) > datetime('now', '-7 days')`)
    .get() as { n: number };
  const ci = db
    .prepare(
      `SELECT COUNT(*) AS n FROM subscription_checkout_intents WHERE datetime(created_at) > datetime('now', '-7 days')`,
    )
    .get() as { n: number };
  const pro = db.prepare(`SELECT COUNT(*) AS n FROM entitlements WHERE plan = 'pro'`).get() as { n: number };
  return {
    totalUsers: Number(totals.n ?? 0),
    verifiedUsers: Number(totals.nv ?? 0),
    proEntitlements: Number(pro.n ?? 0),
    signupsLast24h: Number(s24.n ?? 0),
    signupsLast7d: Number(s7.n ?? 0),
    checkoutIntentsLast7d: Number(ci.n ?? 0),
  };
}

// ── Personal access tokens (MCP / AI integrations, Clara + Will + trefolio) ──

export type PersonalAccessTokenListRow = {
  id: string;
  prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

function newPatRowId(): string {
  return "pat_" + randomBytes(18).toString("hex");
}

export async function listPersonalAccessTokensForSub(
  sub: string,
): Promise<PersonalAccessTokenListRow[]> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT id, prefix, name, created_at, last_used_at, expires_at, revoked_at
       FROM personal_access_tokens WHERE sub = $1 ORDER BY created_at DESC`,
      [sub],
    );
    return rows.map((row: any) => ({
      id: String(row.id),
      prefix: String(row.prefix),
      name: String(row.name ?? ""),
      created_at: toIsoString(row.created_at) ?? "",
      last_used_at: toIsoString(row.last_used_at),
      expires_at: toIsoString(row.expires_at),
      revoked_at: toIsoString(row.revoked_at),
    }));
  }
  const rows = getSqliteDb()
    .prepare(
      `SELECT id, prefix, name, created_at, last_used_at, expires_at, revoked_at
       FROM personal_access_tokens WHERE sub = ? ORDER BY datetime(created_at) DESC`,
    )
    .all(sub) as any[];
  return rows.map((row) => ({
    id: String(row.id),
    prefix: String(row.prefix),
    name: String(row.name ?? ""),
    created_at: String(row.created_at ?? ""),
    last_used_at: row.last_used_at ? String(row.last_used_at) : null,
    expires_at: row.expires_at ? String(row.expires_at) : null,
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
  }));
}

/** Count tokens created in the rolling last hour (for rate limiting mint). */
export async function countPersonalAccessTokensCreatedInLastHour(sub: string): Promise<number> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS c FROM personal_access_tokens
       WHERE sub = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [sub],
    );
    return Number(rows[0]?.c ?? 0);
  }
  const row = getSqliteDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM personal_access_tokens
       WHERE sub = ? AND datetime(created_at) > datetime('now', '-1 hour')`,
    )
    .get(sub) as { c: number };
  return Number(row?.c ?? 0);
}

export async function insertPersonalAccessToken(input: {
  sub: string;
  tokenHash: string;
  prefix: string;
  name: string;
  expiresAt: Date | null;
  scopesJson?: string | null;
}): Promise<{ id: string }> {
  const id = newPatRowId();
  const name = input.name.trim().slice(0, 80) || "MCP";
  const scopesJson = input.scopesJson ?? null;
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `INSERT INTO personal_access_tokens (id, sub, token_hash, prefix, name, expires_at, scopes_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.sub, input.tokenHash, input.prefix, name, input.expiresAt, scopesJson],
    );
    return { id };
  }
  getSqliteDb()
    .prepare(
      `INSERT INTO personal_access_tokens (id, sub, token_hash, prefix, name, expires_at, scopes_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.sub,
      input.tokenHash,
      input.prefix,
      name,
      input.expiresAt ? input.expiresAt.toISOString() : null,
      scopesJson,
    );
  return { id };
}

/** Revoke if id belongs to sub. Returns whether a row was updated. */
export async function revokePersonalAccessToken(id: string, sub: string): Promise<boolean> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const res = await getPool().query(
      `UPDATE personal_access_tokens SET revoked_at = NOW()
       WHERE id = $1 AND sub = $2 AND revoked_at IS NULL`,
      [id, sub],
    );
    return (res.rowCount ?? 0) > 0;
  }
  const r = getSqliteDb()
    .prepare(
      `UPDATE personal_access_tokens SET revoked_at = datetime('now')
       WHERE id = ? AND sub = ? AND (revoked_at IS NULL OR revoked_at = '')`,
    )
    .run(id, sub);
  return r.changes > 0;
}

export type PatIntrospectHit = { id: string; sub: string; scopesJson: string | null };

/**
 * Lookup by SHA-256 hex hash of plaintext token. Returns null if missing,
 * revoked, expired, or unknown.
 */
export async function findActivePersonalAccessTokenByHash(
  tokenHash: string,
): Promise<PatIntrospectHit | null> {
  if (usePostgres) {
    await ensurePostgresSchema();
    const { rows } = await getPool().query(
      `SELECT id, sub, scopes_json FROM personal_access_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      sub: String(row.sub),
      scopesJson: row.scopes_json != null ? String(row.scopes_json) : null,
    };
  }
  const row = getSqliteDb()
    .prepare(
      `SELECT id, sub, scopes_json FROM personal_access_tokens
       WHERE token_hash = ?
         AND (revoked_at IS NULL OR revoked_at = '')
         AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
    )
    .get(tokenHash) as { id: string; sub: string; scopes_json: string | null } | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    sub: String(row.sub),
    scopesJson: row.scopes_json != null ? String(row.scopes_json) : null,
  };
}

export async function touchPersonalAccessTokenLastUsed(id: string): Promise<void> {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(`UPDATE personal_access_tokens SET last_used_at = NOW() WHERE id = $1`, [
      id,
    ]);
    return;
  }
  getSqliteDb()
    .prepare(`UPDATE personal_access_tokens SET last_used_at = datetime('now') WHERE id = ?`)
    .run(id);
}
