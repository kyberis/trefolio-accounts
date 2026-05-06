#!/usr/bin/env node
/**
 * better-sqlite3 ships a native .node binary tied to process.versions.modules.
 * If node_modules was installed with another Node major, the next dev server
 * crashes at first DB open. This script loads the module once and, on ABI
 * mismatch, runs `npm rebuild better-sqlite3` then retries (once).
 *
 * Invoked from postinstall + predev/prebuild/prestart so switching Node after
 * a clone only requires `npm run dev` (or `npm install`), not manual rebuild docs.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

function isAbiMismatchError(err) {
  const msg = String(err?.message || err);
  return (
    /NODE_MODULE_VERSION/i.test(msg) ||
    /compiled against a different Node\.js version/i.test(msg) ||
    err?.code === "ERR_DLOPEN_FAILED"
  );
}

function tryLoad() {
  require("better-sqlite3");
}

function rebuild() {
  console.warn(
    `[trefolio-accounts] Rebuilding better-sqlite3 for Node ${process.version} (modules ${process.versions.modules})…`,
  );
  // `npm rebuild` shells out to node-gyp; if another Node (e.g. 18) is first on PATH,
  // the .node binary is built for the wrong ABI and the Next server (often Node 22) still crashes.
  const nodeDir = dirname(process.execPath);
  const pathEnv = process.env.PATH ?? "";
  const env = {
    ...process.env,
    PATH: `${nodeDir}${delimiter}${pathEnv}`,
  };
  execSync("npm rebuild better-sqlite3", {
    stdio: "inherit",
    cwd: root,
    env,
  });
}

let attempt = 0;
for (;;) {
  try {
    tryLoad();
    break;
  } catch (e) {
    if (!isAbiMismatchError(e) || attempt >= 1) {
      console.error(
        "[trefolio-accounts] better-sqlite3 failed to load. If you changed Node versions, run from this directory:\n" +
          "  npm rebuild better-sqlite3\n" +
          "Original error:",
      );
      console.error(e);
      process.exit(1);
    }
    attempt += 1;
    rebuild();
  }
}
