# Westgate MCP Boundary Design

## Purpose

Create a standalone `sow-mcp-server` repository that presents safe,
agent-oriented tools for the Westgate site. The first functional integration
will be read-only wiki access. The NodeBB wiki plugin will expose the required
read-only domain API in a later MVP phase.

This design deliberately separates MCP transport from NodeBB domain logic:

```text
Agent
  -> MCP over stdio
  -> sow-mcp-server
  -> HTTPS
  -> sow-nodebb-plugin-wiki read-only API
  -> NodeBB services and stored wiki content
```

## Repository Ownership

### `sow-mcp-server`

Owns:

- MCP transport and tool registration.
- Agent-facing request and response schemas.
- HTTP client behavior, timeouts, and response validation.
- Translation from wiki API responses to stable MCP results.
- Disabled write-tool contracts.
- Future providers for custom pages and other Westgate site content.

Does not own:

- NodeBB routes, permissions, categories, topics, posts, or database access.
- Wiki canonical path resolution.
- Wiki sanitization, tombstones, revision behavior, or topdata semantics.
- ACP automation.
- Production deployment configuration or secrets.

### `sow-nodebb-plugin-wiki`

Owns:

- The definition of wiki namespaces and articles.
- Read permissions and visibility.
- Canonical `/wiki/...` paths.
- First-post article source HTML.
- Safe rendered HTML and plain-text projection.
- Tombstone, deleted, and scheduled-page behavior.
- Topdata marker and provenance interpretation.
- The read-only HTTP API consumed by `sow-mcp-server`.

It does not own MCP transport or site-wide agent integration.

### `sow-platform`

Will own deployment, runtime configuration, and secrets if the MCP server is
deployed in a later phase. This design does not add a production deployment.

## Delivery Phases

### Phase 0: Plan and scaffold

This phase creates:

- The approved design and implementation plan.
- A new `sow-mcp-server/` repository directory scaffold.
- Development-shell, test, lint, and CI entrypoints.
- Configuration, provider, and tool-contract module boundaries.
- Tests proving write operations are structurally disabled.

This phase does not add:

- Functional NodeBB HTTP calls.
- New routes in `sow-nodebb-plugin-wiki`.
- A container image.
- Production deployment.
- Any write capability.

### Phase 1: Read-only wiki MVP

Add three read-only article operations to `sow-nodebb-plugin-wiki`:

- Search readable wiki pages.
- Fetch one readable wiki article.
- List readable wiki articles in a namespace.

Connect the corresponding `sow-mcp-server` tools:

- `wiki_search`
- `wiki_get_article`
- `wiki_list_articles`

### Phase 2: Refinement

After the MVP is exercised against local and live read-only data:

- Refine schemas from observed payloads.
- Improve pagination, bounded context output, and error messages.
- Add retrieval-oriented text shaping if needed.
- Evaluate caching only if measured latency requires it.
- Review whether dedicated indexing or embeddings add value beyond NodeBB
  search. The initial design does not add a vector database.

### Phase 3: Writes and site pages

Design separately before implementation:

- Wiki preview, create, update, and upsert operations.
- Optimistic concurrency using content hashes.
- Audit records and explicit approval boundaries.
- A custom-pages/site-pages API and MCP provider.

No write tool may become functional merely through configuration of the Phase
0 or Phase 1 code.

## `sow-mcp-server` Scaffold

The repository uses Node.js 24, ECMAScript modules, plain JavaScript, JSDoc
types, and the official `@modelcontextprotocol/sdk`.

Initial transport is stdio only. The process does not listen on a TCP port.

Planned layout:

```text
sow-mcp-server/
  AGENTS.md
  README.md
  LICENSE
  package.json
  package-lock.json
  jsconfig.json
  flake.nix
  flake.lock
  Makefile
  .gitignore
  .gitea/workflows/test.yml
  src/
    index.js
    config.js
    server.js
    errors.js
    nodebb/client.js
    nodebb/schemas.js
    providers/wiki.js
    providers/site-pages.js
    tools/wiki-read.js
    tools/write-stubs.js
  tests/
    config.test.js
    scaffold.test.js
    write-stubs.test.js
  docs/
    architecture.md
```

Phase 0 may use small placeholder modules only where they encode a stable
boundary. Placeholder modules must fail closed and must not claim an operation
was performed.

## Read-only Wiki API Contract

The Phase 1 plugin API will use NodeBB's plugin Write API route mechanism:

```text
GET /api/v3/plugins/westgate-wiki/agent/search
GET /api/v3/plugins/westgate-wiki/agent/articles/:tid
GET /api/v3/plugins/westgate-wiki/agent/articles
```

The routes are GET-only. The plugin must not register POST, PUT, PATCH, or
DELETE agent routes in the MVP.

### Search

Input:

```text
q=<non-empty text>
limit=<1..50>
namespacePath=<optional canonical namespace path>
```

Output records include:

```json
{
  "articleId": "wiki:123",
  "topicId": 123,
  "title": "Power Attack",
  "canonicalPath": "Rules/Feats/Power Attack",
  "wikiPath": "/wiki/Rules/Feats/Power Attack",
  "namespacePath": "Rules/Feats",
  "excerpt": "A combat feat...",
  "updatedAt": "2026-06-19T12:00:00.000Z"
}
```

### Get article

The article response includes:

```json
{
  "articleId": "wiki:123",
  "topicId": 123,
  "firstPostId": 456,
  "title": "Power Attack",
  "canonicalPath": "Rules/Feats/Power Attack",
  "wikiPath": "/wiki/Rules/Feats/Power Attack",
  "namespacePath": "Rules/Feats",
  "sourceHtml": "<!-- sow-topdata-wiki:page=feat:power_attack -->...",
  "renderedHtml": "<h1>Power Attack</h1>...",
  "plainText": "Power Attack ...",
  "contentHash": "sha256:...",
  "updatedAt": "2026-06-19T12:00:00.000Z",
  "generated": {
    "isTopdataManaged": true,
    "pageId": "feat:power_attack"
  }
}
```

`sourceHtml` preserves the stored sanitized first-post HTML, including topdata
managed/manual markers. `renderedHtml` is the plugin's safe read-only
projection. `plainText` is derived from safe rendered content for retrieval.

### List articles

Input:

```text
namespacePath=<optional canonical namespace path>
limit=<1..50>
cursor=<optional opaque cursor>
```

Output uses an opaque continuation cursor and never requires an agent to know
category IDs.

## Permissions and Authentication

The plugin applies existing NodeBB visibility and privilege rules. Anonymous
requests can see only anonymously readable wiki content.

`sow-mcp-server` may use a dedicated NodeBB user token to obtain that user's
read view. The token is optional for public-only use.

Configuration:

```text
SOW_NODEBB_URL=https://westgate.pw
SOW_NODEBB_TOKEN_FILE=/run/secrets/nodebb-mcp-token
SOW_MCP_REQUEST_TIMEOUT_MS=10000
SOW_MCP_EXPOSE_WRITE_STUBS=false
```

Rules:

- Prefer `SOW_NODEBB_TOKEN_FILE`; do not accept secrets in committed files.
- Never print authorization headers or token contents.
- Reject non-HTTP(S) NodeBB URLs.
- Default timeout is 10,000 milliseconds.
- The MCP server has no direct MongoDB or Redis configuration.

## Disabled Write Contracts

The scaffold defines contracts for:

- `wiki_preview_update`
- `wiki_create_article`
- `wiki_update_article`
- `wiki_upsert_article`
- `site_preview_page_update`
- `site_update_page`

They are hidden from the advertised MCP tool list unless
`SOW_MCP_EXPOSE_WRITE_STUBS=true`.

Even when exposed, every handler returns:

```json
{
  "status": "disabled",
  "code": "write-tools-not-enabled",
  "message": "This server build does not permit content mutations. No mutation was attempted."
}
```

The scaffold contains no HTTP mutation method and no configuration switch that
can enable real writes.

Future update contracts include `expectedContentHash` so the later write design
cannot default to unconditional overwrites.

## Retrieval and RAG Boundary

The wiki is treated as a retrievable knowledge source, but the initial server
does not introduce a vector store or copy the wiki into a second database.

The MVP performs live, permission-aware retrieval through the wiki plugin API.
Agents can search, fetch articles, and use returned content as context.

Topdata remains authoritative for its generated source data. MCP reads the
deployed wiki representation and does not replace the topdata generation or
deployment pipeline.

## Error Handling

The MCP server maps failures into stable categories:

- `invalid-configuration`
- `invalid-input`
- `nodebb-timeout`
- `nodebb-unavailable`
- `nodebb-unauthorized`
- `nodebb-forbidden`
- `article-not-found`
- `invalid-nodebb-response`
- `write-tools-not-enabled`

Errors must be bounded, must not include response bodies containing sensitive
data, and must not include tokens.

## Testing

### Scaffold phase

- Configuration defaults are deterministic.
- Invalid URL and timeout values fail closed.
- Every planned module exists.
- Write stubs always return the disabled response.
- Write stubs make no HTTP request.
- The package passes syntax checks and Node's built-in test runner.
- The Nix development shell can run `make check`.

### Read-only MVP phase

- Plugin search returns only readable wiki articles.
- Plugin article lookup rejects non-wiki topics.
- Tombstoned, deleted, and scheduled pages follow existing visibility rules.
- Topdata comments survive in `sourceHtml`.
- `plainText` excludes comments and executable markup.
- List pagination is stable and bounded.
- MCP tools validate plugin responses.
- Network timeouts and malformed responses become stable MCP errors.
- No write tool sends POST, PUT, PATCH, or DELETE.

## Deployment

Phase 0 and Phase 1 do not require a production MCP service. The intended first
usage is a local stdio MCP process configured to call the existing HTTPS
NodeBB endpoint.

If remote or continuously hosted MCP is later required, `sow-platform` must
define that deployment after a separate transport and authentication review.

## Acceptance Criteria

Phase 0 is complete when:

- The new repository directory has clear ownership and safe defaults.
- `make check` passes inside its Nix development shell.
- No functional NodeBB call or content mutation exists.
- The full MVP implementation plan is present.
- No commits or pushes were made.

Phase 1 is complete only after the plugin API and three MCP read tools pass
their integration tests. That work is explicitly outside the scaffold phase.
