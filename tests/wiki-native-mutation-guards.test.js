"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();

function clearProjectModule(relativePath) {
  const filename = require.resolve(`${root}/${relativePath}`);
  delete require.cache[filename];
}

async function withStubs(stubs, fn) {
  const originalMainRequire = require.main.require.bind(require.main);
  const patched = [];

  require.main.require = function requireNodebbStub(id) {
    if (Object.prototype.hasOwnProperty.call(stubs.nodebb, id)) {
      return stubs.nodebb[id];
    }
    return originalMainRequire(id);
  };

  function patchProjectModule(relativePath, exports) {
    const filename = require.resolve(`${root}/${relativePath}`);
    patched.push([filename, require.cache[filename]]);
    require.cache[filename] = {
      id: filename,
      filename,
      loaded: true,
      exports
    };
  }

  for (const [relativePath, exports] of Object.entries(stubs.project || {})) {
    patchProjectModule(relativePath, exports);
  }

  try {
    clearProjectModule("lib/wiki-native-mutation-guards.js");
    return await fn(require("../lib/wiki-native-mutation-guards"));
  } finally {
    patched.reverse().forEach(([filename, previous]) => {
      if (previous) {
        require.cache[filename] = previous;
      } else {
        delete require.cache[filename];
      }
    });
    require.main.require = originalMainRequire;
    clearProjectModule("lib/wiki-native-mutation-guards.js");
  }
}

function createHarness() {
  const calls = {
    move: [],
    purge: [],
    purgePostsAndTopic: [],
    postFields: [],
    topicFields: []
  };
  const state = {
    settings: { effectiveCategoryIds: [7, 8] },
    postTopics: new Map([
      [420, { pid: 420, tid: 42 }],
      [421, { pid: 421, tid: 42 }],
      [520, { pid: 520, tid: 52 }]
    ]),
    topics: new Map([
      [42, { tid: 42, cid: 7, mainPid: 420 }],
      [52, { tid: 52, cid: 9, mainPid: 520 }],
      [62, { tid: 62, cid: 10, mainPid: 620 }]
    ])
  };
  const topicsStub = {
    getTopicFields: async (tid, fields) => {
      calls.topicFields.push({ tid, fields });
      const topic = state.topics.get(parseInt(tid, 10)) || null;
      return topic ? fields.reduce((memo, field) => {
        memo[field] = topic[field];
        return memo;
      }, {}) : null;
    },
    tools: {
      move: async (tid, payload) => {
        calls.move.push({ tid, payload });
        const topic = state.topics.get(parseInt(tid, 10));
        if (topic) {
          topic.cid = payload.cid;
        }
        return { tid, cid: payload.cid };
      },
      purge: async (tid, uid) => {
        calls.purge.push({ source: "tools.purge", tid, uid });
        return { tid, uid };
      }
    },
    purgePostsAndTopic: async (tids, uid) => {
      calls.purgePostsAndTopic.push({ tids, uid });
      return { tids, uid };
    },
    purge: async (tids, uid) => {
      calls.purge.push({ source: "topics.purge", tids, uid });
      return { tids, uid };
    }
  };

  return {
    calls,
    state,
    stubs: {
      nodebb: {
        "./src/posts": {
          getPostFields: async (pid, fields) => {
            calls.postFields.push({ pid, fields });
            const post = state.postTopics.get(parseInt(pid, 10)) || null;
            return post ? fields.reduce((memo, field) => {
              memo[field] = post[field];
              return memo;
            }, {}) : null;
          }
        },
        "./src/topics": topicsStub
      },
      project: {
        "lib/config.js": {
          getSettings: async () => state.settings
        }
      }
    },
    topicsStub
  };
}

test("post delete and restore guards block unmanaged wiki main posts but allow replies and non-wiki posts", async () => {
  const harness = createHarness();

  await withStubs(harness.stubs, async (guards) => {
    await assert.rejects(
      () => guards.validatePostDelete({ pid: 420, uid: 9 }),
      /Use the wiki page actions/
    );
    await assert.rejects(
      () => guards.validatePostRestore({ pid: 420, uid: 9 }),
      /Use the wiki page actions/
    );

    await guards.validatePostDelete({ pid: 421, uid: 9 });
    await guards.validatePostRestore({ pid: 520, uid: 9 });
  });
});

test("posts purge guard blocks unmanaged wiki main posts but allows replies, non-wiki posts, and managed hard purge", async () => {
  const harness = createHarness();

  await withStubs(harness.stubs, async (guards) => {
    await assert.rejects(
      () => guards.validatePostsPurge({
        posts: [{ pid: 420, tid: 42 }],
        pids: [420],
        uid: 9
      }),
      /Use the wiki page actions/
    );

    await guards.validatePostsPurge({
      posts: [{ pid: 421, tid: 42 }],
      pids: [421],
      uid: 9
    });
    await guards.validatePostsPurge({
      posts: [{ pid: 520, tid: 52 }],
      pids: [520],
      uid: 9
    });

    const wikiTopicMutations = require("../lib/wiki-topic-mutations");
    await wikiTopicMutations.withManagedMutationContext(async () => {
      await guards.validatePostsPurge({
        posts: [{ pid: 420, tid: 42 }],
        pids: [420],
        uid: 9
      });
    });
  });
});

test("installed topic move wrapper blocks unmanaged wiki moves and allows managed plugin moves", async () => {
  const harness = createHarness();

  await withStubs(harness.stubs, async (guards) => {
    guards.install();

    await assert.rejects(
      () => harness.topicsStub.tools.move(42, { cid: 9, uid: 9 }),
      /Use the wiki page actions/
    );
    assert.equal(harness.calls.move.length, 0);

    await assert.rejects(
      () => harness.topicsStub.tools.move(52, { cid: 8, uid: 9 }),
      /Use the wiki page actions/
    );
    assert.equal(harness.calls.move.length, 0);

    const allowed = await harness.topicsStub.tools.move(62, { cid: 11, uid: 9 });
    assert.deepEqual(allowed, { tid: 62, cid: 11 });
    assert.equal(harness.calls.move.length, 1);

    const wikiTopicMutations = require("../lib/wiki-topic-mutations");
    const managed = await wikiTopicMutations.withManagedMutationContext(() => (
      harness.topicsStub.tools.move(42, { cid: 9, uid: 9 })
    ));
    assert.deepEqual(managed, { tid: 42, cid: 9 });
    assert.equal(harness.calls.move.length, 2);
  });
});

test("installed topic purge wrappers block unmanaged wiki purges before native deletion", async () => {
  const harness = createHarness();

  await withStubs(harness.stubs, async (guards) => {
    guards.install();

    await assert.rejects(
      () => harness.topicsStub.tools.purge(42, 9),
      /Use the wiki page actions/
    );
    assert.equal(harness.calls.purge.length, 0);

    await assert.rejects(
      () => harness.topicsStub.purgePostsAndTopic(42, 9),
      /Use the wiki page actions/
    );
    assert.equal(harness.calls.purgePostsAndTopic.length, 0);

    await assert.rejects(
      () => harness.topicsStub.purge(42, 9),
      /Use the wiki page actions/
    );
    assert.equal(harness.calls.purge.length, 0);

    await harness.topicsStub.tools.purge(52, 9);
    await harness.topicsStub.purgePostsAndTopic(52, 9);
    await harness.topicsStub.purge(52, 9);
    assert.equal(harness.calls.purge.length, 2);
    assert.equal(harness.calls.purgePostsAndTopic.length, 1);
  });
});

test("installed topic purge wrappers allow managed wiki hard purge contexts", async () => {
  const harness = createHarness();

  await withStubs(harness.stubs, async (guards) => {
    guards.install();

    const wikiTopicMutations = require("../lib/wiki-topic-mutations");
    await wikiTopicMutations.withManagedMutationContext(async () => {
      await harness.topicsStub.tools.purge(42, 9);
      await harness.topicsStub.purgePostsAndTopic(42, 9);
      await harness.topicsStub.purge(42, 9);
    });

    assert.equal(harness.calls.purge.length, 2);
    assert.equal(harness.calls.purgePostsAndTopic.length, 1);
  });
});

test("topic purge installation is idempotent", async () => {
  const harness = createHarness();

  await withStubs(harness.stubs, async (guards) => {
    guards.install();
    guards.install();

    await harness.topicsStub.tools.purge(52, 9);
    await harness.topicsStub.purgePostsAndTopic(52, 9);
    await harness.topicsStub.purge(52, 9);

    assert.equal(harness.calls.purge.length, 2);
    assert.equal(harness.calls.purgePostsAndTopic.length, 1);
  });
});
