"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = require("../lib/wiki-path-migration");

const root = path.resolve(__dirname, "..");
const originalMainRequire = require.main.require.bind(require.main);

function clearProjectModule(relativePath) {
  const modulePath = path.join(root, relativePath);
  delete require.cache[require.resolve(modulePath)];
}

async function withNodebbStubs(stubs, fn) {
  const previousMainRequire = require.main.require;
  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    return await fn();
  } finally {
    require.main.require = previousMainRequire;
  }
}

function createBaseNodebbStubs(overrides = {}) {
  const stubs = {
    "nconf": { get: () => "" },
    "./src/categories": {
      buildForSelectAll: async () => [],
      getCategoryData: async () => null,
      getChildrenCids: async () => []
    },
    "./src/controllers/api": {},
    "./src/controllers/helpers": {
      formatApiResponse(status, res, payload) {
        res.statusCode = status;
        res.payload = payload;
        return { status, payload };
      }
    },
    "./src/database": {
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => [],
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/groups": { getNonPrivilegeGroups: async () => [] },
    "./src/meta": { settings: { get: async () => ({}), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/middleware": { ensureLoggedIn: () => {}, checkRequired: () => {} },
    "./src/note": {},
    "./src/notifications": {},
    "./src/plugins": { hooks: { on: () => {} } },
    "./src/posts": {},
    "./src/privileges": { categories: {}, topics: {}, posts: {} },
    "./src/routes/helpers": {
      setupAdminPageRoute: () => {},
      setupApiRoute: () => {},
      setupPageRoute: () => {}
    },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": {},
    "./src/user": { isAdministrator: async () => false },
    "./src/utils": { isNumber: () => true }
  };

  return { ...stubs, ...overrides };
}

(async () => {
  {
    const report = await migration.scan({
      categories: [
        { cid: 10, name: "Lore", slug: "10/lore", parentCid: 0 },
        { cid: 11, name: "Deities", slug: "11/deities", parentCid: 10 }
      ],
      topics: [
        {
          tid: 77,
          cid: 11,
          title: "Gond",
          content: "<!-- sow-topdata-wiki:page=deities:gond wiki_slug=gond -->\n<p>Wonderbringer.</p>"
        },
        {
          tid: 78,
          cid: 11,
          title: "Tyr",
          westgateWikiPageSlug: "even-handed"
        }
      ],
      namespaceMainPages: { "11": 77 }
    });

    assert.deepEqual(report.summary, {
      blockingErrors: 0,
      legacyNamespaceMainPages: 1,
      retiredGeneratedSlugRows: 2
    });
    assert.equal(report.pages[0].canonicalPath, "Lore/Deities/Gond");
    assert.equal(report.pages[0].retiredGeneratedSlug, "gond");
    assert.equal(report.pages[0].retiredGeneratedSlugSource, "marker");
    assert.equal(report.pages[1].canonicalPath, "Lore/Deities/Tyr");
    assert.equal(report.pages[1].retiredGeneratedSlug, "even-handed");
    assert.equal(report.pages[1].retiredGeneratedSlugSource, "topic-field");
    assert.equal(report.namespaces[1].canonicalPath, "Lore/Deities");
    assert.deepEqual(report.routeRoots, []);
    assert.deepEqual(report.legacyNamespaceMainPages, [{ cid: 11, tid: 77 }]);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 10, name: "Wiki", slug: "10/wiki", parentCid: 0 },
        { cid: 11, name: "Lore", slug: "11/lore", parentCid: 10 }
      ],
      topics: [
        { tid: 77, cid: 11, title: "Gond" }
      ],
      namespaceMainPages: {}
    });

    assert.deepEqual(report.routeRoots, [
      {
        cid: 10,
        name: "Wiki",
        legacyPath: "/wiki",
        canonicalPath: "Wiki",
        foldedKey: "wiki",
        status: "legacy-slug-root-omission"
      }
    ]);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Deities", parentCid: 10 }
      ],
      topics: [
        { tid: 77, cid: 11, title: "Gond" },
        { tid: 78, cid: 11, title: "gond" }
      ],
      namespaceMainPages: {}
    });

    assert.equal(report.summary.blockingErrors, 1);
    assert.equal(report.collisions.foldedPages[0].foldedKey, "lore/deities/gond");
    assert.deepEqual(report.collisions.foldedPages[0].tids, [77, 78]);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Guides", parentCid: 10 },
        { cid: 12, name: "Guides", parentCid: 10 }
      ],
      topics: [
        { tid: 77, cid: 10, title: "Tome" },
        { tid: 78, cid: 10, title: "Tome" }
      ],
      namespaceMainPages: {}
    });

    assert.equal(report.summary.blockingErrors, 4);
    assert.deepEqual(report.collisions.canonicalNamespaces, [
      { canonicalPath: "Lore/Guides", cids: [11, 12] }
    ]);
    assert.deepEqual(report.collisions.foldedNamespaces, [
      { foldedKey: "lore/guides", cids: [11, 12] }
    ]);
    assert.deepEqual(report.collisions.canonicalPages, [
      { canonicalPath: "Lore/Tome", tids: [77, 78] }
    ]);
    assert.deepEqual(report.collisions.foldedPages, [
      { foldedKey: "lore/tome", tids: [77, 78] }
    ]);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Guides", parentCid: 10 }
      ],
      topics: [
        { tid: 77, cid: 10, title: "Guides" }
      ],
      namespaceMainPages: {}
    });

    assert.equal(report.summary.blockingErrors, 2);
    assert.deepEqual(report.collisions.canonicalNamespacePages, [
      { canonicalPath: "Lore/Guides", cids: [11], tids: [77] }
    ]);
    assert.deepEqual(report.collisions.foldedNamespacePages, [
      { foldedKey: "lore/guides", cids: [11], tids: [77] }
    ]);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 10, name: "Search", parentCid: 0 }
      ],
      topics: [],
      namespaceMainPages: {}
    });

    assert.equal(report.summary.blockingErrors, 1);
    assert.deepEqual(report.reservedRoots.namespaces, [
      { cid: 10, canonicalPath: "Search", foldedKey: "search", reservedSegment: "Search" }
    ]);
    assert.deepEqual(report.reservedRoots.pages, []);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
        { cid: 2, name: "Search", slug: "2/search", parentCid: 1 }
      ],
      topics: [],
      namespaceMainPages: {}
    });

    assert.equal(report.summary.blockingErrors, 1);
    assert.deepEqual(report.routeRoots, [
      {
        cid: 1,
        name: "Wiki",
        legacyPath: "/wiki",
        canonicalPath: "Wiki",
        foldedKey: "wiki",
        status: "legacy-slug-root-omission"
      }
    ]);
    assert.deepEqual(report.reservedRoots.namespaces, [
      {
        cid: 2,
        canonicalPath: "Wiki/Search",
        foldedKey: "wiki/search",
        routableCanonicalPath: "Search",
        routableFoldedKey: "search",
        reservedSegment: "Search"
      }
    ]);
    assert.deepEqual(report.reservedRoots.pages, []);
  }

  {
    const report = await migration.scan({
      categories: [],
      topics: [
        { tid: 77, cid: 10, title: "Search" }
      ],
      namespaceMainPages: {}
    });

    assert.equal(report.summary.blockingErrors, 1);
    assert.deepEqual(report.reservedRoots.namespaces, []);
    assert.deepEqual(report.reservedRoots.pages, [
      { tid: 77, canonicalPath: "Search", foldedKey: "search", reservedSegment: "Search" }
    ]);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
        { cid: 2, name: "Search", slug: "2/search", parentCid: 1 }
      ],
      topics: [
        { tid: 77, cid: 2, title: "Gond" }
      ],
      namespaceMainPages: {}
    });

    assert.equal(report.summary.blockingErrors, 2);
    assert.deepEqual(report.reservedRoots.pages, [
      {
        tid: 77,
        canonicalPath: "Wiki/Search/Gond",
        foldedKey: "wiki/search/gond",
        routableCanonicalPath: "Search/Gond",
        routableFoldedKey: "search/gond",
        reservedSegment: "Search"
      }
    ]);
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
        { cid: 2, name: "Search", slug: "2/search", parentCid: 1 }
      ],
      topics: [],
      namespaceMainPages: {}
    });

    await assert.rejects(
      () => migration.apply({ scan: report }),
      /canonical wiki migration has blocking collisions/
    );
  }

  {
    const report = await migration.scan({
      categories: [
        { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
        { cid: 2, name: "Search", slug: "2/search", parentCid: 1 }
      ],
      topics: [],
      namespaceMainPages: {}
    });
    const verify = await migration.verify({ scan: report });

    assert.strictEqual(verify.treeIndex.status, "blocking");
    assert.strictEqual(verify.treeIndex.blockingErrors, 1);
  }

  {
    const reservedScan = {
      summary: { blockingErrors: 1 },
      legacyNamespaceMainPages: [],
      retiredGeneratedSlugRows: [],
      invalidSegments: [],
      reservedRoots: {
        namespaces: [{ cid: 10, canonicalPath: "Search", foldedKey: "search", reservedSegment: "Search" }],
        pages: []
      },
      collisions: {}
    };

    await assert.rejects(
      () => migration.apply({ scan: reservedScan }),
      /canonical wiki migration has blocking collisions/
    );
  }

  {
    const verify = await migration.verify({
      scan: {
        summary: { blockingErrors: 1 },
        legacyNamespaceMainPages: [],
        retiredGeneratedSlugRows: [],
        invalidSegments: [],
        reservedRoots: {
          namespaces: [{ cid: 10, canonicalPath: "Search", foldedKey: "search", reservedSegment: "Search" }],
          pages: []
        },
        collisions: {}
      }
    });

    assert.strictEqual(verify.treeIndex.status, "blocking");
    assert.strictEqual(verify.treeIndex.blockingErrors, 1);
  }

  {
    const blockingScan = {
      summary: { blockingErrors: 1 },
      legacyNamespaceMainPages: [],
      retiredGeneratedSlugRows: [],
      invalidSegments: [],
      collisions: {
        foldedPages: [{ foldedKey: "lore/deities/gond", tids: [77, 78] }]
      }
    };

    await assert.rejects(
      () => migration.apply({ scan: blockingScan }),
      /canonical wiki migration has blocking collisions/
    );
  }

  {
    const clearedTopicFields = [];
    const clearedNamespaceMainPages = [];
    const activatedRouteRoots = [];
    const markedVersions = [];
    const invalidations = [];
    const cleanScan = {
      summary: {
        blockingErrors: 0,
        legacyNamespaceMainPages: 1,
        retiredGeneratedSlugRows: 2
      },
      namespaces: [],
      pages: [],
      routeRoots: [
        {
          cid: 10,
          name: "Wiki",
          legacyPath: "/wiki",
          canonicalPath: "Wiki",
          foldedKey: "wiki",
          status: "legacy-slug-root-omission"
        }
      ],
      legacyNamespaceMainPages: [{ cid: 11, tid: 77 }],
      retiredGeneratedSlugRows: [
        { tid: 77, storedRetiredGeneratedSlug: "gond", markerRetiredGeneratedSlug: "gond" },
        { tid: 78, storedRetiredGeneratedSlug: "", markerRetiredGeneratedSlug: "tyr" }
      ],
      invalidSegments: [],
      collisions: {}
    };

    const result = await migration.apply({
      scan: cleanScan,
      services: {
        clearTopicField: async (tid, field) => {
          clearedTopicFields.push({ tid, field });
        },
        clearNamespaceMainPage: async (cid, tid) => {
          clearedNamespaceMainPages.push({ cid, tid });
        },
        setRouteRootCid: async (cid) => {
          activatedRouteRoots.push(cid);
        },
        markMigrationVersion: async (version) => {
          markedVersions.push(version);
        },
        invalidateCanonicalCaches: async (reason) => {
          invalidations.push(reason);
        }
      },
      verifyScan: {
        ...cleanScan,
        summary: {
          blockingErrors: 0,
          legacyNamespaceMainPages: 0,
          retiredGeneratedSlugRows: 1
        },
        legacyNamespaceMainPages: [],
        retiredGeneratedSlugRows: [
          { tid: 78, storedRetiredGeneratedSlug: "", markerRetiredGeneratedSlug: "tyr" }
        ]
      }
    });

    assert.deepEqual(clearedTopicFields, [{ tid: 77, field: "westgateWikiPageSlug" }]);
    assert.deepEqual(clearedNamespaceMainPages, [{ cid: 11, tid: 77 }]);
    assert.deepEqual(activatedRouteRoots, [10]);
    assert.deepEqual(markedVersions, [migration.CANONICAL_PATH_MIGRATION_VERSION]);
    assert.deepEqual(invalidations, ["canonical-path-migration-applied"]);
    assert.equal(result.activatedRouteRootCid, 10);
    assert.equal(result.verify.treeIndex.status, "ok");
    assert.equal(result.verify.activeNamespaceMainPageOverrides, 0);
    assert.equal(result.verify.activeGeneratedPublicSlugRouting, 0);
  }

  {
    const verify = await migration.verify({
      scan: {
        summary: {
          blockingErrors: 0,
          legacyNamespaceMainPages: 0,
          retiredGeneratedSlugRows: 1
        },
        legacyNamespaceMainPages: [],
        retiredGeneratedSlugRows: [
          { tid: 78, storedRetiredGeneratedSlug: "", markerRetiredGeneratedSlug: "tyr" }
        ],
        invalidSegments: [],
        collisions: {}
      }
    });

    assert.strictEqual(verify.treeIndex.status, "ok");
    assert.strictEqual(verify.activeNamespaceMainPageOverrides, 0);
    assert.strictEqual(verify.activeGeneratedPublicSlugRouting, 0);
  }

  await withNodebbStubs(createBaseNodebbStubs({
    "./src/categories": {
      buildForSelectAll: async () => [],
      getCategoryData: async (cid) => ({ cid, name: "Runtime", parentCid: 0 }),
      getChildrenCids: async () => []
    },
    "./src/database": {
      getSortedSetRange: async () => [77],
      getSortedSetRevRange: async () => [],
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/meta": {
      settings: {
        get: async () => ({
          categoryIds: "10",
          includeChildCategories: "0",
          homeTopicId: "77",
          wikiNamespaceCreateGroups: "Runtime Editors",
          routeRootCid: "10"
        }),
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/posts": {
      getPostFields: async () => ({ sourceContent: "<p>Runtime</p>" })
    },
    "./src/topics": {
      getTopicsFields: async () => [
        { tid: 77, cid: 10, title: "Runtime Page", titleRaw: "Runtime Page", mainPid: 770, deleted: 0, scheduled: 0 }
      ]
    }
  }), async () => {
    clearProjectModule("lib/config.js");
    clearProjectModule("lib/wiki-namespace-main-pages.js");
    const runtimeInput = await migration.collectRuntimeInput();

    assert.deepEqual(runtimeInput.settings.categoryIds, [10]);
    assert.equal(runtimeInput.settings.includeChildCategories, false);
    assert.equal(runtimeInput.settings.homeTopicId, 77);
    assert.equal(runtimeInput.settings.routeRootCid, 10);
    assert.deepEqual(runtimeInput.settings.wikiNamespaceCreateGroups, ["Runtime Editors"]);
    assert.deepEqual(runtimeInput.categories, [{ cid: 10, name: "Runtime", parentCid: 0 }]);
    assert.equal(runtimeInput.topics[0].mainPost.sourceContent, "<p>Runtime</p>");
  });

  {
    const adminController = fs.readFileSync(path.join(root, "lib/controllers/admin.js"), "utf8");
    const adminTemplate = fs.readFileSync(path.join(root, "templates/admin/plugins/westgate-wiki.tpl"), "utf8");
    const adminClient = fs.readFileSync(path.join(root, "public/admin.js"), "utf8");
    const library = fs.readFileSync(path.join(root, "library.js"), "utf8");

    assert.match(adminController, /scanWikiPathMigrationReport/, "admin controller should expose scan report action");
    assert.match(adminController, /prepareWikiPathMigrationReport/, "admin controller should expose prepare report action");
    assert.match(adminController, /applyWikiPathMigration/, "admin controller should expose apply action");
    assert.match(adminController, /verifyWikiPathMigration/, "admin controller should expose verify action");
    assert.match(adminController, /isAdministrator/, "admin report endpoints should check administrator status");
    assert.match(adminController, /routeRootCid/, "admin controller should render route root setting state");
    assert.match(library, /"\/westgate-wiki\/path-migration\/scan"/, "scan report API route should be registered");
    assert.match(library, /"\/westgate-wiki\/path-migration\/prepare"/, "prepare report API route should be registered");
    assert.match(library, /"\/westgate-wiki\/path-migration\/apply"/, "apply API route should be registered");
    assert.match(library, /"\/westgate-wiki\/path-migration\/verify"/, "verify API route should be registered");
    assert.match(adminTemplate, /data-wiki-path-migration-scan/, "ACP should include a scan action");
    assert.match(adminTemplate, /data-wiki-path-migration-prepare/, "ACP should include a prepare action");
    assert.match(adminTemplate, /data-wiki-path-migration-apply/, "ACP should include an apply action");
    assert.match(adminTemplate, /data-wiki-path-migration-verify/, "ACP should include a verify action");
    assert.match(adminTemplate, /data-wiki-path-migration-blocking-status/, "ACP should render blocking status");
    assert.match(adminTemplate, /name="routeRootCid"/, "ACP should expose the explicit route root setting");
    assert.match(adminTemplate, /route root/i, "ACP should explain the route root setting");
    assert.match(adminClient, /path-migration\/scan/, "ACP client should call scan report endpoint");
    assert.match(adminClient, /path-migration\/prepare/, "ACP client should call prepare report endpoint");
    assert.match(adminClient, /path-migration\/apply/, "ACP client should call apply endpoint");
    assert.match(adminClient, /path-migration\/verify/, "ACP client should call verify endpoint");
  }

  await withNodebbStubs(createBaseNodebbStubs({
    "./src/user": { isAdministrator: async (uid) => parseInt(uid, 10) === 1 }
  }), async () => {
    clearProjectModule("lib/controllers/admin.js");
    const adminControllers = require("../lib/controllers/admin");
    const originalScanRuntime = migration.scanRuntime;
    const originalPrepareRuntime = migration.prepareRuntime;
    const originalApplyRuntime = migration.applyRuntime;
    const originalVerifyRuntime = migration.verifyRuntime;
    let scanCalls = 0;
    let prepareCalls = 0;
    let applyCalls = 0;
    let verifyCalls = 0;

    migration.scanRuntime = async () => {
      scanCalls += 1;
      return { kind: "scan-report" };
    };
    migration.prepareRuntime = async () => {
      prepareCalls += 1;
      return { kind: "prepare-report" };
    };
    migration.applyRuntime = async () => {
      applyCalls += 1;
      return { kind: "apply-result" };
    };
    migration.verifyRuntime = async () => {
      verifyCalls += 1;
      return { kind: "verify-result" };
    };

    try {
      const adminScanRes = {};
      await adminControllers.scanWikiPathMigrationReport({ uid: 1 }, adminScanRes);
      assert.equal(adminScanRes.statusCode, 200);
      assert.deepEqual(adminScanRes.payload, { kind: "scan-report" });
      assert.equal(scanCalls, 1);

      const nonAdminScanRes = {};
      await adminControllers.scanWikiPathMigrationReport({ uid: 2 }, nonAdminScanRes);
      assert.equal(nonAdminScanRes.statusCode, 403);
      assert.equal(scanCalls, 1);

      const adminPrepareRes = {};
      await adminControllers.prepareWikiPathMigrationReport({ uid: 1 }, adminPrepareRes);
      assert.equal(adminPrepareRes.statusCode, 200);
      assert.deepEqual(adminPrepareRes.payload, { kind: "prepare-report" });
      assert.equal(prepareCalls, 1);

      const nonAdminPrepareRes = {};
      await adminControllers.prepareWikiPathMigrationReport({ uid: 2 }, nonAdminPrepareRes);
      assert.equal(nonAdminPrepareRes.statusCode, 403);
      assert.equal(prepareCalls, 1);

      const adminApplyRes = {};
      await adminControllers.applyWikiPathMigration({ uid: 1 }, adminApplyRes);
      assert.equal(adminApplyRes.statusCode, 200);
      assert.deepEqual(adminApplyRes.payload, { kind: "apply-result" });
      assert.equal(applyCalls, 1);

      const nonAdminApplyRes = {};
      await adminControllers.applyWikiPathMigration({ uid: 2 }, nonAdminApplyRes);
      assert.equal(nonAdminApplyRes.statusCode, 403);
      assert.equal(applyCalls, 1);

      const adminVerifyRes = {};
      await adminControllers.verifyWikiPathMigration({ uid: 1 }, adminVerifyRes);
      assert.equal(adminVerifyRes.statusCode, 200);
      assert.deepEqual(adminVerifyRes.payload, { kind: "verify-result" });
      assert.equal(verifyCalls, 1);

      const nonAdminVerifyRes = {};
      await adminControllers.verifyWikiPathMigration({ uid: 2 }, nonAdminVerifyRes);
      assert.equal(nonAdminVerifyRes.statusCode, 403);
      assert.equal(verifyCalls, 1);
    } finally {
      migration.scanRuntime = originalScanRuntime;
      migration.prepareRuntime = originalPrepareRuntime;
      migration.applyRuntime = originalApplyRuntime;
      migration.verifyRuntime = originalVerifyRuntime;
      clearProjectModule("lib/controllers/admin.js");
    }
  });

  await withNodebbStubs(createBaseNodebbStubs({
    "./src/user": { isAdministrator: async () => false },
    "./src/routes/helpers": {
      setupAdminPageRoute: () => {},
      setupPageRoute: () => {},
      setupApiRoute(router, method, routePath, middleware, handler) {
        router.registeredRoutes.push({ method, routePath, middleware, handler });
      }
    }
  }), async () => {
    clearProjectModule("lib/controllers/admin.js");
    clearProjectModule("library.js");
    const plugin = require("../library");
    const adminControllers = require("../lib/controllers/admin");
    const ensureLoggedIn = function ensureLoggedIn() {};
    const router = { registeredRoutes: [] };

    await plugin.registerApiRoutes({
      router,
      middleware: {
        ensureLoggedIn,
        checkRequired: () => function checkRequired() {}
      }
    });

    const scanRoute = router.registeredRoutes.find((route) => route.routePath === "/westgate-wiki/path-migration/scan");
    const prepareRoute = router.registeredRoutes.find((route) => route.routePath === "/westgate-wiki/path-migration/prepare");
    const applyRoute = router.registeredRoutes.find((route) => route.routePath === "/westgate-wiki/path-migration/apply");
    const verifyRoute = router.registeredRoutes.find((route) => route.routePath === "/westgate-wiki/path-migration/verify");

    assert(scanRoute, "scan migration report route should be registered");
    assert.equal(scanRoute.method, "get");
    assert.deepEqual(scanRoute.middleware, [ensureLoggedIn]);
    assert.equal(scanRoute.handler, adminControllers.scanWikiPathMigrationReport);

    assert(prepareRoute, "prepare migration report route should be registered");
    assert.equal(prepareRoute.method, "post");
    assert.deepEqual(prepareRoute.middleware, [ensureLoggedIn]);
    assert.equal(prepareRoute.handler, adminControllers.prepareWikiPathMigrationReport);

    assert(applyRoute, "apply migration route should be registered");
    assert.equal(applyRoute.method, "post");
    assert.deepEqual(applyRoute.middleware, [ensureLoggedIn]);
    assert.equal(applyRoute.handler, adminControllers.applyWikiPathMigration);

    assert(verifyRoute, "verify migration route should be registered");
    assert.equal(verifyRoute.method, "get");
    assert.deepEqual(verifyRoute.middleware, [ensureLoggedIn]);
    assert.equal(verifyRoute.handler, adminControllers.verifyWikiPathMigration);

    clearProjectModule("library.js");
    clearProjectModule("lib/controllers/admin.js");
  });
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
