# Westgate MCP Read-only MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone stdio MCP server that exposes permission-aware,
read-only Westgate wiki retrieval through a narrow API owned by the NodeBB wiki
plugin, while keeping all write contracts disabled.

**Architecture:** `sow-nodebb-plugin-wiki` remains the source of truth for wiki
membership, canonical paths, visibility, source HTML, rendered HTML, and
topdata provenance. `sow-mcp-server` calls only the plugin's read-only HTTPS
API and maps those responses to MCP tools. Phase 0 creates boundaries and
fail-closed stubs only; Phase 1 adds the functional read path.

**Tech Stack:** NodeBB 4.13.x plugin CommonJS services and API routes; Node.js
24 ECMAScript modules; `@modelcontextprotocol/sdk` 1.29.0; Zod 4.4.3; Node
built-in test runner; Nix flakes.

## Global Constraints

- Never commit or push during agent execution unless the user explicitly
  overrides the workspace rule.
- Never access or modify `.sops` files or plaintext secrets.
- Use Node.js 24 through the repository flake on NixOS.
- MCP transport is stdio only through Phase 1.
- `sow-mcp-server` must never access MongoDB, Redis, ACP Socket.IO, or NodeBB
  internal modules.
- The Phase 1 plugin API registers GET routes only.
- Write tools remain non-functional through Phase 1 and cannot be enabled by
  configuration.
- Topdata remains authoritative for generated source data.
- Do not add a vector database, embedding service, container image, or
  production deployment in this plan.
- Each completed task ends with a review checkpoint and verification evidence,
  not a Git commit.

---

## File Structure

### New `sow-mcp-server` repository

- `AGENTS.md`: repository ownership and safety rules.
- `README.md`: operator setup, commands, and phase status.
- `LICENSE`: project license.
- `package.json`: runtime and test entrypoints.
- `package-lock.json`: exact npm dependency resolution.
- `jsconfig.json`: checked JavaScript/JSDoc configuration.
- `flake.nix`, `flake.lock`: NixOS development shell.
- `Makefile`: `check`, `test`, and `start` entrypoints.
- `.gitignore`: dependency, cache, and local environment exclusions.
- `.gitea/workflows/test.yml`: PR and main validation.
- `src/index.js`: process entrypoint.
- `src/config.js`: environment parsing without secret logging.
- `src/server.js`: MCP server assembly.
- `src/errors.js`: stable error codes.
- `src/nodebb/client.js`: GET-only NodeBB client, implemented in Phase 1.
- `src/nodebb/schemas.js`: validated response schemas.
- `src/providers/wiki.js`: wiki provider boundary.
- `src/providers/site-pages.js`: disabled site-pages boundary.
- `src/tools/wiki-read.js`: three read-only MCP tool definitions.
- `src/tools/write-stubs.js`: disabled write contracts.
- `tests/config.test.js`: configuration behavior.
- `tests/scaffold.test.js`: module and transport boundaries.
- `tests/write-stubs.test.js`: proof that mutation is disabled.
- `tests/nodebb-client.test.js`: GET-only HTTP behavior in Phase 1.
- `tests/wiki-tools.test.js`: MCP/provider mapping in Phase 1.
- `docs/architecture.md`: ownership and data flow.

### `sow-nodebb-plugin-wiki` additions

- `lib/wiki-agent-api.js`: stable read-only article projection service.
- `lib/controllers/wiki-agent-api.js`: HTTP parameter and status mapping.
- `library.js`: three GET route registrations.
- `tests/wiki-agent-api.test.js`: service projection and visibility tests.
- `tests/wiki-agent-api-routes.test.js`: route and verb contract tests.
- `README.md`: read-only agent API documentation.

---

### Task 1: Create the fail-closed `sow-mcp-server` scaffold

**Files:**

- Create all Phase 0 files listed under `sow-mcp-server` except
  `tests/nodebb-client.test.js` and `tests/wiki-tools.test.js`.

**Interfaces:**

- Produces: `loadConfig(env)`, `createServer(options)`,
  `createDisabledWriteResult()`, `getWriteToolDefinitions()`.
- Consumes: no NodeBB API and no secrets during tests.

- [ ] **Step 1: Write configuration tests**

Create `sow-mcp-server/tests/config.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("uses safe scaffold defaults", () => {
  assert.deepEqual(loadConfig({}), {
    nodebbUrl: null,
    nodebbTokenFile: null,
    requestTimeoutMs: 10000,
    exposeWriteStubs: false
  });
});

test("rejects invalid NodeBB URL protocols", () => {
  assert.throws(
    () => loadConfig({ SOW_NODEBB_URL: "file:///tmp/nodebb" }),
    /invalid-configuration/
  );
});

test("rejects invalid timeout values", () => {
  assert.throws(
    () => loadConfig({ SOW_MCP_REQUEST_TIMEOUT_MS: "0" }),
    /invalid-configuration/
  );
});
```

- [ ] **Step 2: Write disabled-write tests**

Create `sow-mcp-server/tests/write-stubs.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  createDisabledWriteResult,
  getWriteToolDefinitions
} from "../src/tools/write-stubs.js";

test("all write contracts return the same disabled result", async () => {
  for (const tool of getWriteToolDefinitions()) {
    assert.deepEqual(await tool.handler({}), createDisabledWriteResult());
  }
});

test("write contracts include optimistic concurrency fields", () => {
  const names = getWriteToolDefinitions().map((tool) => tool.name);
  assert.deepEqual(names, [
    "wiki_preview_update",
    "wiki_create_article",
    "wiki_update_article",
    "wiki_upsert_article",
    "site_preview_page_update",
    "site_update_page"
  ]);

  const update = getWriteToolDefinitions().find(
    (tool) => tool.name === "wiki_update_article"
  );
  assert.ok(update.inputSchema.expectedContentHash);
});
```

- [ ] **Step 3: Run tests and verify the scaffold starts red**

Run:

```bash
cd sow-mcp-server
nix develop -c node --test tests/config.test.js tests/write-stubs.test.js
```

Expected: failure because the imported modules do not exist.

- [ ] **Step 4: Implement configuration parsing**

Create `sow-mcp-server/src/config.js` with:

```js
import { McpError } from "./errors.js";

function parseBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function parseTimeout(value) {
  if (value === undefined || value === "") {
    return 10000;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60000) {
    throw new McpError(
      "invalid-configuration",
      "SOW_MCP_REQUEST_TIMEOUT_MS must be between 1 and 60000"
    );
  }
  return parsed;
}

function parseUrl(value) {
  if (!value) {
    return null;
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new McpError(
      "invalid-configuration",
      "SOW_NODEBB_URL must use HTTP or HTTPS"
    );
  }
  return url.toString().replace(/\/$/, "");
}

export function loadConfig(env = process.env) {
  return {
    nodebbUrl: parseUrl(env.SOW_NODEBB_URL),
    nodebbTokenFile: env.SOW_NODEBB_TOKEN_FILE || null,
    requestTimeoutMs: parseTimeout(env.SOW_MCP_REQUEST_TIMEOUT_MS),
    exposeWriteStubs: parseBoolean(env.SOW_MCP_EXPOSE_WRITE_STUBS)
  };
}
```

Create `sow-mcp-server/src/errors.js`:

```js
export class McpError extends Error {
  constructor(code, message, options = {}) {
    super(`${code}: ${message}`, options);
    this.name = "McpError";
    this.code = code;
  }
}
```

- [ ] **Step 5: Implement disabled contracts**

Create `sow-mcp-server/src/tools/write-stubs.js`:

```js
const disabledResult = Object.freeze({
  status: "disabled",
  code: "write-tools-not-enabled",
  message:
    "This server build does not permit content mutations. No mutation was attempted."
});

const contracts = [
  {
    name: "wiki_preview_update",
    inputSchema: {
      articleId: { type: "string" },
      content: { type: "string" },
      expectedContentHash: { type: "string" }
    }
  },
  {
    name: "wiki_create_article",
    inputSchema: {
      namespacePath: { type: "string" },
      title: { type: "string" },
      content: { type: "string" }
    }
  },
  {
    name: "wiki_update_article",
    inputSchema: {
      articleId: { type: "string" },
      content: { type: "string" },
      expectedContentHash: { type: "string" },
      editReason: { type: "string" }
    }
  },
  {
    name: "wiki_upsert_article",
    inputSchema: {
      sourcePath: { type: "string" },
      namespacePath: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      expectedContentHash: { type: "string" }
    }
  },
  {
    name: "site_preview_page_update",
    inputSchema: {
      pageId: { type: "string" },
      html: { type: "string" },
      expectedContentHash: { type: "string" }
    }
  },
  {
    name: "site_update_page",
    inputSchema: {
      pageId: { type: "string" },
      html: { type: "string" },
      expectedContentHash: { type: "string" }
    }
  }
];

export function createDisabledWriteResult() {
  return { ...disabledResult };
}

export function getWriteToolDefinitions() {
  return contracts.map((contract) => ({
    ...contract,
    handler: async () => createDisabledWriteResult()
  }));
}
```

- [ ] **Step 6: Add server and provider boundaries**

Create `src/providers/wiki.js`, `src/providers/site-pages.js`,
`src/tools/wiki-read.js`, `src/nodebb/client.js`, and
`src/nodebb/schemas.js` as side-effect-free modules. In Phase 0, read calls
must throw `McpError("nodebb-unavailable", "Read-only wiki MVP is not implemented")`.

Create `src/server.js` so `createServer({ config })` registers no functional
read tool and only registers write stubs when `config.exposeWriteStubs` is
true. Every exposed stub returns JSON text containing the disabled result.

Create `src/index.js` so it loads configuration, creates the MCP server, and
connects only `StdioServerTransport`.

- [ ] **Step 7: Add package, Nix, Make, CI, and documentation files**

Pin runtime dependencies:

```json
{
  "@modelcontextprotocol/sdk": "1.29.0",
  "zod": "4.4.3"
}
```

Use these commands:

```bash
npm test
npm run check
nix develop -c make check
```

`npm run check` must run `node --check` over `src/**/*.js` and `tests/**/*.js`
without adding a linter dependency in Phase 0.

- [ ] **Step 8: Verify Phase 0 acceptance**

Run:

```bash
cd sow-mcp-server
nix develop -c make check
git status --short
```

Expected:

- Syntax and tests pass.
- No test opens a network connection.
- Only the new scaffold files are listed.
- No Git commit exists for the scaffold.

Review checkpoint: inspect the diff and confirm there is no `fetch` call using
POST, PUT, PATCH, or DELETE and no database package.

---

### Task 2: Add the plugin's pure article projection service

**Files:**

- Create: `sow-nodebb-plugin-wiki/lib/wiki-agent-api.js`
- Create: `sow-nodebb-plugin-wiki/tests/wiki-agent-api.test.js`

**Interfaces:**

- Consumes: existing `wiki-search-service`, `topic-service`,
  `wiki-directory-service`, canonical path adapters, and sanitizer.
- Produces:
  `searchArticles({ query, namespacePath, limit, uid })`,
  `getArticle({ tid, uid })`,
  `listArticles({ namespacePath, limit, cursor, uid })`.

- [ ] **Step 1: Write a failing projection test**

The test must mock NodeBB modules before requiring `wiki-agent-api.js` and
assert this exact public shape:

```js
assert.deepEqual(result, {
  articleId: "wiki:42",
  topicId: 42,
  firstPostId: 84,
  title: "Power Attack",
  canonicalPath: "Rules/Feats/Power Attack",
  wikiPath: "/wiki/Rules/Feats/Power Attack",
  namespacePath: "Rules/Feats",
  sourceHtml: "<!-- sow-topdata-wiki:page=feat:power_attack --><p>Power Attack</p>",
  renderedHtml: "<p>Power Attack</p>",
  plainText: "Power Attack",
  contentHash: `sha256:${expectedHash}`,
  updatedAt: "2026-06-19T12:00:00.000Z",
  generated: {
    isTopdataManaged: true,
    pageId: "feat:power_attack"
  }
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
cd sow-nodebb-plugin-wiki
node --test tests/wiki-agent-api.test.js
```

Expected: failure because `lib/wiki-agent-api.js` does not exist.

- [ ] **Step 3: Implement deterministic projections**

Use `crypto.createHash("sha256").update(sourceHtml, "utf8").digest("hex")`.
Extract the topdata page ID only from the existing
`<!-- sow-topdata-wiki:page=... -->` marker. Strip HTML comments before deriving
plain text from rendered HTML. Collapse whitespace and cap search excerpts at
500 Unicode code points.

- [ ] **Step 4: Add visibility and namespace tests**

Cover:

- `topic-service.getWikiPage()` statuses `not-found`, `not-wiki`, and
  `forbidden`.
- Namespace paths resolved from canonical paths, never from raw category IDs.
- Deleted, scheduled, and tombstoned behavior delegated to existing services.
- Source HTML is the stored first-post source and rendered HTML is the existing
  read-only rendering.

- [ ] **Step 5: Run plugin tests**

Run:

```bash
npm test
```

Expected: all existing and new tests pass.

Review checkpoint: confirm the service exports domain objects only and does not
accept arbitrary post IDs or category IDs.

---

### Task 3: Register GET-only plugin controllers and routes

**Files:**

- Create: `sow-nodebb-plugin-wiki/lib/controllers/wiki-agent-api.js`
- Create: `sow-nodebb-plugin-wiki/tests/wiki-agent-api-routes.test.js`
- Modify: `sow-nodebb-plugin-wiki/library.js`
- Modify: `sow-nodebb-plugin-wiki/README.md`

**Interfaces:**

- Consumes: Task 2 service functions.
- Produces:
  `GET /westgate-wiki/agent/search`,
  `GET /westgate-wiki/agent/articles/:tid`,
  `GET /westgate-wiki/agent/articles` under `/api/v3/plugins`.

- [ ] **Step 1: Write route-contract tests**

Assert `library.js` contains exactly three calls with verb `"get"` and the
three paths. Assert no agent route is registered with `"post"`, `"put"`,
`"patch"`, or `"delete"`.

- [ ] **Step 2: Write controller status tests**

Assert:

- Invalid search input returns 400.
- Forbidden service status returns 403.
- Missing/non-wiki article returns 404.
- Successful responses use `helpers.formatApiResponse(200, res, payload)`.

- [ ] **Step 3: Run focused route tests**

Run:

```bash
node --test tests/wiki-agent-api-routes.test.js
```

Expected: failure because routes and controllers do not exist.

- [ ] **Step 4: Implement controllers and route registration**

Use `routeHelpers.setupApiRoute` and no extra middleware beyond the standard
NodeBB authentication middleware already applied by that helper. Pass `req.uid`
to every service call. Clamp limits in the service, not in duplicated
controller logic.

- [ ] **Step 5: Document curl examples**

Document anonymous and bearer-token GET examples without including a real
token:

```bash
curl -fsS \
  'https://westgate.pw/api/v3/plugins/westgate-wiki/agent/search?q=power%20attack&limit=10'

curl -fsS \
  -H 'Authorization: Bearer <nodebb-user-token>' \
  'https://westgate.pw/api/v3/plugins/westgate-wiki/agent/articles/42'
```

- [ ] **Step 6: Run the full plugin suite**

Run:

```bash
npm test
```

Expected: all tests pass.

Review checkpoint: inspect route registration and confirm all new agent routes
are GET-only.

---

### Task 4: Implement the GET-only NodeBB client

**Files:**

- Modify: `sow-mcp-server/src/nodebb/client.js`
- Modify: `sow-mcp-server/src/nodebb/schemas.js`
- Create: `sow-mcp-server/tests/nodebb-client.test.js`

**Interfaces:**

- Consumes: `nodebbUrl`, optional token file, and timeout from `loadConfig`.
- Produces:
  `createNodebbClient(config)` with `searchWiki(input)`,
  `getWikiArticle(input)`, and `listWikiArticles(input)`.

- [ ] **Step 1: Write HTTP-client tests with a local test server**

Tests must assert:

- All calls use GET.
- Query parameters are URL encoded.
- Token-file contents become an `Authorization: Bearer ...` header.
- Error messages never contain the token.
- Timeout aborts map to `nodebb-timeout`.
- 401, 403, 404, 5xx, and malformed JSON map to stable error codes.

- [ ] **Step 2: Run focused tests**

Run:

```bash
nix develop -c node --test tests/nodebb-client.test.js
```

Expected: failure because the scaffold client is intentionally unavailable.

- [ ] **Step 3: Implement a private GET helper**

The helper signature is:

```js
async function getJson(pathname, query = {})
```

It must:

- Build URLs relative to configured `nodebbUrl`.
- Read the token file only when making a request.
- Trim the token and reject an empty token file.
- Use `AbortSignal.timeout(requestTimeoutMs)`.
- Set `accept: application/json`.
- Never expose response bodies in 401 or 403 errors.
- Validate JSON with Zod before returning it.

- [ ] **Step 4: Define exact Zod schemas**

Define separate schemas for search records, article records, and list
pagination. Use `.strict()` so unexpected plugin payload changes fail as
`invalid-nodebb-response`.

- [ ] **Step 5: Run repository checks**

Run:

```bash
nix develop -c make check
```

Expected: all tests pass.

Review checkpoint: search the source for `method:` and confirm the client uses
GET only.

---

### Task 5: Expose functional read-only MCP tools

**Files:**

- Modify: `sow-mcp-server/src/providers/wiki.js`
- Modify: `sow-mcp-server/src/tools/wiki-read.js`
- Modify: `sow-mcp-server/src/server.js`
- Modify: `sow-mcp-server/src/index.js`
- Create: `sow-mcp-server/tests/wiki-tools.test.js`
- Modify: `sow-mcp-server/README.md`

**Interfaces:**

- Consumes: Task 4 client.
- Produces MCP tools:
  `wiki_search`, `wiki_get_article`, `wiki_list_articles`.

- [ ] **Step 1: Write tool registration tests**

Assert the default tool list contains exactly:

```js
["wiki_search", "wiki_get_article", "wiki_list_articles"]
```

With `exposeWriteStubs: true`, assert the six disabled write contracts are
appended and still return `write-tools-not-enabled`.

- [ ] **Step 2: Write provider mapping tests**

Inject a fake client and assert:

- `wiki_search` forwards `query`, optional `namespacePath`, and bounded `limit`.
- `wiki_get_article` accepts `articleId: "wiki:42"` and passes `tid: 42`.
- `wiki_list_articles` forwards opaque cursors unchanged.
- Invalid article IDs return `invalid-input` without calling the client.

- [ ] **Step 3: Run focused tests**

Run:

```bash
nix develop -c node --test tests/wiki-tools.test.js
```

Expected: failure because read tools are not registered in the scaffold.

- [ ] **Step 4: Implement provider and tool schemas**

Use Zod input schemas. Return MCP content as one JSON text item:

```js
{
  content: [
    {
      type: "text",
      text: JSON.stringify(result)
    }
  ]
}
```

Do not truncate `sourceHtml` in `wiki_get_article`. Search and list records
remain bounded by plugin limits.

- [ ] **Step 5: Add startup behavior**

Require `SOW_NODEBB_URL` only when starting the functional server process.
Keep `loadConfig({})` valid for unit tests and scaffold inspection.

- [ ] **Step 6: Verify with a fake HTTP server**

Run:

```bash
nix develop -c make check
```

Expected: all tests pass without contacting `westgate.pw`.

- [ ] **Step 7: Manually verify against local or production read-only API**

After the plugin API is deployed:

```bash
SOW_NODEBB_URL=https://westgate.pw \
  nix develop -c npm start
```

Connect an MCP client over stdio and invoke all three read tools. Do not enable
write stubs for this smoke test.

Review checkpoint: verify NodeBB access logs contain GET requests only.

---

### Task 6: MVP refinement and operational review

**Files:**

- Modify only files justified by observed MVP behavior.
- Add focused tests beside every refinement.

**Interfaces:**

- Consumes: deployed read-only API and working MCP tools.
- Produces: a stable Phase 1 contract suitable for later write-design work.

- [ ] **Step 1: Capture representative retrieval cases**

Exercise:

- One manually authored wiki article.
- One topdata-managed article.
- One large table-heavy article.
- One nested canonical path.
- One anonymous-forbidden article using a dedicated read token.
- Search with zero, one, and many results.

Record only payload shape, timing, and size; do not copy secrets or private
article content into Git.

- [ ] **Step 2: Add regression tests for observed defects**

For each defect, first add one failing test with the smallest payload that
reproduces it. Keep plugin-domain fixes in `sow-nodebb-plugin-wiki` and
transport/mapping fixes in `sow-mcp-server`.

- [ ] **Step 3: Evaluate retrieval quality before adding infrastructure**

Compare NodeBB search results against the representative cases. Add a vector
store only under a separately approved design if live search and article
retrieval demonstrably fail the intended use cases.

- [ ] **Step 4: Run both complete suites**

Run:

```bash
cd sow-nodebb-plugin-wiki
npm test

cd ../sow-mcp-server
nix develop -c make check
```

Expected: both suites pass.

- [ ] **Step 5: Produce an MVP review**

Document:

- Final API and MCP schemas.
- Measured response sizes and latency.
- Permission behavior.
- Topdata behavior.
- Known retrieval limitations.
- Whether Phase 3 write design should proceed.

Review checkpoint: request explicit approval before designing or implementing
functional write tools or site-page mutation.
