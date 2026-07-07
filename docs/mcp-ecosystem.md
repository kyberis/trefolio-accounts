# MCP & AI access (trefolio ecosystem)

One **personal access token (PAT)** is created on **[user.trefolio.com/account/developer](https://user.trefolio.com/account/developer)** after you sign in. The same token works as `Authorization: Bearer …` for MCP on:

| Product | MCP URL (Streamable HTTP base; check each app’s `/.well-known/mcp.json`) |
|---------|-----------------------------------------------------------------------------|
| **trefolio** | `https://trefolio.com/api/mcp/user` (path may include transport segment per deployment) |
| **Clara** | `https://clara.trefolio.com/api/mcp/user` |
| **Will** | `https://will.trefolio.com/api/mcp/user` |

Prefix: `tfp_pat_` (minted only by Accounts).

### PAT scopes (trefolio MCP)

When minting a token, choose scopes on the Developer page. Defaults: `portfolio:read`, `tools:read`, `warren:moat`. Opt in to `tax:read`, `warren:ai`, `portfolio:write`, `finance:read` / `finance:write` (Clara), and `notes:read` / `notes:write` (Will) for sensitive or sister-app tools. Tokens created before scopes shipped keep full ecosystem access until revoked.

## Agent routing (which MCP server to use)

Use **one PAT** and connect **three MCP servers** in your client. Route work by domain — do not call trefolio for Clara/Will data or vice versa.

| Need | MCP server | Example tools |
|------|------------|---------------|
| Portfolio, MOAT, tax, screener, alerts | **trefolio** | `getPortfolioSummary`, `listTransactions`, `getTaxReport`, `runMoatEvaluation`, `screenStocks` |
| Budget, expenses, savings (Clara) | **Clara** | `getProfile`, `getSavings`, `getSavingsSummary`, month expense tools |
| Notes journal (Will) | **Will** | `searchNotes`, `listRecentNotes`, `getNote`, `createNote` |

**Scopes:** each host enforces only its scopes. A default token (trefolio read + MOAT) does **not** include Clara or Will until you enable `finance:read` and/or `notes:read` on user.trefolio.com → Developer.

**Office vs MCP:** Warren in-app coordination uses internal REST (`IDP_SERVICE_TOKEN`) — not user PAT. `getSavingsSummary` on Clara MCP mirrors the Office savings summary shape for external agents.

## Server configuration (operators)

Set the **same** secret on **Accounts** and on **Clara, Will, and trefolio**:

- `TREFOLIO_PAT_INTROSPECTION_SECRET` — long random string. Apps call `POST {IDP_ISSUER}/api/v1/pat/introspect` with `Authorization: Bearer <this secret>` and JSON body `{ "token": "<user pat>" }`.

## Client examples (Cursor / Claude)

Use one PAT in headers for each server entry:

```json
{
  "mcpServers": {
    "trefolio": {
      "url": "https://trefolio.com/api/mcp/user/mcp",
      "headers": { "Authorization": "Bearer tfp_pat_YOUR_TOKEN_HERE" }
    },
    "clara": {
      "url": "https://clara.trefolio.com/api/mcp/user/mcp",
      "headers": { "Authorization": "Bearer tfp_pat_YOUR_TOKEN_HERE" }
    },
    "will": {
      "url": "https://will.trefolio.com/api/mcp/user/mcp",
      "headers": { "Authorization": "Bearer tfp_pat_YOUR_TOKEN_HERE" }
    }
  }
}
```

### Claude Desktop — OAuth Client ID vs PAT

**Claude Desktop → Settings → Connectors → Custom connector** asks for an **OAuth Client ID**. The trefolio ecosystem uses a **personal access token** (`tfp_pat_…`), not OAuth. **There is no Client ID to enter.**

Use the config file instead (macOS):

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "trefolio": {
      "type": "http",
      "url": "https://trefolio.com/api/mcp/user/mcp",
      "headers": { "Authorization": "Bearer tfp_pat_YOUR_TOKEN_HERE" }
    }
  }
}
```

Restart Claude Desktop after saving. Full guide: https://trefolio.com/api/docs/claude-desktop

**Claude Code CLI:**

```bash
claude mcp add --transport http trefolio https://trefolio.com/api/mcp/user/mcp \
  --header "Authorization: Bearer tfp_pat_YOUR_TOKEN_HERE"
```

**Cursor** uses `~/.cursor/mcp.json` with the same `url` + `headers` pattern as the first JSON block above.

Exact path suffix (`/mcp` vs SSE) is defined in each product’s MCP route — prefer discovery via `/.well-known/mcp.json` on each host.

## OpenAI, Anthropic, Google

Host products change often. Use the **same** URL + Bearer pattern wherever the host supports **remote MCP over HTTP**. Start from the vendor’s current guides (bookmark these; URLs may move):

- **Model Context Protocol (spec + concepts):** [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **OpenAI (remote MCP / Responses API):** [Remote MCP](https://platform.openai.com/docs/guides/tools-remote-mcp), [MCP for ChatGPT / API](https://developers.openai.com/api/docs/mcp), [Apps SDK — MCP server](https://developers.openai.com/apps-sdk/concepts/mcp-server)
- **Anthropic (Claude + MCP):** [Model Context Protocol (Anthropic Docs)](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- **Google (Gemini / AI Studio):** search **Gemini MCP connector** or **AI Studio MCP** in [Google AI for Developers](https://ai.google.dev/) — connector naming changes between releases.

Treat any MCP server that receives your `tfp_pat_…` as **highly trusted**; it can read data the tools expose on that host until you revoke the token on user.trefolio.com.
