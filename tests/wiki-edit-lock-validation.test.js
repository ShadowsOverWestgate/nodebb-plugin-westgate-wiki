"use strict";

const assert = require("node:assert/strict");

const state = {
  settings: {
    categoryIds: "1",
    includeChildCategories: "0"
  },
  now: 100000,
  objects: new Map(),
  topics: new Map([[10, { tid: 10, cid: 1, mainPid: 100, title: "Locked Page", slug: "10/locked-page" }]])
};

const originalMainRequire = require.main.require.bind(require.main);

function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/categories": {
      getCategoryData: async (cid) => ({ cid: parseInt(cid, 10), name: "Wiki", slug: `${cid}/wiki`, parentCid: 0 }),
      getChildrenCids: async () => []
    },
    "./src/controllers/helpers": {
      formatApiResponse: (status, res, payload) => {
        res.statusCode = status;
        res.payload = payload;
        return payload;
      }
    },
    "./src/database": {
      delete: async (key) => {
        state.objects.delete(key);
      },
      deleteObject: async (key) => {
        state.objects.delete(key);
      },
      getObject: async (key) => state.objects.get(key) || null,
      getObjectField: async () => null,
      getSetMembers: async () => [],
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => [],
      setObject: async (key, value) => {
        state.objects.set(key, { ...value });
      }
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        setOnEmpty: async () => {}
      }
    },
    "./src/privileges": {
      categories: {
        get: async () => ({
          "topics:read": true,
          "topics:create": true,
          find: true
        })
      }
    },
    "./src/posts": {
      getPostFields: async (pid, fields) => {
        if (parseInt(pid, 10) === 100) {
          const post = {
            pid: 100,
            tid: 10,
            content: "<p>Stored</p>",
            sourceContent: "<p>Stored</p>"
          };
          return Array.isArray(fields)
            ? Object.fromEntries(fields.map((field) => [field, post[field]]))
            : post;
        }
        return null;
      }
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicField: async (tid, field) => {
        const topic = state.topics.get(parseInt(tid, 10));
        return topic ? topic[field] : null;
      },
      getTopicFields: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      setTopicField: async (tid, field, value) => {
        const topic = state.topics.get(parseInt(tid, 10));
        if (topic) {
          topic[field] = value;
        }
      }
    },
    "./src/utils": {
      generateUUID: () => `token-${state.now}`
    },
    "./src/user": {
      getUserFields: async (uid) => ({
        uid,
        username: uid === 2 ? "Editor" : "Other",
        displayname: uid === 2 ? "Editor" : "Other"
      })
    }
  };

  return stubs[id] || originalMainRequire(id);
};

const wikiEditLocks = require("../lib/wiki-edit-locks");
const wikiPageValidation = require("../lib/wiki-page-validation");

wikiEditLocks.setNowProvider(() => state.now);
wikiEditLocks.setTokenProvider(() => `token-${state.now}`);

assert.equal(
  wikiPageValidation.getTopdataPublicPathMigrationState(
    "<!-- sow-topdata-wiki:page=feat:power_attack wiki_slug=power-attack -->"
  ).hasRetiredWikiSlug,
  true
);

function resetRuntime() {
  state.now = 100000;
  state.objects = new Map();
}

(async () => {
  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    const data = await wikiPageValidation.validateTopicEdit({
      uid: 2,
      westgateWikiManagedMutation: true,
      wikiEditLockToken: lock.token,
      topic: { tid: 10, cid: 1, title: "Locked Page" },
      post: { pid: 100, content: "<p>Updated</p>", sourceContent: "<p>Updated</p>" }
    });
    assert.equal(data.post.content, "<p>Updated</p>");
    assert.equal(data.post.sourceContent, "<p>Updated</p>");
  }

  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    const data = await wikiPageValidation.validatePostEdit({
      uid: 2,
      westgateWikiManagedMutation: true,
      data: { pid: 100, wikiEditLockToken: lock.token },
      post: {
        content: '<p style="text-align: center; position: fixed">Updated</p>',
        sourceContent: '<p style="text-align: center; position: fixed">Updated</p>'
      }
    });
    assert.equal(data.post.content, '<p style="text-align:center">Updated</p>');
    assert.equal(data.post.sourceContent, '<p style="text-align:center">Updated</p>');
  }

  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    const data = await wikiPageValidation.validatePostEdit({
      uid: 2,
      westgateWikiManagedMutation: true,
      data: { pid: 100, wikiEditLockToken: lock.token },
      post: {
        content: '<table><tbody><tr><td style="text-align: right"><p>Updated</p></td></tr></tbody></table>'
      }
    });
    assert.equal(data.post.content, '<table><tbody><tr><td style="text-align:right"><p>Updated</p></td></tr></tbody></table>');
    assert.equal(data.post.sourceContent, data.post.content);
  }

  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    const markerContent = [
      "<!-- sow-topdata-wiki:page=spells:pdk:fear wiki_slug=pdk-fear -->",
      "<p>Updated</p>"
    ].join("\n");
    assert.deepEqual(
      wikiPageValidation.getTopdataPublicPathMigrationState(markerContent),
      {
        hasMarker: true,
        hasRetiredWikiSlug: true,
        retiredWikiSlug: "pdk-fear"
      }
    );
    await wikiPageValidation.validatePostEdit({
      uid: 2,
      westgateWikiManagedMutation: true,
      data: { pid: 100, wikiEditLockToken: lock.token },
      post: {
        content: markerContent
      }
    });
    assert.equal(state.topics.get(10).westgateWikiPageSlug, "");
  }

  resetRuntime();
  {
    const data = await wikiPageValidation.validatePostEdit({
      uid: 2,
      data: { pid: 100 },
      post: {
        content: "<p>Stored</p>",
        sourceContent: "<p>Stored</p>"
      }
    });
    assert.equal(data.post.content, "<p>Stored</p>");
    assert.equal(data.post.sourceContent, "<p>Stored</p>");
  }

  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    const data = await wikiPageValidation.validateTopicEdit({
      uid: 2,
      westgateWikiManagedMutation: true,
      req: { query: { wikiEditLockToken: lock.token } },
      topic: { tid: 10, cid: 1, title: "Locked Page" },
      post: { pid: 100, content: "<p>Updated</p>" }
    });
    assert.equal(data.post.content, "<p>Updated</p>");
  }

  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    await assert.rejects(
      () => wikiPageValidation.validateTopicEdit({
        uid: 3,
        westgateWikiManagedMutation: true,
        wikiEditLockToken: lock.token,
        topic: { tid: 10, cid: 1, title: "Locked Page" },
        post: { pid: 100, content: "<p>Updated</p>" }
      }),
      /currently being edited by Editor/
    );
  }

  resetRuntime();
  {
    await assert.rejects(
      () => wikiPageValidation.validateTopicEdit({
        uid: 2,
        westgateWikiManagedMutation: true,
        topic: { tid: 10, cid: 1, title: "Locked Page" },
        post: { pid: 100, content: "<p>Updated</p>" }
      }),
      /Open the wiki editor again/
    );
  }

  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    await assert.rejects(
      () => wikiPageValidation.validatePostEdit({
        uid: 2,
        data: { pid: 100, wikiEditLockToken: lock.token },
        post: {
          content: "<p>Native Edit</p>",
          sourceContent: "<p>Native Edit</p>"
        }
      }),
      /Use the wiki editor/
    );
  }

  resetRuntime();
  {
    const lock = await wikiEditLocks.acquireLock(10, 2);
    await assert.rejects(
      () => wikiPageValidation.validateTopicEdit({
        uid: 2,
        wikiEditLockToken: lock.token,
        topic: { tid: 10, cid: 1, title: "Native Title" },
        post: { pid: 100, content: "<p>Native Edit</p>" }
      }),
      /Use the wiki editor/
    );
  }

  resetRuntime();
  {
    const data = await wikiPageValidation.validateTopicDelete({
      topicData: { tid: 10, cid: 1 },
      canDelete: true
    });
    assert.equal(data.canDelete, false, "generic topic delete should be blocked for wiki pages");
  }

  resetRuntime();
  {
    state.settings.homeTopicId = 10;
    const data = await wikiPageValidation.validateTopicDelete({
      topicData: { tid: 10, cid: 1 },
      westgateWikiManagedMutation: true,
      canDelete: true
    });
    assert.equal(data.canDelete, false, "wiki home topic should remain blocked from native delete");
    delete state.settings.homeTopicId;
  }

  console.log("wiki-edit-lock validation tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
