"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { installNodebbStubs } = require("./helpers/nodebb-stub");

const state = {
  isAdmin: true,
  groupMembership: [],
  privilegesByCid: new Map(),
  settings: { categoryIds: "41", includeChildCategories: "1", wikiNamespaceCreateGroups: "", homeTopicId: "3741" },
  categories: new Map([
    [41, { cid: 41, name: "Codebase", slug: "41/codebase", parentCid: 0 }],
    [78, { cid: 78, name: "xtulmeboy", slug: "78/xtulmeboy", parentCid: 41 }]
  ]),
  childrenByCid: new Map([[41, [78]], [78, []]]),
  topics: new Map([
    [3733, { tid: 3733, cid: 41, uid: 501, mainPid: 9001, title: "Codebase documentation", titleRaw: "Codebase documentation", slug: "3733/codebase-documentation", westgateWikiPageSlug: "codebase-documentation", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500000000 }],
    [3734, { tid: 3734, cid: 41, uid: 502, mainPid: 9002, title: "Codebase documentation", titleRaw: "Codebase documentation", slug: "3734/codebase-documentation", westgateWikiPageSlug: "codebase-documentation", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500001000 }],
    [3735, { tid: 3735, cid: 41, uid: 503, mainPid: 9003, title: "Codebase documentation", titleRaw: "Codebase documentation", slug: "3735/codebase-documentation", westgateWikiPageSlug: "codebase-documentation", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500002000, westgateWikiTombstoned: "1" }],
    [3736, { tid: 3736, cid: 41, uid: 504, mainPid: 9004, title: "Old draft", titleRaw: "Old draft", slug: "3736/old-draft", westgateWikiPageSlug: "old-draft", deleted: 1, scheduled: 0, postcount: 1, timestamp: 1751500003000 }],
    [3737, { tid: 3737, cid: 41, uid: 505, mainPid: 9005, title: "Scheduled draft", titleRaw: "Scheduled draft", slug: "3737/scheduled-draft", westgateWikiPageSlug: "scheduled-draft", deleted: 0, scheduled: 1, postcount: 1, timestamp: 1751500004000 }],
    [3738, { tid: 3738, cid: 41, uid: 506, mainPid: 9006, title: "Unique Tombstone Probe", titleRaw: "Unique Tombstone Probe", slug: "3738/unique-tombstone-probe", westgateWikiPageSlug: "unique-tombstone-probe", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500005000 }],
    [3739, { tid: 3739, cid: 41, uid: 507, mainPid: 9007, title: "Unique Tombstone Probe", titleRaw: "Unique Tombstone Probe", slug: "3739/unique-tombstone-probe", westgateWikiPageSlug: "unique-tombstone-probe", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500006000, westgateWikiTombstoned: "1" }],
    [3740, { tid: 3740, cid: 41, uid: 508, mainPid: 9008, title: "Missing &lt;Slug&gt;", titleRaw: "Missing <Slug>", slug: "", westgateWikiPageSlug: "missing-slug", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500007000 }],
    [3741, { tid: 3741, cid: 41, uid: 509, mainPid: 9009, title: "Wiki Home", titleRaw: "Wiki Home", slug: "3741/wiki-home", westgateWikiPageSlug: "wiki-home", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500008000 }]
  ]),
  tidsByCid: new Map([[41, [3733, 3734, 3735, 3736, 3737, 3738, 3739, 3740]], [78, []]]),
  tidsPinnedByCid: new Map([[41, [3741]], [78, []]]),
  notAllowed: 0,
  render: null
};

function rangeForCid(key) {
  const m = String(key || "").match(/^cid:(\d+):tids(:pinned)?$/);
  if (!m) {
    return [];
  }
  const byCid = m[2] ? state.tidsPinnedByCid : state.tidsByCid;
  return byCid.get(parseInt(m[1], 10)) || [];
}

function sortedSetSlice(key, start, stop) {
  const rows = rangeForCid(key);
  const from = Math.max(0, parseInt(start, 10) || 0);
  const parsedStop = parseInt(stop, 10);
  const to = parsedStop === -1 ? rows.length : parsedStop + 1;
  return rows.slice(from, to);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

installNodebbStubs({
  "./src/categories": {
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
      getChildren: async (cids) => (Array.isArray(cids) ? cids : []).map((cid) => {
        const parsedCid = parseInt(cid, 10);
        return [...state.categories.values()].filter((category) => parseInt(category.parentCid, 10) === parsedCid);
      }),
      getChildrenCids: async (cid) => state.childrenByCid.get(parseInt(cid, 10)) || []
    },
    "./src/controllers/helpers": {
      formatApiResponse: () => {},
      notAllowed: () => {
        state.notAllowed += 1;
      }
    },
    "./src/database": {
      getSortedSetRange: async (key, start, stop) => sortedSetSlice(key, start, stop),
      getSortedSetRevRange: async (key, start, stop) => sortedSetSlice(key, start, stop),
      sortedSetCard: async (key) => rangeForCid(key).length,
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/groups": {
      isMemberOfGroups: async () => state.groupMembership
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/privileges": {
      categories: {
        get: async (cid) => state.privilegesByCid.get(parseInt(cid, 10)) ||
          ({ read: true, "topics:read": true, "topics:create": true })
      },
      topics: {
        filterTids: async (privilege, tids) => (Array.isArray(tids) ? tids : [])
      }
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicsFields: async (tids, fields) => tids.map((tid) => {
        const topic = state.topics.get(parseInt(tid, 10));
        if (!topic || !Array.isArray(fields)) {
          return topic;
        }
        return Object.fromEntries(fields.filter((field) => Object.hasOwn(topic, field)).map((field) => [field, topic[field]]));
      }).filter(Boolean)
    },
    "./src/user": {
      isAdministrator: async () => state.isAdmin,
      isGlobalModerator: async () => false
    },
    "./src/utils": {
      isNumber: (value) => value !== "" && !Number.isNaN(parseFloat(value)),
      toISOString: (timestamp) => new Date(parseInt(timestamp, 10)).toISOString()
    },
    "nconf": {
      get: (key) => (key === "relative_path" ? "" : undefined)
    }
});

const config = require("../lib/core/config");
const wikiDirectory = require("../lib/tree/wiki-directory-service");

test("wiki manage raw browse", async (t) => {
  config.invalidateSettingsCache();
  wikiDirectory.invalidateAllWikiCaches();

  await t.test("the manage route segment is reserved", async () => {
    const wikiPaths = require("../lib/tree/wiki-paths");
    assert.ok(
      wikiPaths.RESERVED_FIRST_SEGMENTS.has("manage"),
      "no wiki namespace may claim the /wiki/manage path"
    );
  });

  await t.test("getRawTopicRows keeps tombstoned and deleted rows", async () => {
    const rows = await wikiDirectory.getRawTopicRows(41);
    assert.deepEqual(
      rows.map((row) => parseInt(row.tid, 10)).sort((a, b) => a - b),
      [3733, 3734, 3735, 3736, 3737, 3738, 3739, 3740, 3741],
      "raw listing must include live, tombstoned, deleted, scheduled, and pinned topics"
    );
    const first = rows.find((row) => parseInt(row.tid, 10) === 3733);
    ["tid", "cid", "uid", "mainPid", "title", "titleRaw", "slug", "westgateWikiPageSlug", "postcount", "timestamp", "deleted", "scheduled"].forEach((field) => {
      assert.equal(Object.hasOwn(first, field), true, `rows must carry projected field ${field}`);
    });

    assert.ok(
      rows.some((row) => parseInt(row.tid, 10) === 3741),
      "topics that only live in cid:{cid}:tids:pinned are included"
    );

    const tombstoned = rows.find((row) => parseInt(row.tid, 10) === 3735);
    assert.ok(tombstoned.westgateWikiTombstoned, "rows must carry tombstone fields");

    const scheduled = rows.find((row) => parseInt(row.tid, 10) === 3737);
    assert.ok(scheduled.scheduled, "raw listing must keep scheduled topics");
  });

  const controller = require("../lib/controllers/wiki-manage");
  const resStub = {
    render(tpl, data) {
      state.render = { tpl, data };
    }
  };

  await t.test("non-managers are refused", async () => {
    state.isAdmin = false;
    state.notAllowed = 0;
    state.render = null;
    await controller.renderManage({ uid: 5 }, resStub);
    assert.equal(state.notAllowed, 1);
    assert.equal(state.render, null);
  });

  await t.test("managers see the raw tree with diagnostic flags", async () => {
    state.isAdmin = true;
    state.render = null;
    await controller.renderManage({ uid: 1 }, resStub);

    assert.ok(state.render, "page must render for managers");
    assert.equal(state.render.tpl, "wiki-manage");

    const namespaces = state.render.data.namespaces;
    const ns41 = namespaces.find((ns) => parseInt(ns.cid, 10) === 41);
    const ns78 = namespaces.find((ns) => parseInt(ns.cid, 10) === 78);
    assert.ok(ns41 && ns78, "every effective wiki category appears");
    assert.ok(ns78.depth > ns41.depth, "child namespaces are nested under parents");
    assert.ok(
      namespaces.indexOf(ns78) > namespaces.indexOf(ns41),
      "children are listed after their parent"
    );

    const byTid = new Map(ns41.rows.map((row) => [parseInt(row.tid, 10), row]));
    assert.ok(byTid.has(3735), "tombstoned rows are visible");
    assert.ok(byTid.has(3736), "deleted rows are visible");
    assert.equal(byTid.get(3733).collision, true, "duplicate slug leaves are flagged as collisions");
    assert.equal(byTid.get(3734).collision, true);
    assert.equal(byTid.get(3735).tombstoned, true);
    assert.equal(byTid.get(3735).collision, false, "tombstoned rows do not count toward collisions");
    assert.equal(byTid.get(3736).deleted, true);
    assert.equal(byTid.get(3738).collision, false, "a tombstoned duplicate alone does not create a collision");
    assert.equal(byTid.get(3739).tombstoned, true);
    assert.equal(byTid.get(3739).collision, false);
    assert.ok(byTid.get(3733).topicUrl.includes("/topic/"), "rows link to the raw forum topic URL");
    assert.equal(byTid.get(3740).topicUrl, "/topic/3740", "rows without slugs still link to the raw topic");
    assert.ok(byTid.get(3733).historyUrl.includes("/wiki/history/3733"), "rows link to the history page");

    assert.equal(byTid.get(3740).title, "Missing &lt;Slug&gt;", "rows render the core-escaped title, never titleRaw");
    assert.equal(byTid.get(3736).canTombstone, true, "deleted rows can still be tombstoned");
    assert.equal(byTid.get(3735).canTombstone, false, "already-tombstoned rows offer no tombstone action");
    assert.equal(byTid.get(3741).canTombstone, false, "the wiki home topic offers no tombstone action");
  });

  await t.test("non-admin managers do not see read-restricted namespaces", async () => {
    state.isAdmin = false;
    state.groupMembership = [true];
    state.settings = { ...state.settings, wikiNamespaceCreateGroups: "wiki-managers" };
    state.privilegesByCid.set(78, { read: false, "topics:read": false });
    state.render = null;
    config.invalidateSettingsCache();

    await controller.renderManage({ uid: 9 }, resStub);

    assert.ok(state.render, "group-based managers can open the page");
    const cids = state.render.data.namespaces.map((ns) => parseInt(ns.cid, 10));
    assert.ok(cids.includes(41), "readable namespaces stay visible");
    assert.equal(cids.includes(78), false, "read-restricted namespaces are hidden from non-admin managers");
    assert.equal(state.render.data.namespaces[0].acpUrl, "", "non-admins get no ACP link");
  });
});
