# MCP Configuration

Claude Code reads project-scoped MCP servers from `.mcp.json` at the repository root.

The pipeline needs no MCP server, and the repository ships no `.mcp.json`. Songs are always supplied by the user and imported with `npm run cli -- import-song`; there is no song-generation integration. Create `.mcp.json` yourself only for the optional exploration servers below.

## fal.ai (optional, exploration only)

The pipeline uses the fal.ai adapter in `packages/providers` with `FAL_KEY`, not MCP. If you want to explore fal.ai models interactively in Claude Code, create `.mcp.json` with the HTTP MCP URL from your fal account:

```json
{
  "mcpServers": {
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
