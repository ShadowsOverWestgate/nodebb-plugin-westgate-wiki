# Wiki Revision History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile NodeBB post-history reliance with plugin-owned wiki revision history, deterministic restore, and recoverable tombstone deletion.

**Architecture:** Add a checkpointed patch journal for wiki article source HTML, explicit wiki revision permissions, and plugin-owned tombstones. Keep NodeBB topics/categories as storage authority, but route saves, restores, deletes, tree/listing visibility, and history UI through focused wiki services.

**Tech Stack:** NodeBB 4 plugin APIs, Node.js CommonJS, NodeBB database/topic/post/privilege services, `diff` npm package, existing `node --test` test harness, Benchpress templates, existing `public/wiki.js` client patterns.

---

## File Structure

- Modify `package.json`: add direct `diff` dependency for patch creation/application.
- Modify `plugin.json`: register custom category privilege init hook and add `public/wiki-history.js` to the script list.
- Modify `library.js`: wire revision permissions, revision API routes, tombstone delete API, hard purge API, exported services, and create/save hooks.
- Create `lib/wiki-revisions.js`: revision ids, storage keys, hashes, patch/checkpoint planning, reconstruction, diff comparison, and repair diagnostics.
- Create `lib/wiki-tombstones.js`: topic-field tombstone state, visibility predicates, tombstone/clear/hard-purge lifecycle, cache invalidation.
- Create `lib/wiki-revision-permissions.js`: custom privilege registration and category-scoped permission checks.
- Create `lib/wiki-revision-actions.js`: API handlers for list/detail/diff/restore/tombstone/hard-purge.
- Create `lib/controllers/wiki-revisions.js`: server-rendered `/wiki/history/:tid` page.
- Modify `lib/wiki-page-actions.js`: record revisions for save and move; restore uses the same post-edit validation sequence from `lib/wiki-revision-actions.js`.
- Modify `lib/topic-service.js`: hide tombstoned pages from normal article views; expose history/restore render permissions for visible pages.
- Modify `lib/wiki-tree-index.js`: exclude tombstoned topics from canonical tree input and path resolution.
- Modify `lib/wiki-directory-service.js`: exclude tombstoned topics from directory windows, slug scans, and page validation rows.
- Modify `lib/wiki-search-service.js`, `lib/wiki-link-autocomplete.js`, `lib/wiki-links.js`: rely on tombstone-filtered summaries/tree results and add direct safeguards where needed.
- Modify `lib/wiki-discussion-placeholder.js`: suppress public wiki article links for tombstoned topics unless the viewer has history/restore authority.
- Modify `lib/wiki-topic-purge.js`: stop normal wiki delete from hard purging; keep cache invalidation for explicit hard purge.
- Modify `routes/wiki.js`: register `/wiki/history/:tid` and add history button render data.
- Modify `templates/wiki-page.tpl`: add history FAB action; change delete action to tombstone endpoint.
- Create `templates/wiki-history.tpl`: revision timeline shell.
- Modify `public/wiki.js`: delete uses tombstone endpoint; hard-purge confirmation lives in `public/wiki-history.js`.
- Create `public/wiki-history.js`: load diff/detail, preview, and restore actions.
- Modify `public/wiki.css`: history/tombstone UI styles if not colocated elsewhere.
- Create tests:
  - `tests/wiki-revisions.test.js`
  - `tests/wiki-revision-permissions.test.js`
  - `tests/wiki-tombstones.test.js`
  - `tests/wiki-revision-actions.test.js`
  - `tests/wiki-tombstone-visibility.test.js`
  - update `tests/wiki-page-actions.test.js`
  - update `tests/wiki-canonical-node-route.test.js`
  - update `tests/wiki-directory-stale-count.test.js`
  - update `tests/wiki-page-actions.test.js` client/template assertions

## Storage Contract

Use plugin-owned keys and topic fields:

- Revision list key: `westgate-wiki:revisions:${tid}` with latest revision id first.
- Revision record key: `westgate-wiki:revision:${tid}:${revisionId}`.
- Revision meta key: `westgate-wiki:revisions:${tid}:meta` with `latestRevisionId` and `revisionCount`.
- Tombstone topic fields:
  - `westgateWikiTombstoned`
  - `westgateWikiTombstoneAt`
  - `westgateWikiTombstoneUid`
  - `westgateWikiTombstoneRevisionId`
  - `westgateWikiTombstoneReason`

Use sanitized source HTML for revision payloads. Never store rendered read-only HTML as revision source.

---

### Task 1: Add Revision Dependency And Storage Unit Tests

**Files:**
- Modify: `package.json`
- Create: `tests/wiki-revisions.test.js`

- [ ] **Step 1: Add direct `diff` dependency**

Modify `package.json` dependencies:

```json
"dependencies": {
  "diff": "9.0.0",
  "highlight.js": "^11.11.1",
  "jsdom": "^29.1.1",
  "sanitize-html": "^2.17.4",
  "transliteration": "^2.6.1"
}
```

- [ ] **Step 2: Write failing revision storage tests**

Create `tests/wiki-revisions.test.js` with these cases:

```js
"use strict";

const assert = require("node:assert/strict");

const state = {
  now: 1000,
  objects: new Map(),
  lists: new Map()
};

const originalMainRequire = require.main.require.bind(require.main);

function list(key) {
  if (!state.lists.has(key)) {
    state.lists.set(key, []);
  }
  return state.lists.get(key);
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/database": {
      getObject: async (key) => state.objects.get(key) || null,
      setObject: async (key, value) => state.objects.set(key, { ...value }),
      delete: async (key) => {
        state.objects.delete(key);
        state.lists.delete(key);
      },
      listPrepend: async (key, value) => list(key).unshift(String(value)),
      listAppend: async (key, value) => list(key).push(String(value)),
      getListRange: async (key, start, stop) => {
        const rows = list(key);
        const from = Math.max(0, parseInt(start, 10) || 0);
        const parsedStop = parseInt(stop, 10);
        const to = parsedStop === -1 ? rows.length : parsedStop + 1;
        return rows.slice(from, to);
      },
      listLength: async (key) => list(key).length
    }
  };
  return stubs[id] || originalMainRequire(id);
};

const revisions = require("../lib/wiki-revisions");

revisions.setNowProvider(() => state.now);
revisions.setRevisionIdProvider((input) => `rev-${input.tid}-${input.timestamp}-${input.action}`);

function reset() {
  state.now = 1000;
  state.objects = new Map();
  state.lists = new Map();
}

(async () => {
  reset();
  const first = await revisions.appendRevision({
    tid: 10,
    pid: 100,
    cid: 5,
    uid: 2,
    action: "edit",
    title: "Page",
    oldSource: "",
    newSource: "<p>One</p>"
  });
  assert.equal(first.checkpoint, true);

  state.now += 1;
  const second = await revisions.appendRevision({
    tid: 10,
    pid: 100,
    cid: 5,
    uid: 3,
    action: "edit",
    title: "Page",
    oldSource: "<p>One</p>",
    newSource: "<p>One</p>\n<p>Two</p>"
  });
  assert.equal(second.checkpoint, false);

  const latest = await revisions.reconstructRevision(10, second.revisionId);
  assert.equal(latest.source, "<p>One</p>\n<p>Two</p>");

  const rows = await revisions.listRevisions(10);
  assert.deepEqual(rows.map((row) => row.revisionId), [second.revisionId, first.revisionId]);

  reset();
  await revisions.appendRevision({ tid: 11, pid: 110, cid: 5, uid: 1, action: "edit", title: "Blanked", oldSource: "<p>Safe</p>", newSource: "" });
  const blank = await revisions.listRevisions(11);
  assert.equal(blank[0].newBytes, 0);
  assert.equal(blank[0].checkpoint, true);

  reset();
  const base = await revisions.appendRevision({ tid: 12, pid: 120, cid: 5, uid: 1, action: "edit", title: "Broken", oldSource: "", newSource: "<p>A</p>" });
  const edit = await revisions.appendRevision({ tid: 12, pid: 120, cid: 5, uid: 1, action: "edit", title: "Broken", oldSource: "<p>A</p>", newSource: "<p>B</p>" });
  state.objects.get(`westgate-wiki:revision:12:${edit.revisionId}`).afterHash = "bad";
  await assert.rejects(
    () => revisions.reconstructRevision(12, edit.revisionId),
    /revision-hash-mismatch/
  );
  assert.equal((await revisions.reconstructRevision(12, base.revisionId)).source, "<p>A</p>");

  require.main.require = originalMainRequire;
  console.log("wiki revisions tests passed");
})().catch((err) => {
  require.main.require = originalMainRequire;
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the failing test**

Run: `node --test tests/wiki-revisions.test.js`

Expected: FAIL with `Cannot find module '../lib/wiki-revisions'`.

- [ ] **Step 4: Commit failing test**

```bash
git add package.json tests/wiki-revisions.test.js
git commit -m "test: cover wiki revision journal storage"
```

### Task 2: Implement Core Revision Journal

**Files:**
- Create: `lib/wiki-revisions.js`
- Test: `tests/wiki-revisions.test.js`

- [ ] **Step 1: Implement revision service**

Create `lib/wiki-revisions.js`:

```js
"use strict";

const crypto = require("node:crypto");
const diff = require("diff");

const db = require.main.require("./src/database");

const REVISION_LIST_PREFIX = "westgate-wiki:revisions";
const REVISION_RECORD_PREFIX = "westgate-wiki:revision";
const DEFAULT_CHECKPOINT_INTERVAL = 25;
const LARGE_PATCH_RATIO = 0.8;

let nowProvider = () => Date.now();
let revisionIdProvider = null;

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function listKey(tid) {
  return `${REVISION_LIST_PREFIX}:${tid}`;
}

function metaKey(tid) {
  return `${REVISION_LIST_PREFIX}:${tid}:meta`;
}

function recordKey(tid, revisionId) {
  return `${REVISION_RECORD_PREFIX}:${tid}:${revisionId}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function bytes(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function createRevisionId(input) {
  if (revisionIdProvider) {
    return revisionIdProvider(input);
  }
  if (typeof crypto.randomUUID === "function") {
    return `wrev_${crypto.randomUUID()}`;
  }
  return `wrev_${crypto.randomBytes(18).toString("base64url")}`;
}

async function getRevisionIds(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return [];
  }
  return db.getListRange(listKey(parsedTid), 0, -1);
}

async function getRevisionRecord(tid, revisionId) {
  const parsedTid = toPositiveInt(tid);
  const id = String(revisionId || "");
  if (!parsedTid || !id) {
    return null;
  }
  const record = await db.getObject(recordKey(parsedTid, id));
  return record && record.revisionId ? record : null;
}

async function listRevisions(tid) {
  const ids = await getRevisionIds(tid);
  const rows = [];
  for (const id of ids) {
    const record = await getRevisionRecord(tid, id);
    if (record) {
      rows.push(record);
    }
  }
  return rows;
}

function shouldCheckpoint(input) {
  if (!input.parentRevisionId) {
    return true;
  }
  if (input.action === "tombstone" || input.action === "restore" || input.action === "repair-checkpoint") {
    return true;
  }
  if (!String(input.newSource || "").trim()) {
    return true;
  }
  if (input.revisionCount > 0 && input.revisionCount % DEFAULT_CHECKPOINT_INTERVAL === 0) {
    return true;
  }
  return input.patchBytes > Math.max(1, input.newBytes) * LARGE_PATCH_RATIO;
}

async function getLatestMeta(tid) {
  return await db.getObject(metaKey(tid)) || {};
}

async function appendRevision(input = {}) {
  const tid = toPositiveInt(input.tid);
  const pid = toPositiveInt(input.pid);
  const cid = toPositiveInt(input.cid);
  const uid = toPositiveInt(input.uid);
  const action = String(input.action || "edit");
  if (!tid || !pid || !cid || !uid) {
    throw new Error("invalid-wiki-revision-input");
  }

  const oldSource = String(input.oldSource || "");
  const newSource = String(input.newSource || "");
  const meta = await getLatestMeta(tid);
  const parentRevisionId = String(input.parentRevisionId || meta.latestRevisionId || "");
  const revisionCount = parseInt(meta.revisionCount, 10) || 0;
  const timestamp = parseInt(input.timestamp, 10) || nowProvider();
  const patch = diff.createPatch("wiki-article.html", oldSource, newSource);
  const patchBytes = bytes(patch);
  const newBytes = bytes(newSource);
  const checkpoint = shouldCheckpoint({ action, parentRevisionId, revisionCount, patchBytes, newBytes, newSource });
  const revisionId = createRevisionId({ tid, pid, cid, uid, action, timestamp });

  const record = {
    revisionId,
    parentRevisionId,
    tid: String(tid),
    pid: String(pid),
    cid: String(cid),
    uid: String(uid),
    action,
    timestamp: String(timestamp),
    title: String(input.title || ""),
    canonicalPath: String(input.canonicalPath || ""),
    wikiPath: String(input.wikiPath || ""),
    beforeHash: sha256(oldSource),
    afterHash: sha256(newSource),
    oldBytes: String(bytes(oldSource)),
    newBytes: String(newBytes),
    patchBytes: String(patchBytes),
    checkpoint: checkpoint ? "1" : "0",
    patch: checkpoint ? "" : patch,
    checkpointSource: checkpoint ? newSource : "",
    restoreSourceRevisionId: String(input.restoreSourceRevisionId || ""),
    tombstoneReason: String(input.tombstoneReason || "")
  };

  await db.setObject(recordKey(tid, revisionId), record);
  await db.listPrepend(listKey(tid), revisionId);
  await db.setObject(metaKey(tid), {
    latestRevisionId: revisionId,
    revisionCount: String(revisionCount + 1)
  });
  return { ...record, checkpoint: checkpoint };
}

async function reconstructRevision(tid, revisionId) {
  const rowsLatestFirst = await listRevisions(tid);
  const rowsChronological = rowsLatestFirst.slice().reverse();
  const targetIndex = rowsChronological.findIndex((row) => row.revisionId === String(revisionId || ""));
  if (targetIndex === -1) {
    throw new Error("revision-not-found");
  }

  let checkpointIndex = targetIndex;
  while (checkpointIndex >= 0 && rowsChronological[checkpointIndex].checkpoint !== "1") {
    checkpointIndex -= 1;
  }
  if (checkpointIndex < 0) {
    throw new Error("revision-checkpoint-missing");
  }

  let source = String(rowsChronological[checkpointIndex].checkpointSource || "");
  if (sha256(source) !== rowsChronological[checkpointIndex].afterHash) {
    throw new Error("revision-hash-mismatch");
  }

  for (let i = checkpointIndex + 1; i <= targetIndex; i += 1) {
    const next = diff.applyPatch(source, rowsChronological[i].patch || "");
    if (typeof next !== "string") {
      throw new Error("revision-patch-apply-failed");
    }
    source = next;
    if (sha256(source) !== rowsChronological[i].afterHash) {
      throw new Error("revision-hash-mismatch");
    }
  }

  return {
    revision: rowsChronological[targetIndex],
    source
  };
}

function compareSources(oldSource, newSource) {
  return diff.createPatch("wiki-article.html", String(oldSource || ""), String(newSource || ""));
}

function setNowProvider(fn) {
  nowProvider = typeof fn === "function" ? fn : () => Date.now();
}

function setRevisionIdProvider(fn) {
  revisionIdProvider = typeof fn === "function" ? fn : null;
}

module.exports = {
  appendRevision,
  compareSources,
  getRevisionRecord,
  listRevisions,
  reconstructRevision,
  setNowProvider,
  setRevisionIdProvider,
  _private: {
    listKey,
    metaKey,
    recordKey,
    sha256
  }
};
```

- [ ] **Step 2: Run revision tests**

Run: `node --test tests/wiki-revisions.test.js`

Expected: PASS.

- [ ] **Step 3: Commit core revision service**

```bash
git add lib/wiki-revisions.js tests/wiki-revisions.test.js package.json
git commit -m "feat: add wiki revision journal"
```

### Task 3: Register Wiki Revision Privileges

**Files:**
- Modify: `plugin.json`
- Modify: `library.js`
- Create: `lib/wiki-revision-permissions.js`
- Create: `tests/wiki-revision-permissions.test.js`

- [ ] **Step 1: Write failing permissions test**

Create `tests/wiki-revision-permissions.test.js`:

```js
"use strict";

const assert = require("node:assert/strict");

const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/privileges": {
      categories: {
        can: async (privilege, cid, uid) => (
          privilege === "wiki:history" && parseInt(cid, 10) === 10 && parseInt(uid, 10) === 2
        ) || (
          privilege === "wiki:restore" && parseInt(cid, 10) === 10 && parseInt(uid, 10) === 3
        ) || (
          privilege === "wiki:hard-purge" && parseInt(cid, 10) === 10 && parseInt(uid, 10) === 4
        )
      }
    }
  };
  return stubs[id] || originalMainRequire(id);
};

const permissions = require("../lib/wiki-revision-permissions");

(async () => {
  const map = new Map();
  permissions.addCategoryPrivileges({ privileges: map });
  assert.equal(map.get("wiki:history").label, "Wiki: view revision history");
  assert.equal(map.get("wiki:restore").type, "moderation");
  assert.equal(map.get("wiki:hard-purge").type, "moderation");

  assert.equal(await permissions.canViewHistory(10, 2), true);
  assert.equal(await permissions.canViewHistory(10, 1), false);
  assert.equal(await permissions.canRestore(10, 3), true);
  assert.equal(await permissions.canHardPurge(10, 4), true);

  require.main.require = originalMainRequire;
  console.log("wiki revision permissions tests passed");
})().catch((err) => {
  require.main.require = originalMainRequire;
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run failing permissions test**

Run: `node --test tests/wiki-revision-permissions.test.js`

Expected: FAIL with `Cannot find module '../lib/wiki-revision-permissions'`.

- [ ] **Step 3: Implement permission service**

Create `lib/wiki-revision-permissions.js`:

```js
"use strict";

const privileges = require.main.require("./src/privileges");

const WIKI_HISTORY = "wiki:history";
const WIKI_RESTORE = "wiki:restore";
const WIKI_HARD_PURGE = "wiki:hard-purge";

function addCategoryPrivileges(payload) {
  const map = payload && payload.privileges;
  if (!map || typeof map.set !== "function") {
    return payload;
  }
  map.set(WIKI_HISTORY, { label: "Wiki: view revision history", type: "moderation" });
  map.set(WIKI_RESTORE, { label: "Wiki: restore revisions", type: "moderation" });
  map.set(WIKI_HARD_PURGE, { label: "Wiki: hard purge tombstones", type: "moderation" });
  return payload;
}

async function can(privilege, cid, uid) {
  return !!(await privileges.categories.can(privilege, cid, uid));
}

module.exports = {
  WIKI_HISTORY,
  WIKI_RESTORE,
  WIKI_HARD_PURGE,
  addCategoryPrivileges,
  canViewHistory: (cid, uid) => can(WIKI_HISTORY, cid, uid),
  canRestore: (cid, uid) => can(WIKI_RESTORE, cid, uid),
  canHardPurge: (cid, uid) => can(WIKI_HARD_PURGE, cid, uid)
};
```

- [ ] **Step 4: Wire hook**

Add to `plugin.json` hooks:

```json
{
  "hook": "static:privileges.categories.init",
  "method": "addWikiRevisionCategoryPrivileges"
}
```

Add to `library.js`:

```js
const wikiRevisionPermissions = require("./lib/wiki-revision-permissions");
```

and:

```js
plugin.addWikiRevisionCategoryPrivileges = wikiRevisionPermissions.addCategoryPrivileges;
```

Add to `plugin.services`:

```js
wikiRevisionPermissions,
```

- [ ] **Step 5: Run permissions test**

Run: `node --test tests/wiki-revision-permissions.test.js`

Expected: PASS.

- [ ] **Step 6: Commit privileges**

```bash
git add plugin.json library.js lib/wiki-revision-permissions.js tests/wiki-revision-permissions.test.js
git commit -m "feat: add wiki revision privileges"
```

### Task 4: Add Tombstone Service

**Files:**
- Create: `lib/wiki-tombstones.js`
- Create: `tests/wiki-tombstones.test.js`

- [ ] **Step 1: Write failing tombstone tests**

Create `tests/wiki-tombstones.test.js` with assertions for `setTombstone`, `clearTombstone`, `isTombstonedTopic`, `getTombstone`, and `hardPurgeTombstone` requiring tombstone state.

Use topic stubs with `getTopicFields`, `setTopicField`, and `purgePostsAndTopic`; database stubs are not needed for topic fields.

- [ ] **Step 2: Run failing tombstone test**

Run: `node --test tests/wiki-tombstones.test.js`

Expected: FAIL with `Cannot find module '../lib/wiki-tombstones'`.

- [ ] **Step 3: Implement tombstone service**

Create `lib/wiki-tombstones.js` with:

```js
"use strict";

const topics = require.main.require("./src/topics");

const TOMBSTONE_FIELDS = [
  "westgateWikiTombstoned",
  "westgateWikiTombstoneAt",
  "westgateWikiTombstoneUid",
  "westgateWikiTombstoneRevisionId",
  "westgateWikiTombstoneReason"
];

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function isTombstonedTopic(topic) {
  return String(topic && topic.westgateWikiTombstoned || "") === "1";
}

function getTombstoneFromFields(fields) {
  if (!isTombstonedTopic(fields)) {
    return null;
  }
  return {
    tombstoned: true,
    at: toPositiveInt(fields.westgateWikiTombstoneAt),
    uid: toPositiveInt(fields.westgateWikiTombstoneUid),
    revisionId: String(fields.westgateWikiTombstoneRevisionId || ""),
    reason: String(fields.westgateWikiTombstoneReason || "")
  };
}

async function getTombstone(tid) {
  const fields = await topics.getTopicFields(tid, TOMBSTONE_FIELDS);
  return getTombstoneFromFields(fields || {});
}

async function setTopicField(tid, field, value) {
  if (typeof topics.setTopicField === "function") {
    await topics.setTopicField(tid, field, value);
  }
}

async function setTombstone({ tid, uid, revisionId, reason, timestamp }) {
  const parsedTid = toPositiveInt(tid);
  const parsedUid = toPositiveInt(uid);
  if (!parsedTid || !parsedUid || !revisionId) {
    throw new Error("invalid-wiki-tombstone");
  }
  const at = parseInt(timestamp, 10) || Date.now();
  await setTopicField(parsedTid, "westgateWikiTombstoned", "1");
  await setTopicField(parsedTid, "westgateWikiTombstoneAt", String(at));
  await setTopicField(parsedTid, "westgateWikiTombstoneUid", String(parsedUid));
  await setTopicField(parsedTid, "westgateWikiTombstoneRevisionId", String(revisionId));
  await setTopicField(parsedTid, "westgateWikiTombstoneReason", String(reason || ""));
  return { tid: parsedTid, uid: parsedUid, revisionId: String(revisionId), at, reason: String(reason || "") };
}

async function clearTombstone(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    throw new Error("invalid-wiki-tombstone");
  }
  await Promise.all(TOMBSTONE_FIELDS.map((field) => setTopicField(parsedTid, field, "")));
  return { tid: parsedTid, cleared: true };
}

async function hardPurgeTombstone(tid, uid) {
  const parsedTid = toPositiveInt(tid);
  const tombstone = await getTombstone(parsedTid);
  if (!tombstone) {
    throw new Error("wiki-page-not-tombstoned");
  }
  await topics.purgePostsAndTopic([parsedTid], uid);
  return { tid: parsedTid, purged: true };
}

module.exports = {
  TOMBSTONE_FIELDS,
  clearTombstone,
  getTombstone,
  getTombstoneFromFields,
  hardPurgeTombstone,
  isTombstonedTopic,
  setTombstone
};
```

- [ ] **Step 4: Run tombstone tests**

Run: `node --test tests/wiki-tombstones.test.js`

Expected: PASS.

- [ ] **Step 5: Commit tombstone service**

```bash
git add lib/wiki-tombstones.js tests/wiki-tombstones.test.js
git commit -m "feat: add wiki tombstone storage"
```

### Task 5: Exclude Tombstones From Public Wiki Surfaces

**Files:**
- Modify: `lib/wiki-tree-index.js`
- Modify: `lib/wiki-directory-service.js`
- Modify: `lib/topic-service.js`
- Modify: `lib/wiki-discussion-placeholder.js`
- Modify: `lib/wiki-search-service.js`
- Modify: `lib/wiki-link-autocomplete.js`
- Test: `tests/wiki-tombstone-visibility.test.js`
- Update: `tests/wiki-canonical-node-route.test.js`
- Update: `tests/wiki-directory-stale-count.test.js`

- [ ] **Step 1: Write visibility regression tests**

Create `tests/wiki-tombstone-visibility.test.js` covering:

- `wiki-tree-index.collectRuntimeInput` includes tombstone fields and excludes tombstoned topics from routes.
- `wiki-directory-service.getOrderedSummaries` filters tombstoned topics.
- `topic-service.getWikiPage` returns `not-found` for normal users on tombstoned topics.
- `wiki-discussion-placeholder.filterTopicBuild` does not render a public article link for tombstoned topics.

- [ ] **Step 2: Run failing visibility tests**

Run: `node --test tests/wiki-tombstone-visibility.test.js`

Expected: FAIL because tombstone fields are not read or filtered.

- [ ] **Step 3: Filter tree input**

In `lib/wiki-tree-index.js`, import:

```js
const wikiTombstones = require("./wiki-tombstones");
```

Add the tombstone fields to topic field collection:

```js
const topicFields = [
  "tid",
  "cid",
  "title",
  "titleRaw",
  "slug",
  "deleted",
  "scheduled",
  "postcount"
].concat(wikiTombstones.TOMBSTONE_FIELDS);
```

Then filter:

```js
topicRows = topicRows.filter((topic) => !wikiTombstones.isTombstonedTopic(topic));
```

- [ ] **Step 4: Filter directory rows**

In `lib/wiki-directory-service.js`, add tombstone fields to `TOPIC_SUMMARY_FIELDS` and slug scan fields, import `wiki-tombstones`, and filter in `fetchVisibleTopicChunks`, `getAllTopicSlugRows`, `findPageSlugMatchesForValidation`, and any manual topic-row filters:

```js
if (wikiTombstones.isTombstonedTopic(t)) {
  continue;
}
```

- [ ] **Step 5: Hide tombstoned topic-service pages**

In `lib/topic-service.js`, fetch `wikiTombstones.TOMBSTONE_FIELDS` with topic data or call `wikiTombstones.getTombstone(topicId)`. Return `{ status: "not-found" }` unless the caller explicitly requested tombstone access through a new internal option used by history routes.

- [ ] **Step 6: Suppress forum placeholder article links**

In `lib/wiki-discussion-placeholder.js`, load tombstone fields during `loadTopicDataIfNeeded` and skip placeholder replacement or render a non-link tombstone notice when `wikiTombstones.isTombstonedTopic(topicData)` is true.

- [ ] **Step 7: Run visibility tests**

Run:

```bash
node --test tests/wiki-tombstone-visibility.test.js
node --test tests/wiki-canonical-node-route.test.js
node --test tests/wiki-directory-stale-count.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit visibility filtering**

```bash
git add lib/wiki-tree-index.js lib/wiki-directory-service.js lib/topic-service.js lib/wiki-discussion-placeholder.js lib/wiki-search-service.js lib/wiki-link-autocomplete.js tests/wiki-tombstone-visibility.test.js tests/wiki-canonical-node-route.test.js tests/wiki-directory-stale-count.test.js
git commit -m "feat: hide tombstoned wiki pages"
```

### Task 6: Record Revisions On Wiki Saves, Moves, And Creates

**Files:**
- Modify: `lib/wiki-page-actions.js`
- Modify: `library.js`
- Test: `tests/wiki-page-actions.test.js`
- Create: `tests/wiki-revision-save-hooks.test.js`

- [ ] **Step 1: Write failing save integration test**

Update `tests/wiki-page-actions.test.js` to patch `../lib/wiki-revisions` and assert `saveWikiPage` calls `appendRevision` with sanitized old/new source after a successful `posts.edit`.

- [ ] **Step 2: Write failing create hook test**

Create `tests/wiki-revision-save-hooks.test.js` asserting `library.js` exposes an `action:topic.post` hook method that records a baseline `create` revision for wiki main posts.

- [ ] **Step 3: Run failing tests**

Run:

```bash
node --test tests/wiki-page-actions.test.js
node --test tests/wiki-revision-save-hooks.test.js
```

Expected: FAIL until revision calls are wired.

- [ ] **Step 4: Record save revisions**

In `lib/wiki-page-actions.js`, before `posts.edit`, load old first-post source:

```js
const before = await posts.getPostFields(mainPid, ["content", "sourceContent"]);
const oldSource = String((before && (before.sourceContent || before.content)) || "");
```

After successful storage verification, call:

```js
await wikiRevisions.appendRevision({
  tid,
  pid: mainPid,
  cid: currentCid,
  uid: req.uid,
  action: "edit",
  title,
  oldSource,
  newSource: sanitized,
  canonicalPath: updatedTopic && updatedTopic.canonicalPath,
  wikiPath
});
```

For `moveWikiPage`, append a `move` revision when title or `cid` changes; use identical old/new source if body did not change.

- [ ] **Step 5: Record create revisions**

Add a hook method in `library.js` that listens to successful `action:topic.post`, detects wiki namespace topics, loads the main post source, and appends a `create` revision. Reuse existing `syncPostedTopdataWikiPageSlug` hook ordering without weakening validation.

- [ ] **Step 6: Run save hook tests**

Run:

```bash
node --test tests/wiki-page-actions.test.js
node --test tests/wiki-revision-save-hooks.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit save integration**

```bash
git add library.js lib/wiki-page-actions.js tests/wiki-page-actions.test.js tests/wiki-revision-save-hooks.test.js
git commit -m "feat: record wiki article revisions"
```

### Task 7: Add Revision API And Restore Action

**Files:**
- Modify: `library.js`
- Create: `lib/wiki-revision-actions.js`
- Test: `tests/wiki-revision-actions.test.js`

- [ ] **Step 1: Write failing action tests**

Create `tests/wiki-revision-actions.test.js` covering:

- list requires `wiki:history`
- detail requires `wiki:history`
- diff requires `wiki:history`
- restore requires `wiki:restore`
- restore validates edit lock
- restore reconstructs, sanitizes, writes through `posts.edit`, appends a `restore` revision, clears tombstone, and invalidates caches
- hash mismatch returns an error and does not call `posts.edit`

- [ ] **Step 2: Run failing action test**

Run: `node --test tests/wiki-revision-actions.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement action handlers**

Create `lib/wiki-revision-actions.js` with exported handlers:

```js
listRevisions(req, res)
getRevision(req, res)
diffRevisions(req, res)
restoreRevision(req, res)
tombstonePage(req, res)
hardPurgePage(req, res)
```

Use `helpers.formatApiResponse`, `topicService.getWikiPage`, `wikiRevisionPermissions`, `wikiRevisions`, `wikiEditLocks`, `wikiPageValidation`, `posts.edit`, `wikiTombstones`, `wikiDirectory.invalidateNamespace`, and `wikiPaths.invalidateWikiTreeIndex`.

- [ ] **Step 4: Register API routes**

In `library.js`, register:

```js
GET /westgate-wiki/revisions/:tid
GET /westgate-wiki/revisions/:tid/:revisionId
GET /westgate-wiki/revisions/:tid/:fromRevisionId/:toRevisionId/diff
PUT /westgate-wiki/revisions/:tid/:revisionId/restore
PUT /westgate-wiki/page/tombstone
DELETE /westgate-wiki/page/hard-purge
```

All mutating routes require `middleware.ensureLoggedIn`; read routes also require login unless the implementation explicitly supports public history.

- [ ] **Step 5: Run action tests**

Run: `node --test tests/wiki-revision-actions.test.js`

Expected: PASS.

- [ ] **Step 6: Commit revision API**

```bash
git add library.js lib/wiki-revision-actions.js tests/wiki-revision-actions.test.js
git commit -m "feat: add wiki revision actions"
```

### Task 8: Replace Normal Delete With Tombstone

**Files:**
- Modify: `templates/wiki-page.tpl`
- Modify: `public/wiki.js`
- Modify: `lib/wiki-topic-purge.js`
- Update: `tests/wiki-page-actions.test.js`

- [ ] **Step 1: Write failing template/client assertions**

Update `tests/wiki-page-actions.test.js`:

```js
assert(template.includes("data-wiki-tombstone-page"), "article delete should use wiki tombstone action");
assert(!template.includes("data-wiki-delete-topic"), "normal wiki page template should not call NodeBB topic delete");
assert(client.includes("/api/v3/plugins/westgate-wiki/page/tombstone"), "client should call tombstone endpoint");
assert(!/api\\/v3\\/topics\\/\\$\\{tid\\}\\/state/.test(client), "wiki delete should not call NodeBB topic state delete");
```

- [ ] **Step 2: Run failing page action test**

Run: `node --test tests/wiki-page-actions.test.js`

Expected: FAIL because template/client still use NodeBB delete.

- [ ] **Step 3: Update template buttons**

Replace `data-wiki-delete-topic` buttons with `data-wiki-tombstone-page`, keeping `data-tid` and redirect href.

- [ ] **Step 4: Update client delete behavior**

In `public/wiki.js`, replace the NodeBB topic state `DELETE` fetch with:

```js
const url = `${base}/api/v3/plugins/westgate-wiki/page/tombstone`;
await fetch(url, {
  method: "PUT",
  credentials: "same-origin",
  headers: {
    "content-type": "application/json",
    "x-csrf-token": csrf
  },
  body: JSON.stringify({ tid })
});
```

Change confirmation text to say the page will be hidden and restorable by staff.

- [ ] **Step 5: Stop automatic hard purge hook**

In `lib/wiki-topic-purge.js`, remove automatic `topics.purgePostsAndTopic` from `onTopicDelete`. Keep cache invalidation when NodeBB delete/purge happens outside the wiki action path.

- [ ] **Step 6: Run page action tests**

Run: `node --test tests/wiki-page-actions.test.js`

Expected: PASS.

- [ ] **Step 7: Commit tombstone delete flow**

```bash
git add templates/wiki-page.tpl public/wiki.js lib/wiki-topic-purge.js tests/wiki-page-actions.test.js
git commit -m "feat: tombstone wiki page deletes"
```

### Task 9: Add History Page UI

**Files:**
- Modify: `routes/wiki.js`
- Create: `lib/controllers/wiki-revisions.js`
- Create: `templates/wiki-history.tpl`
- Create: `public/wiki-history.js`
- Modify: `public/wiki.css`
- Modify: `templates/wiki-page.tpl`
- Test: `tests/wiki-history-page.test.js`

- [ ] **Step 1: Write failing history page tests**

Create `tests/wiki-history-page.test.js` checking:

- route `/wiki/history/:tid` is registered with `ensureLoggedIn`
- `wiki-page.tpl` contains a history FAB gated by `canViewWikiHistory`
- `wiki-history.tpl` includes timeline mount, diff mount, preview mount, and restore button gated by `canRestoreWikiRevision`
- `plugin.json` or template loads `public/wiki-history.js`

- [ ] **Step 2: Run failing history page test**

Run: `node --test tests/wiki-history-page.test.js`

Expected: FAIL until route/template exist.

- [ ] **Step 3: Implement controller**

Create `lib/controllers/wiki-revisions.js`:

```js
"use strict";

const helpers = require.main.require("./src/controllers/helpers");
const topicService = require("../topic-service");
const wikiRevisionPermissions = require("../wiki-revision-permissions");
const wikiRevisions = require("../wiki-revisions");

async function renderHistory(req, res, next) {
  const tid = parseInt(req.params.tid, 10);
  if (!Number.isInteger(tid) || tid <= 0) {
    return next();
  }
  const page = await topicService.getWikiPage(tid, req.uid, { includeTombstoned: true });
  if (page.status === "forbidden") {
    return helpers.notAllowed(req, res);
  }
  if (page.status !== "ok") {
    return next();
  }
  const canView = await wikiRevisionPermissions.canViewHistory(page.topic.cid, req.uid);
  if (!canView) {
    return helpers.notAllowed(req, res);
  }
  const canRestore = await wikiRevisionPermissions.canRestore(page.topic.cid, req.uid);
  const revisions = await wikiRevisions.listRevisions(tid);
  return res.render("wiki-history", {
    title: `Revision history | ${page.topic.titleRaw || page.topic.title} | Westgate Wiki`,
    topic: page.topic,
    category: page.category,
    revisions,
    hasRevisions: revisions.length > 0,
    canRestoreWikiRevision: canRestore
  });
}

module.exports = { renderHistory };
```

- [ ] **Step 4: Register route and button**

In `routes/wiki.js`, register before catch-all:

```js
routeHelpers.setupPageRoute(router, "/wiki/history/:tid", [middleware.ensureLoggedIn], wikiRevisionController.renderHistory);
```

Add `canViewWikiHistory` to page render data via `wikiRevisionPermissions.canViewHistory`.

Add history FAB button to `templates/wiki-page.tpl`.

- [ ] **Step 5: Build template and client**

Create `templates/wiki-history.tpl` with timeline, compare controls, diff mount, preview mount, restore button, and back link.

Create `public/wiki-history.js` to call revision API endpoints, render diff text in `<pre>`, render preview into a sandboxed `.wiki-article-prose` container, and submit restore with CSRF.

- [ ] **Step 6: Run history page tests**

Run: `node --test tests/wiki-history-page.test.js`

Expected: PASS.

- [ ] **Step 7: Commit history UI**

```bash
git add routes/wiki.js lib/controllers/wiki-revisions.js templates/wiki-page.tpl templates/wiki-history.tpl public/wiki-history.js public/wiki.css tests/wiki-history-page.test.js
git commit -m "feat: add wiki revision history page"
```

### Task 10: Add Hard Purge UI For Tombstones Only

**Files:**
- Modify: `templates/wiki-history.tpl`
- Modify: `public/wiki-history.js`
- Test: `tests/wiki-history-page.test.js`
- Test: `tests/wiki-revision-actions.test.js`

- [ ] **Step 1: Add failing hard-purge tests**

Extend tests to assert:

- hard purge button only renders with `canHardPurgeWikiTombstone`
- hard purge API rejects non-tombstoned pages
- normal page template does not expose hard purge

- [ ] **Step 2: Implement hard purge UI**

In the history page only, render a danger-zone button when page is tombstoned and hard-purge permission is present.

In `public/wiki-history.js`, require a typed confirmation such as the page title before calling `DELETE /api/v3/plugins/westgate-wiki/page/hard-purge`.

- [ ] **Step 3: Run hard-purge tests**

Run:

```bash
node --test tests/wiki-history-page.test.js
node --test tests/wiki-revision-actions.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit hard-purge UI**

```bash
git add templates/wiki-history.tpl public/wiki-history.js tests/wiki-history-page.test.js tests/wiki-revision-actions.test.js
git commit -m "feat: gate wiki tombstone hard purge"
```

### Task 11: Full Regression And Manual Validation

**Files:**
- Modify only the regression tests listed in this plan when behavior intentionally changes.
- No production files unless a regression is found.

- [ ] **Step 1: Run full automated test suite**

Run: `npm test`

Expected: syntax check passes and all tests pass.

- [ ] **Step 2: Rebuild/load in NodeBB**

From the NodeBB install:

```bash
./nodebb build
```

Expected: build completes successfully.

- [ ] **Step 3: Manual browser validation**

Validate on `http://localhost:4567`:

- create a wiki page and confirm a `create` revision appears
- edit a long article and confirm an `edit` revision appears
- blank most of the article, save, inspect diff, and restore the prior revision
- delete the page and confirm it disappears from wiki routes, search, autocomplete, namespace listings, and public forum view
- open history as staff and restore the tombstoned page to the same `tid`
- verify article CSS, discussion-disabled state, watches, and discussion link survive restore
- hard purge a tombstoned test page and confirm history/content are gone
- check desktop and mobile history page layout

- [ ] **Step 4: Final status**

Report:

- test commands run
- build/manual validation performed or not performed
- any operational follow-up for ACP privilege assignment
- remaining risks

## Plan Self-Review

- Spec coverage: revision journal, tombstones, permissions, restore flow, UI/API, storage efficiency, and testing requirements are all covered by tasks.
- Placeholder scan: no task depends on undefined future work; hard purge route is implemented as a gated task rather than left vague.
- Type consistency: services use `tid`, `pid`, `cid`, `uid`, `revisionId`, `oldSource`, and `newSource` consistently across tests and implementation steps.
