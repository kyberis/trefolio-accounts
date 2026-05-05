#!/usr/bin/env node
/**
 * Fail fast when `npm run dev` / `npm run build` is invoked with the wrong
 * Node major — avoids confusing better-sqlite3 ABI errors at runtime.
 */
const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 22) {
  console.error(
    `[trefolio-accounts] Node.js 22+ required (got ${process.version}). ` +
      `This repo's .nvmrc is "22". Example: nvm use 22 or\n` +
      `  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"\n` +
      `Then: cd external/accounts && npm rebuild better-sqlite3`,
  );
  process.exit(1);
}
