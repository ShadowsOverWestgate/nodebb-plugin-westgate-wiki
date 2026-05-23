"use strict";

const assert = require("assert");

const state = {
  settings: {
    categoryIds: "1",
    includeChildCategories: "0"
  },
  categories: new Map(),
  topics: new Map(),
  hiddenCategoryCidsByUid: new Map()
};
const originalMainRequire = require.main.require.bind(require.main);

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setCategories(rows) {
  state.categories = new Map(rows.map((row) => [parseInt(row.cid, 10), row]));
}

function setTopics(rows) {
  state.topics = new Map(rows.map((row) => [parseInt(row.tid, 10), row]));
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    nconf: {
      get: (key) => (key === "relative_path" ? "/forum" : "")
    },
    "./src/categories": {
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
      getChildrenCids: async () => []
    },
    "./src/database": {
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => [],
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/controllers/helpers": {
      formatApiResponse: (status, res, payload) => {
        res.statusCode = status;
        res.payload = payload;
        return payload;
      }
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
        get: async (cid, uid) => {
          const hidden = state.hiddenCategoryCidsByUid.get(parseInt(uid, 10)) || new Set();
          const canRead = !hidden.has(parseInt(cid, 10));
          return { read: canRead, "topics:read": canRead };
        }
      },
      topics: {
        filterTids: async (priv, tids) => (Array.isArray(tids) ? tids : [])
      }
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicsFields: async () => [],
      getTopicsFromSet: async () => [],
      getTopicField: async (tid, field) => {
        const topic = state.topics.get(parseInt(tid, 10));
        return topic && Object.prototype.hasOwnProperty.call(topic, field) ? topic[field] : null;
      },
      setTopicField: async (tid, field, value) => {
        const parsedTid = parseInt(tid, 10);
        const topic = state.topics.get(parsedTid) || { tid: parsedTid };
        topic[field] = value;
        state.topics.set(parsedTid, topic);
      }
    },
    "./src/user": {
      isAdministrator: async () => false
    },
    "./src/utils": {
      isNumber: (value) => !Number.isNaN(parseFloat(value))
    }
  };

  if (!stubs[id]) {
    return originalMainRequire(id);
  }
  return stubs[id];
};

const wikiDiscussionPlaceholder = require("../lib/wiki-discussion-placeholder");
const wikiDiscussionSettings = require("../lib/wiki-discussion-settings");

function reset(settings, categories, topics) {
  state.settings = {
    includeChildCategories: "0",
    ...settings
  };
  setCategories(categories || []);
  setTopics(topics || []);
  state.hiddenCategoryCidsByUid = new Map();
  try {
    require("../lib/config").invalidateSettingsCache();
  } catch (e) {
    // Module may not be loaded during early test setup.
  }
}

(async () => {
  reset(
    { categoryIds: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }
    ],
    [
      {
        tid: 10,
        cid: 1,
        mainPid: 100,
        title: "Unsafe & <Article>",
        slug: "10/unsafe-article"
      }
    ]
  );

  {
    const storedArticleContent = "<h1>Full article body</h1>";
    const data = {
      uid: 1,
      templateData: {
        tid: 10,
        cid: 1,
        mainPid: 100,
        title: "Unsafe & <Article>",
        slug: "10/unsafe-article",
        posts: [
          { pid: 100, content: storedArticleContent, excerpt: "leaky excerpt", teaser: "leaky teaser" },
          { pid: 101, content: "<p>Normal reply</p>" }
        ]
      }
    };

    const result = await wikiDiscussionPlaceholder.filterTopicBuild(data);
    const mainPost = result.templateData.posts[0];

    assert(mainPost.content.includes('class="wiki-discussion-placeholder"'), "main post should be replaced");
    assert(mainPost.content.includes("wiki-link-from-forum"), "placeholder article link should use forum wiki-link styling");
    assert(mainPost.content.includes("wiki-forum-link-icon"), "placeholder article link should include the book icon");
    assert(mainPost.content.includes("wiki-forum-link-text"), "placeholder article link should wrap text like forum wiki links");
    assert(mainPost.content.includes('href="/forum/wiki/Wiki/Unsafe_Article"'), "placeholder should link to canonical wiki path");
    assert(mainPost.content.includes("Unsafe &amp; &lt;Article&gt;"), "article title should be escaped");
    assert(!mainPost.content.includes("Full article body"), "forum view should not include the article body");
    assert.strictEqual(mainPost.excerpt, "", "excerpt should be cleared if present");
    assert.strictEqual(mainPost.teaser, "", "teaser should be cleared if present");
    assert.strictEqual(result.templateData.posts[1].content, "<p>Normal reply</p>", "replies should remain unchanged");
    assert.strictEqual(storedArticleContent, "<h1>Full article body</h1>", "stored article content fixture should remain untouched");
  }

  {
    reset(
      { categoryIds: "1" },
      [
        { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }
      ],
      [
        {
          tid: 11,
          cid: 1,
          mainPid: 110,
          title: "No Talk",
          slug: "11/no-talk",
          westgateWikiDiscussionDisabled: "1"
        }
      ]
    );

    const data = {
      uid: 1,
      templateData: {
        tid: 11,
        cid: 1,
        mainPid: 110,
        title: "No Talk",
        slug: "11/no-talk",
        privileges: {
          "topics:reply": true,
          reply: true
        },
        posts: [
          { pid: 110, content: "<p>Article</p>" },
          { pid: 111, content: "<p>Old reply remains visible</p>" }
        ]
      }
    };

    const result = await wikiDiscussionPlaceholder.filterTopicBuild(data);
    assert(result.templateData.posts[0].content.includes("Discussion is disabled for this article."), "placeholder should mention disabled discussion");
    assert.strictEqual(result.templateData.privileges["topics:reply"], false, "topic reply privilege should be suppressed in render data");
    assert.strictEqual(result.templateData.privileges.reply, false, "reply shortcut should be suppressed in render data");
    assert.strictEqual(result.templateData.locked, true, "topic render data should look locked to clients");
    assert.strictEqual(result.templateData.posts[1].content, "<p>Old reply remains visible</p>", "existing replies should remain visible");
  }

  {
    await assert.rejects(
      wikiDiscussionSettings.filterTopicReply({ tid: 11, content: "Blocked reply" }),
      /Discussion is disabled/
    );

    await wikiDiscussionSettings.setDiscussionDisabled(11, false);
    const result = await wikiDiscussionSettings.filterTopicReply({ tid: 11, content: "Allowed reply" });
    assert.strictEqual(result.content, "Allowed reply", "replies should be allowed after re-enabling discussion");
    assert.strictEqual(await wikiDiscussionSettings.getDiscussionDisabled(11), false, "discussion setting should persist as enabled");
  }

  {
    const data = {
      uid: 1,
      templateData: {
        tid: 20,
        cid: 2,
        mainPid: 200,
        title: "Forum Topic",
        slug: "20/forum-topic",
        posts: [
          { pid: 200, content: "<p>Forum body</p>" }
        ]
      }
    };

    const result = await wikiDiscussionPlaceholder.filterTopicBuild(data);
    assert.strictEqual(result.templateData.posts[0].content, "<p>Forum body</p>", "non-wiki topics should be untouched");
  }

  {
    reset(
      { categoryIds: "1" },
      [
        { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }
      ],
      [
        {
          tid: 30,
          cid: 1,
          mainPid: 300,
          title: ""
        }
      ]
    );

    const data = {
      uid: 1,
      templateData: {
        tid: 30,
        cid: 1,
        mainPid: 300,
        title: "",
        posts: [
          { pid: 300, content: "<p>Still here</p>" }
        ]
      }
    };

    const result = await wikiDiscussionPlaceholder.filterTopicBuild(data);
    assert.strictEqual(result.templateData.posts[0].content, "<p>Still here</p>", "missing wiki path data should fail closed");
  }

  {
    reset(
      { categoryIds: "1, 2" },
      [
        { cid: 1, name: "Hidden Root", slug: "1/hidden-root", parentCid: 0 },
        { cid: 2, name: "Readable Child", slug: "2/readable-child", parentCid: 1 }
      ],
      [
        {
          tid: 40,
          cid: 2,
          mainPid: 400,
          title: "Hidden Article",
          slug: "40/hidden-article"
        }
      ]
    );
    state.hiddenCategoryCidsByUid.set(9, new Set([1]));

    const data = {
      uid: 9,
      templateData: {
        tid: 40,
        cid: 2,
        mainPid: 400,
        title: "Hidden Article",
        slug: "40/hidden-article",
        posts: [
          { pid: 400, content: "<p>Still hidden</p>" }
        ]
      }
    };

    const result = await wikiDiscussionPlaceholder.filterTopicBuild(data);
    assert.strictEqual(
      result.templateData.posts[0].content,
      "<p>Still hidden</p>",
      "forum placeholder should not emit a wiki link through an unreadable ancestor"
    );
  }

  console.log("wiki-discussion-placeholder tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
