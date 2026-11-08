# MCP Configuration

Claude Code reads project-scoped MCP servers from `.mcp.json` at the repository root.

## Suno (included)

```json
{
  "mcpServers": {
    "suno": {
      "type": "http",
      "url": "https://api.suno.com/mcp"
    }
  }
}
```

Authentication is handled by Claude Code's MCP login flow. The endpoint is the official Suno MCP endpoint. The `suno-song` skill uses the tools the server exposes; it does not hard-code a Suno API shape.

Suno is optional. A project can import a finished song instead.

## fal.ai (optional, exploration only)

The pipeline uses the fal.ai adapter in `packages/providers` with `FAL_KEY`, not MCP. If you want to explore fal.ai models interactively in Claude Code, add the HTTP MCP URL from your fal account to `.mcp.json`:

```json
{
  "mcpServers": {
    "suno": {
      "type": "http",
      "url": "https://api.suno.com/mcp"
    },
    "fal": {
      "type": "http",
      "url": "<paste-the-fal-mcp-url-from-your-account>"
    }
  }
}
```

Do not put an API key in `.mcp.json`. If the server needs a bearer token, use Claude Code's MCP auth flow or an environment variable, never a committed secret.

The pipeline does not depend on the fal MCP server. Keeping exploration separate from the adapter keeps generation reproducible and cacheable.

## Higgsfield (adapter, not MCP)

Higgsfield is also used through the adapter in `packages/providers`, with `HIGGSFIELD_API_KEY` or `HF_API_KEY_ID` + `HF_API_KEY_SECRET`. It does not need an MCP server for pipeline generation. If you want to explore Higgsfield models interactively and its documentation offers an MCP endpoint, add that server as a separate exploration tool; keep production generation behind the adapter so it stays cached, budgeted, and reproducible.

## Other providers

Add a new HTTP or stdio server under `mcpServers` only if it is useful for exploration. Production generation belongs behind the narrow provider interface so it can be cached, budgeted, and reproduced.
