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
      return "pdk-fear";
    }
  }, "<!-- sow-topdata-wiki:page=spells:pdk:fear wiki_slug=pdk-fear -->", {
    westgateWikiPageSlug: "stored-fear"
  }, 42),
  {
    omitTid: 42,
    pageSlug: "pdk-fear"
  },
  "save validation should prefer the generated wiki_slug marker in edited content"
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
    pageSlug: "spectre-shadow-attack"
  },
  "move validation should retain a persisted generated page slug"
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
assert.strictEqual(
  typeof actions.saveWikiPage,
  "function",
  "wiki page save action should be exported"
);
