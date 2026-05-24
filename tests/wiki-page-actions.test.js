"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const actions = require("../lib/wiki-page-actions");

assert.strictEqual(
  actions.buildSubpageDraftTitle(["Mechanics", "Feats"], "Fallback"),
  "Mechanics :: Feats :: Subpage",
  "nested pages should append the dummy subpage leaf to the full title path"
);

assert.strictEqual(
  actions.buildSubpageDraftTitle([], "Single Page"),
  "Single Page :: Subpage",
  "single pages should append the dummy subpage leaf to the page title"
);

assert.deepStrictEqual(
  actions.normalizeMovePayload({
    cid: "42",
    title: " New Leaf ",
    parentTitle: " Mechanics :: Feats "
  }),
  {
    cid: 42,
    title: "Mechanics :: Feats :: New Leaf",
    parentTitle: "Mechanics :: Feats",
    titleLeaf: "New Leaf"
  },
  "move payload should combine parent title and leaf title"
);

assert.deepStrictEqual(
  actions.normalizeMovePayload({
    cid: 42,
    title: "Mechanics :: Feats :: Epic Prowess",
    parentTitle: ""
  }),
  {
    cid: 42,
    title: "Mechanics :: Feats :: Epic Prowess",
    parentTitle: "",
    titleLeaf: "Epic Prowess"
  },
  "move payload should preserve a full explicit title when no parent is supplied"
);

assert.deepStrictEqual(
  actions.getGeneratedPageValidationOptions({
    getTopdataWikiPageSlug() {
      return "";
    }
  }, "<!-- sow-topdata-wiki:page=spells:pdk:fear wiki_slug=pdk-fear -->", {
    westgateWikiPageSlug: "stored-fear"
  }, 42),
  {
    omitTid: 42,
    pageSlug: ""
  },
  "save validation should not use retired generated wiki_slug markers as public path authority"
);

assert.deepStrictEqual(
  actions.getGeneratedPageValidationOptions({
    getTopdataWikiPageSlug() {
      return "";
    }
  }, null, {
    westgateWikiPageSlug: "spectre-shadow-attack"
  }, 43),
  {
    omitTid: 43,
    pageSlug: ""
  },
  "move validation should not retain persisted generated page slug routing state"
);

const template = fs.readFileSync(path.join(root, "templates/wiki-page.tpl"), "utf8");
const routes = fs.readFileSync(path.join(root, "routes/wiki.js"), "utf8");

assert(
  /rootNamespaceCanCreatePage:[\s\S]*rootNamespace/.test(routes),
  "homepage render data should expose root namespace page creation permissions"
);
assert(
  /rootNamespaceCanCreateWikiNamespaces:[\s\S]*rootNamespace/.test(routes),
  "homepage render data should expose root namespace creation permissions"
);
assert(
  template.includes("data-wiki-move-page"),
  "article FAB should expose a Move Page action"
);
assert(
  template.includes("data-wiki-change-owner"),
  "article FAB should expose a Change Owner action"
);
assert(
  template.includes("data-wiki-make-subpage"),
  "article FAB should expose a Make Subpage action"
);
assert(
  /<!-- IF canMoveWikiPage -->[\s\S]*data-wiki-move-page[\s\S]*<!-- ENDIF canMoveWikiPage -->/.test(template),
  "Move Page action should be permission-gated"
);
assert(
  /<!-- IF canChangeWikiOwner -->[\s\S]*data-wiki-change-owner[\s\S]*<!-- ENDIF canChangeWikiOwner -->/.test(template),
  "Change Owner action should be permission-gated"
);
assert(
  /<!-- IF canMakeWikiSubpage -->[\s\S]*data-wiki-make-subpage[\s\S]*<!-- ENDIF canMakeWikiSubpage -->/.test(template),
  "Make Subpage action should be permission-gated"
);
assert(
  /data-wiki-make-subpage="1"[\s\S]*data-wiki-create-namespace-path="\{category\.wikiPath\}"/.test(template),
  "Make Subpage action should carry the canonical namespace path for post-create redirects"
);
assert(
  /<!-- IF rootNamespaceCanCreatePage -->[\s\S]*data-wiki-create-page[\s\S]*data-cid="{rootNamespaceCid}"[\s\S]*<!-- ENDIF rootNamespaceCanCreatePage -->/.test(template),
  "homepage FAB should expose root namespace page creation when allowed"
);
assert(
  /<!-- IF rootNamespaceCanCreateWikiNamespaces -->[\s\S]*\/wiki\/namespace\/create\/{rootNamespaceCid}[\s\S]*<!-- ENDIF rootNamespaceCanCreateWikiNamespaces -->/.test(template),
  "homepage FAB should expose root namespace creation when allowed"
);

const client = fs.readFileSync(path.join(root, "public/wiki.js"), "utf8");
assert(
  client.includes("/api/v3/plugins/westgate-wiki/page/move"),
  "client should call the wiki page move endpoint"
);
assert(
  client.includes("/api/v3/plugins/westgate-wiki/page/owner"),
  "client should call the wiki page owner endpoint"
);

const library = fs.readFileSync(path.join(root, "library.js"), "utf8");
assert(
  library.includes("/westgate-wiki/page/move"),
  "move endpoint should be registered"
);
assert(
  library.includes("/westgate-wiki/page/save"),
  "wiki page save endpoint should be registered"
);
{
  const routeStart = library.indexOf('"/westgate-wiki/page/save"');
  const routeEnd = library.indexOf("wikiPageActions.saveWikiPage", routeStart);
  assert.notStrictEqual(routeStart, -1, "wiki page save route should be present");
  assert.notStrictEqual(routeEnd, -1, "wiki page save route should point to saveWikiPage");
  const saveRouteRegistration = library.slice(routeStart, routeEnd);
  assert(
    !saveRouteRegistration.includes("checkRequired"),
    "multipart wiki page save route should not use NodeBB checkRequired because multer bodies may not inherit hasOwnProperty"
  );
}
assert(
  library.includes("/westgate-wiki/page/owner"),
  "owner endpoint should be registered"
);
assert(
  /validateCanonicalPagePlacement/.test(actions.moveWikiPage.toString()) &&
    /validateCanonicalPagePlacement/.test(actions.saveWikiPage.toString()),
  "wiki page save and move actions should validate against canonical tree placement before saving"
);
assert(
  /getCanonicalPagePath/.test(fs.readFileSync(path.join(root, "lib/wiki-page-actions.js"), "utf8")),
  "wiki page save and move actions should return canonical page paths after saving"
);
assert.strictEqual(
  typeof actions.saveWikiPage,
  "function",
  "wiki page save action should be exported"
);

(async () => {
  const originalMainRequire = require.main.require.bind(require.main);
  require.main.require = function requireNodebbStub(id) {
    const stubs = {
      "./src/controllers/helpers": {
        formatApiResponse: (status, res, payload) => {
          res.statusCode = status;
          res.payload = payload;
          return payload;
        }
      },
      "./src/posts": {
        edit: async () => {},
        getPostFields: async () => ({ content: "<p>Saved</p>", sourceContent: "<p>Saved</p>" })
      },
      "./src/privileges": {
        categories: {
          get: async () => ({ read: true, "topics:read": true, "topics:create": true })
        }
      },
      "./src/topics": {
        getTopicData: async () => ({
          tid: 70,
          cid: 71,
          mainPid: 700,
          title: "Hidden Page",
          titleRaw: "Hidden Page",
          slug: "70/hidden-page"
        })
      }
    };
    return stubs[id] || originalMainRequire(id);
  };

  const patchedModules = [];
  function patchModule(request, exports) {
    const filename = require.resolve(request);
    patchedModules.push([filename, require.cache[filename]]);
    require.cache[filename] = {
      id: filename,
      filename,
      loaded: true,
      exports
    };
  }

  patchModule("../lib/topic-service", {
    getWikiPage: async () => ({
      status: "ok",
      canEditWikiPage: true,
      topic: {
        tid: 70,
        cid: 71,
        mainPid: 700,
        title: "Hidden Page",
        titleRaw: "Hidden Page"
      }
    })
  });
  patchModule("../lib/wiki-directory-service", {
    invalidateNamespace: () => {}
  });
  patchModule("../lib/wiki-edit-locks", {
    assertSaveLock: async () => ({ status: "ok" }),
    getStatusMessage: () => "locked"
  });
  patchModule("../lib/wiki-page-validation", {
    getValidationMessage: () => "",
    isBlockingResult: () => false,
    sanitizeAndValidateWikiMainBody: (content) => content
  });
  patchModule("../lib/wiki-paths", {
    getCanonicalPagePath: async (topic, options) => (
      options && parseInt(options.uid, 10) === 9 ? "" : "Hidden_Root/Readable_Child/Hidden_Page"
    ),
    invalidateWikiTreeIndex: () => {},
    validateCanonicalPagePlacement: async () => ({ status: "ok" })
  });

  try {
    const res = {};
    await actions.saveWikiPage({
      uid: 9,
      body: {
        tid: 70,
        pid: 700,
        title: "Hidden Page",
        content: "<p>Saved</p>",
        wikiEditLockToken: "token"
      },
      query: {}
    }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(
      res.payload.wikiPath,
      "",
      "save response should not emit a canonical wikiPath hidden from the request user"
    );
  } finally {
    patchedModules.reverse().forEach(([filename, previous]) => {
      if (previous) {
        require.cache[filename] = previous;
      } else {
        delete require.cache[filename];
      }
    });
    require.main.require = originalMainRequire;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
