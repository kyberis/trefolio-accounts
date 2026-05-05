import Database from "better-sqlite3";
import path from "node:path";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const file = path.join(process.cwd(), "idp-dev.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      sub TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      password_plain TEXT NOT NULL DEFAULT '',
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

  // Seed a dev user + Pro entitlement for one-click testing.
  const insert = db.prepare(`INSERT OR IGNORE INTO users (sub, email, name, password_plain) VALUES (?, ?, ?, ?)`);
  insert.run("dev-user-1", "dev@trefolio.test", "Dev User", "password123");
  insert.run("dev-user-2", "free@trefolio.test", "Free User", "password123");
  db.prepare(`INSERT OR IGNORE INTO entitlements (sub, plan, pro_until, source) VALUES (?, 'pro', ?, 'dev-grant')`)
    .run("dev-user-1", new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString());
  db.prepare(`INSERT OR IGNORE INTO entitlements (sub, plan) VALUES (?, 'free')`).run("dev-user-2");

  _db = db;
  return db;
}

export interface DbUser {
  sub: string;
  email: string;
  name: string;
}

export function findUserByEmail(email: string): (DbUser & { password_plain: string }) | null {
  const row = getDb().prepare(`SELECT sub, email, name, password_plain FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as any;
  return row ?? null;
}

export function findUserBySub(sub: string): DbUser | null {
  const row = getDb().prepare(`SELECT sub, email, name FROM users WHERE sub = ?`).get(sub) as any;
  return row ?? null;
}

export function getEntitlement(sub: string): { plan: string; pro_until: string | null; source: string | null } {
  const row = getDb().prepare(`SELECT plan, pro_until, source FROM entitlements WHERE sub = ?`).get(sub) as any;
  return row ?? { plan: "free", pro_until: null, source: null };
}

export function setPlan(sub: string, plan: "free" | "pro", proUntilIso: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO entitlements (sub, plan, pro_until, source, updated_at)
       VALUES (?, ?, ?, 'dev-toggle', datetime('now'))
       ON CONFLICT(sub) DO UPDATE SET plan = excluded.plan, pro_until = excluded.pro_until, source = excluded.source, updated_at = datetime('now')`,
    )
    .run(sub, plan, proUntilIso);
}

export function createUser(args: { email: string; name: string; password: string }): DbUser {
  const sub = "u_" + Math.random().toString(36).slice(2, 14);
  const email = args.email.trim().toLowerCase();
  getDb()
    .prepare(`INSERT INTO users (sub, email, name, password_plain) VALUES (?, ?, ?, ?)`)
    .run(sub, email, args.name, args.password);
  getDb().prepare(`INSERT INTO entitlements (sub, plan) VALUES (?, 'free')`).run(sub);
  return { sub, email, name: args.name };
}

export function saveAuthCode(args: {
  code: string;
  sub: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  nonce?: string | null;
  scope?: string;
}): void {
  getDb()
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
      Date.now() + 60_000,
    );
}

export function consumeAuthCode(code: string): null | {
  sub: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  nonce: string | null;
  scope: string;
} {
  const db = getDb();
  const row = db
    .prepare(`SELECT sub, client_id, redirect_uri, code_challenge, code_challenge_method, nonce, scope, expires_at, used FROM auth_codes WHERE code = ?`)
    .get(code) as any;
  if (!row) return null;
  if (row.used) return null;
  if (row.expires_at < Date.now()) return null;
  db.prepare(`UPDATE auth_codes SET used = 1 WHERE code = ?`).run(code);
  return row;
}

export function linkTelegram(tgUserId: string, sub: string): void {
  getDb()
    .prepare(`INSERT INTO telegram_links (tg_user_id, sub) VALUES (?, ?) ON CONFLICT(tg_user_id) DO UPDATE SET sub = excluded.sub`)
    .run(tgUserId, sub);
}

export function findSubByTelegramId(tgUserId: string): string | null {
  const row = getDb().prepare(`SELECT sub FROM telegram_links WHERE tg_user_id = ?`).get(tgUserId) as any;
  return row?.sub ?? null;
}
