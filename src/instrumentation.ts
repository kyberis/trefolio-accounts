import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * Runs even when the dev server is started as `next dev` (skipping npm `predev`).
 * Ensures better-sqlite3 matches this process's Node ABI before any route hits the DB.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const cwd = process.cwd();
  const script = join(cwd, "scripts", "ensure-sqlite-native.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `[trefolio-accounts] ensure-sqlite-native.mjs failed with exit ${result.status ?? "signal"}`,
    );
  }
}
