You are working in an existing NodeBB wiki plugin repository.

The plugin’s current purpose is to treat NodeBB topics/posts in a configured wiki category, including subcategories, as wiki articles. Your task is to design and begin implementing an MCP server integration inside this plugin so AI agents can safely query, draft, create, update, and synchronize wiki articles.

## Primary Goal

Add an MCP server layer to the existing NodeBB wiki plugin that exposes article-oriented tools to AI agents.

Do not expose raw unrestricted NodeBB API access. The MCP server should present safe wiki-level operations such as:

* search wiki articles
* read an article
* list article categories
* create an article
* update an article
* preview/diff an article edit
* upsert an article from Markdown or Obsidian-style source documents
* optionally move, tag, lock, or unpublish articles with stricter permissions

The integration should make AI agents useful for wiki maintenance while minimizing accidental or malicious forum-wide damage.

## Repository Doctrine

Follow the repository’s existing architecture, conventions, linting, formatting, and plugin style.

Prefer:

* clear boundaries
* simple abstractions
* small, testable modules
* safe defaults
* explicit permissions
* auditability
* article-oriented APIs over raw NodeBB primitives

Avoid:

* exposing arbitrary NodeBB endpoints to agents
* granting admin-equivalent power by default
* making the AI reason about raw `tid`, `pid`, or `cid` values unless necessary
* destructive writes without validation
* broad category access outside the configured wiki root
* tight coupling to a single AI client

## Initial Research Tasks

First inspect the repository and identify:

1. Plugin entry points.
2. Existing route/API registration.
3. Existing wiki category configuration.
4. How articles are currently derived from NodeBB topics/posts.
5. Whether the plugin already has a database/settings layer.
6. Whether markdown rendering, slugging, category traversal, or topic lookup utilities already exist.
7. Existing test setup.
8. NodeBB version assumptions and available internal APIs.

Then produce a brief implementation plan before editing code.

## Desired Architecture

Design the feature as a narrow internal service layer plus MCP transport.

Suggested modules:

```text
src/
  mcp/
    server.ts
    tools.ts
    schemas.ts
    auth.ts
  wiki/
    article-service.ts
    article-search.ts
    article-upsert.ts
    article-diff.ts
    article-permissions.ts
    article-audit.ts
```

Adapt paths to the repository’s actual structure.

The MCP layer should be thin. Most logic should live in reusable wiki service modules.

## Article Model

Treat a wiki article as an abstraction over a NodeBB topic.

Recommended mapping:

```text
Article = topic in configured wiki category/subcategory
Article body = first post content
Article title = topic title
Article slug = plugin-defined slug or derived normalized title/path
Article comments/history = topic replies and NodeBB post edit history where available
Article namespace = category/subcategory path
Article state = visible / deleted / locked / pinned / draft if implemented
```

Do not require agents to know NodeBB internals for common tasks.

## MCP Tools to Implement First

Start with read-only tools.

### `wiki_search`

Search only inside the configured wiki root category and its allowed subcategories.

Input:

```ts
{
  query: string;
  categoryPath?: string;
  limit?: number;
}
```

Output:

```ts
{
  results: Array<{
    articleId: string;
    title: string;
    slug?: string;
    categoryPath: string;
    excerpt: string;
    url?: string;
    updatedAt?: string;
  }>;
}
```

### `wiki_get_article`

Fetch one article by slug, topic id, or canonical article id.

Input:

```ts
{
  articleId?: string;
  slug?: string;
  includeReplies?: boolean;
}
```

Output:

```ts
{
  articleId: string;
  topicId: number;
  firstPostId: number;
  title: string;
  slug?: string;
  categoryPath: string;
  body: string;
  tags?: string[];
  url?: string;
  updatedAt?: string;
  replies?: Array<{
    postId: number;
    author: string;
    body: string;
    createdAt?: string;
  }>;
}
```

### `wiki_list_articles`

List articles under a category path or the wiki root.

Input:

```ts
{
  categoryPath?: string;
  recursive?: boolean;
  limit?: number;
  offset?: number;
}
```

Output:

```ts
{
  articles: Array<{
    articleId: string;
    title: string;
    slug?: string;
    categoryPath: string;
    url?: string;
    updatedAt?: string;
  }>;
}
```

## Draft and Write Tools

After read-only tools work, implement safe write tools.

### `wiki_preview_update`

Compute a proposed article update without writing it.

Input:

```ts
{
  articleId: string;
  newBody: string;
}
```

Output:

```ts
{
  articleId: string;
  title: string;
  oldBody: string;
  newBody: string;
  diff: string;
  warnings: string[];
}
```

### `wiki_update_article`

Update the first post of an existing article.

Input:

```ts
{
  articleId: string;
  body: string;
  editReason?: string;
  requireApproval?: boolean;
}
```

Behavior:

* Validate the article belongs to the allowed wiki category tree.
* Validate the bot/user has permission.
* If approval mode is enabled, create a proposal instead of editing directly.
* Preserve replies.
* Add an edit reason when supported.
* Record an audit entry.
* Return the updated article metadata.

### `wiki_create_article`

Create a new wiki article as a NodeBB topic in an allowed wiki category.

Input:

```ts
{
  categoryPath: string;
  title: string;
  body: string;
  tags?: string[];
  sourcePath?: string;
}
```

Behavior:

* Resolve `categoryPath` against the configured wiki root.
* Reject categories outside the wiki tree.
* Validate title/body.
* Create the topic as a configured bot user or authenticated NodeBB user.
* Store source metadata if provided.

### `wiki_upsert_article`

Create or update an article from source metadata, useful for Obsidian vault synchronization.

Input:

```ts
{
  sourcePath: string;
  categoryPath: string;
  slug?: string;
  title: string;
  body: string;
  tags?: string[];
  mode?: "draft" | "publish" | "replace" | "patch";
}
```

Behavior:

* Use a stable mapping between `sourcePath` and article/topic ids.
* If the article exists, update it.
* If it does not exist, create it.
* Avoid fuzzy matching unless explicitly requested.
* Store or update source metadata.
* Return whether the operation created, updated, or drafted the article.

## Source Mapping

Add a durable mapping table or settings-backed storage if the plugin does not already have one.

Required fields:

```text
source_path
article_id
topic_id
first_post_id
slug
category_id
content_hash
last_synced_at
last_synced_by
```

This is important for Obsidian synchronization. Do not rely only on title matching.

## Permissions

Implement permission tiers.

Suggested tiers:

```text
read:
  Can search and fetch articles.

draft:
  Can produce previews, diffs, and proposed updates.

write:
  Can create/update articles inside allowed wiki categories.

admin:
  Can move, delete, lock, pin, bulk import, or rebuild indexes.
```

The default should be read-only unless explicitly configured.

All write tools must verify:

* target category is inside the configured wiki root
* target topic is a wiki article
* target post is the first post when editing article body
* user/token has the required permission tier
* operation is not destructive unless explicitly allowed

## Configuration

Add plugin settings for:

```text
mcp.enabled
mcp.transport
mcp.allowedOrigins / allowedClients if applicable
mcp.permissionMode
mcp.requireApprovalForWrites
mcp.botUid
mcp.wikiRootCategoryId
mcp.allowedCategoryIds
mcp.allowSubcategories
mcp.enableBulkImport
mcp.maxBodyLength
mcp.maxBulkItems
mcp.auditLogEnabled
```

Prefer safe defaults:

```text
mcp.enabled = false
mcp.permissionMode = read
mcp.requireApprovalForWrites = true
mcp.enableBulkImport = false
```

## Audit Logging

Every write-capable tool should produce an audit record.

Audit entry should include:

```text
timestamp
tool name
actor / bot uid
target article id
target topic id
target post id
operation type
source path if any
old hash
new hash
edit reason
result
```

Use existing NodeBB logging/storage if appropriate. Otherwise create a plugin-specific audit store.

## Markdown and Obsidian Support

Support plain Markdown as the initial format.

For Obsidian-style vault imports, handle or explicitly document the initial limits around:

* YAML frontmatter
* `[[wikilinks]]`
* embedded images
* attachments
* callouts
* tags
* aliases
* heading anchors

Initial implementation may simply preserve unsupported syntax, but should not corrupt it.

Recommended first pass:

```text
frontmatter title -> NodeBB topic title if present
frontmatter tags -> NodeBB tags if enabled
file path -> source_path
file basename/path -> slug fallback
body markdown -> first post body
```

Do not implement attachment upload until the core article upsert flow is stable.

## Safety Requirements

Do not expose a generic `nodebb_call_api` tool.

Do not allow MCP clients to select arbitrary user ids.

Do not allow writes outside the configured wiki tree.

Do not allow deletes in the first implementation.

Do not allow bulk import unless explicitly enabled.

Do not silently overwrite articles when source mapping is missing and only a fuzzy title match exists. Return a conflict instead.

For conflicting matches, return:

```ts
{
  status: "conflict";
  candidates: [...];
  message: "Multiple possible articles found. Explicit articleId or mapping required."
}
```

## Testing Requirements

Add tests for:

* category allowlist enforcement
* recursive wiki category traversal
* article lookup by slug/id
* source path mapping
* upsert creates a new topic when no mapping exists
* upsert updates the mapped topic when mapping exists
* write attempts outside wiki root are rejected
* draft/approval mode does not mutate posts
* audit entries are created for writes
* unsupported Obsidian syntax is preserved, not destroyed

If the repo lacks a test framework, add minimal tests around pure service functions and document how NodeBB integration should be manually verified.

## Manual Verification

Provide a short manual test checklist:

1. Enable MCP in plugin settings.
2. Configure wiki root category.
3. Start NodeBB.
4. Start or connect MCP client.
5. Run `wiki_search`.
6. Run `wiki_get_article`.
7. Run `wiki_preview_update`.
8. Create a test article in a sandbox wiki category.
9. Update the test article.
10. Verify audit log.
11. Verify no non-wiki category can be edited.

## Deliverables

Implement the smallest safe vertical slice first:

1. Configuration scaffolding.
2. Article service abstraction.
3. Read-only MCP tools:

   * `wiki_search`
   * `wiki_get_article`
   * `wiki_list_articles`
4. Basic permission checks.
5. Then add:

   * `wiki_preview_update`
   * `wiki_create_article`
   * `wiki_update_article`
6. Finally add:

   * `wiki_upsert_article`
   * source path mapping
   * audit logging

Do not try to implement every admin feature in the first pass.

## Expected Final Response

When finished, report:

* what files were added or changed
* what MCP tools now exist
* how to enable/configure the MCP server
* what safety controls are implemented
* what remains incomplete
* how to manually test the integration

Begin by inspecting the repository structure and existing plugin code. Then propose the minimal implementation plan before making changes.
