"use strict";

const assert = require("node:assert/strict");

const { setSettings, setTopics, installNodebbStubs } = require("./helpers/nodebb-stub");

setSettings({
  categoryIds: "1",
  includeChildCategories: "0"
});
setTopics([{ tid: 10, cid: 1, mainPid: 100, title: "Styled Page", slug: "10/styled-page" }]);

installNodebbStubs({
  "./src/categories": {
    getCategoryData: async (cid) => ({ cid: parseInt(cid, 10), name: "Wiki", slug: `${cid}/wiki`, parentCid: 0 })
  },
  "./src/database": {
    incrObjectField: async () => 1,
    getSetMembers: async () => [],
    setAdd: async () => {},
    setRemove: async () => {}
  },
  "./src/posts": {
    getPostFields: async (pid) => ({ pid, tid: 10, uid: 2, content: "<p>Article</p>" }),
    getPostSummaryByPids: async (pids) => pids.map((pid) => ({
      pid,
      uid: 2,
      content: "<p>Article</p>",
      timestamp: 1000,
      timestampISO: "1970-01-01T00:00:01.000Z"
    })),
    getUserInfoForPosts: async (uids) => uids.map((uid) => ({ uid, username: "editor", displayname: "Editor" }))
  },
  "./src/notifications": {
    create: async () => {},
    push: async () => {}
  },
  "./src/user": {
    getUserFields: async (uid) => ({ uid, username: "editor", displayname: "Editor" }),
    getUsersFields: async (uids) => uids.map((uid) => ({ uid, username: "editor", userslug: "editor", displayname: "Editor" })),
    search: async () => ({ users: [] })
  },
  "./src/utils": {
    toISOString: (value) => new Date(value).toISOString()
  }
});

const wikiArticleCss = require("../lib/content/wiki-article-css");

(async () => {
  {
    const sanitized = wikiArticleCss.sanitizeArticleCss(`
      @import url("https://evil.test/x.css");
      body { display: none; }
      .hero, h2 { color: #caa55a; background-image: url("javascript:alert(1)"); position: fixed; margin-top: 1rem; }
      a[href^="https://"] { text-decoration: underline; }
      @media (max-width: 700px) { .hero { font-size: 1.2rem; } }
    `);

    assert.doesNotMatch(sanitized, /@import/i);
    assert.doesNotMatch(sanitized, /\bbody\b/i);
    assert.doesNotMatch(sanitized, /javascript/i);
    assert.doesNotMatch(sanitized, /position/i);
    assert.match(sanitized, /\.hero,\s*h2\s*\{/);
    assert.match(sanitized, /color:\s*#caa55a/);
    assert.match(sanitized, /margin-top:\s*1rem/);
    assert.match(sanitized, /@media\s*\(max-width:\s*700px\)/);
  }

  {
    const scoped = wikiArticleCss.scopeArticleCss(".hero, h2 { color: red; }\n@media (max-width: 700px) { .hero { color: blue; } }", 10);

    assert.match(scoped, /\.wiki-article-custom-css-scope-10\s+\.hero,\s*\.wiki-article-custom-css-scope-10\s+h2\s*\{/);
    assert.match(scoped, /@media\s*\(max-width:\s*700px\)\s*\{\s*\.wiki-article-custom-css-scope-10\s+\.hero\s*\{/);
  }

  {
    await wikiArticleCss.setArticleCss(10, ".hero { color: red; }");
    assert.equal(await wikiArticleCss.getArticleCss(10), ".hero { color: red; }");

    const res = {};
    await wikiArticleCss.putArticleCss({
      uid: 2,
      body: {
        tid: 10,
        css: "body { display:none; } .hero { color: red; }"
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.articleCss, ".hero { color: red; }");
    assert.equal(await wikiArticleCss.getArticleCss(10), ".hero { color: red; }");
  }

  console.log("wiki-article-css tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
