"use strict";

// The /wiki hub must not show admin setup/diagnostic copy to guests or
// regular members. Privileged users (admin / global mod) see the setup
// cards; everyone else gets a neutral empty state when there is nothing
// to browse.

const assert = require("node:assert/strict");

const { installNodebbStubs } = require("./helpers/nodebb-stub");

const capturedRoutes = new Map();

installNodebbStubs({
  "nconf": { get: () => "" },
  "./src/controllers/api": { loadConfig: async () => ({ relative_path: "", csrf_token: "", "cache-buster": "" }) },
  "./src/middleware": { ensureLoggedIn: () => {} },
  "./src/routes/helpers": {
    setupPageRoute: (router, routePath, middlewareOrHandler, maybeHandler) => {
      capturedRoutes.set(routePath, typeof middlewareOrHandler === "function" ? middlewareOrHandler : maybeHandler);
    }
  },
  "./src/user": {
    // uid 1 acts as the admin in these tests
    isAdminOrGlobalMod: async (uid) => uid === 1
  }
});

const routes = require("../routes/wiki");
const config = require("../lib/core/config");
const wikiService = require("../lib/read/wiki-service");
const topicService = require("../lib/read/topic-service");
const wikiNamespaceCreators = require("../lib/features/wiki-namespace-creators");

let settingsImpl = null;
let sectionsImpl = null;

config.getSettings = async () => settingsImpl();
wikiService.getSections = async () => sectionsImpl();
topicService.getWikiPage = async () => ({ status: "not-found" });
wikiNamespaceCreators.getCanCreateWikiNamespaces = async () => false;

routes.register({ router: { get: () => {} }, middleware: require.main.require("./src/middleware") });

const hubHandler = capturedRoutes.get("/wiki");
assert.equal(typeof hubHandler, "function", "wiki hub route should be registered");

function makeSections(sections) {
  return {
    settings: { categoryIds: [1], effectiveCategoryIds: [1], includeChildCategories: false },
    sections,
    invalidCategoryIds: []
  };
}

async function runHub(uid) {
  const renderCalls = [];
  await hubHandler(
    { params: {}, query: {}, uid },
    { locals: {}, render: (template, data) => renderCalls.push({ template, data }), redirect: () => {} },
    (err) => {
      throw err || new Error("next() should not be called");
    }
  );
  assert.equal(renderCalls.length, 1);
  return renderCalls[0].data;
}

(async () => {
  // Unconfigured wiki, nothing to browse
  settingsImpl = () => ({ isConfigured: false, homeTopicId: null });
  sectionsImpl = () => makeSections([]);

  let data = await runHub(0);
  assert.equal(data.showSetupNotices, false, "guest must not see setup notices");
  assert.equal(data.showWikiEmptyState, true, "guest gets the neutral empty state");

  data = await runHub(1);
  assert.equal(data.showSetupNotices, true, "admin sees setup notices");
  assert.equal(data.showWikiEmptyState, false, "admin does not need the neutral empty state");

  // Configured, no homepage topic yet, no section the member could post in
  settingsImpl = () => ({ isConfigured: true, homeTopicId: null });

  data = await runHub(0);
  assert.equal(data.showHomeSetupCard, false, "guest must not see the homepage setup card");
  assert.equal(data.showWikiEmptyState, true);

  data = await runHub(1);
  assert.equal(data.showHomeSetupCard, true, "admin sees the homepage setup card");

  // Same, but a member who can create pages gets the bootstrap CTA
  sectionsImpl = () => makeSections([
    { cid: 3, wikiPath: "/wiki/Lore", hasWikiPath: true, privileges: { canCreatePage: true } }
  ]);
  data = await runHub(5);
  assert.equal(data.showHomeSetupCard, true, "member with create privilege sees the bootstrap CTA");
  assert.equal(data.showWikiEmptyState, false);

  // Homepage configured but unavailable
  settingsImpl = () => ({ isConfigured: true, homeTopicId: 99 });
  sectionsImpl = () => makeSections([]);

  data = await runHub(0);
  assert.equal(data.homePageLoadError, true);
  assert.equal(data.showSetupNotices, false, "guest must not see the homepage error diagnostics");
  assert.equal(data.showWikiEmptyState, true);

  console.log("wiki-hub-guest-state: OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
