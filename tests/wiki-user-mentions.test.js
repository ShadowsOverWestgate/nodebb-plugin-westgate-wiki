"use strict";

const assert = require("assert");

const { setSettings, setTopics, installNodebbStubs } = require("./helpers/nodebb-stub");

const state = {
  usersBySlug: new Map()
};

setSettings({
  categoryIds: "1",
  includeChildCategories: "0"
});
setTopics([{ tid: 10, cid: 1 }]);

function setUsers(rows) {
  state.usersBySlug = new Map(rows.map((row) => [row.userslug, row]));
}

installNodebbStubs({
  nconf: {
    get: (key) => (key === "relative_path" ? "/forum" : "")
  },
  "./src/topics": {
    getTopicsFields: async () => [],
    getTopicsFromSet: async () => []
  },
  "./src/user": {
    getUidByUserslug: async (userslug) => {
      const row = state.usersBySlug.get(userslug);
      return row ? row.uid : null;
    },
    getUserFields: async (uid) => {
      for (const row of state.usersBySlug.values()) {
        if (parseInt(row.uid, 10) === parseInt(uid, 10)) {
          return row;
        }
      }
      return null;
    },
    isAdministrator: async () => false
  }
});

const wikiUserMentions = require("../lib/content/wiki-user-mentions");

(async () => {
  setUsers([
    { uid: 1, username: "xtul", userslug: "xtul", displayname: "xtul" },
    { uid: 2, username: "Vicky", userslug: "vicky", displayname: "Vicky" }
  ]);

  assert.deepStrictEqual(
    wikiUserMentions.collectMentionNames("<p>Hello @xtul, @missing, and email me@example.com.</p>"),
    ["xtul", "missing"]
  );

  {
    const html = await wikiUserMentions.transformUserMentionsInHtml("<p>Hello @xtul.</p>");
    assert(html.includes('<a class="wiki-user-mention" href="/forum/user/xtul">@xtul</a>'), "known user should link");
    assert(html.includes(".</p>"), "trailing punctuation should remain outside the link");
  }

  {
    const html = await wikiUserMentions.transformUserMentionsInHtml('<p>Hello <span class="wiki-entity wiki-entity--user" data-wiki-entity="user" data-wiki-username="xtul" data-wiki-userslug="xtul">@xtul</span>.</p>');
    assert(html.includes('<a class="wiki-user-mention" href="/forum/user/xtul">@xtul</a>'), "editor user entity should render as a profile link");
    assert(!html.includes("data-wiki-entity=\"user\""), "editor user entity span should not leak into read-only output");
  }

  {
    const html = await wikiUserMentions.transformUserMentionsInHtml("<p>Hello @missing and @Vicky.</p>");
    assert(html.includes("Hello @missing and "), "unknown user should remain plain text");
    assert(html.includes('href="/forum/user/vicky">@Vicky</a>'), "display casing from the article should be preserved");
  }

  {
    const html = await wikiUserMentions.transformUserMentionsInHtml(
      '<p><a href="/user/xtul">@xtul</a> <code>@xtul</code> <pre>@xtul</pre> outside @xtul</p>'
    );
    assert.strictEqual((html.match(/wiki-user-mention/g) || []).length, 1, "only unprotected text should link");
    assert(html.includes('<a href="/user/xtul">@xtul</a>'), "existing anchors should be left alone");
    assert(html.includes("<code>@xtul</code>"), "inline code should be left alone");
    assert(html.includes("<pre>@xtul</pre>"), "pre blocks should be left alone");
  }

  {
    const data = {
      postData: {
        content: "<p>Article mention @xtul</p>",
        tid: 10
      }
    };
    const transformed = await wikiUserMentions.transformWikiUserMentions(data);
    assert(transformed.postData.content.includes('href="/forum/user/xtul"'), "wiki-category post should transform");
  }

  {
    const data = {
      postData: {
        content: "<p>Forum mention @xtul</p>",
        tid: 99
      }
    };
    const transformed = await wikiUserMentions.transformWikiUserMentions(data);
    assert.strictEqual(transformed.postData.content, "<p>Forum mention @xtul</p>", "non-wiki post should not transform");
  }

  console.log("wiki-user-mentions tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
