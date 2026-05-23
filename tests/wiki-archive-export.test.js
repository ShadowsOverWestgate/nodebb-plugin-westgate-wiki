"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const archiveExport = require("../lib/wiki-archive-export");
const importPreview = require("../lib/wiki-archive-import");
const archiveManifest = require("../lib/wiki-archive-manifest");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const categories = [
  { cid: 10, name: "Lore", parentCid: 0 },
  { cid: 11, name: "Deities", parentCid: 10 }
];

const topics = [
  {
    tid: 77,
    cid: 11,
    title: "Gond",
    titleRaw: "Gond",
    mainPid: 770,
    deleted: 0,
    scheduled: 0,
    watches: 99,
    notificationCount: 7,
    posts: [{ pid: 771, content: "<p>discussion reply</p>" }],
    cache: { excerpt: "transient" }
  },
  {
    tid: 78,
    cid: 11,
    title: "Tyr",
    titleRaw: "Tyr",
    mainPid: 780,
    deleted: 0,
    scheduled: 0
  }
];

function createFixtureDeps() {
  const topicFields = new Map([
    ["77:westgateWikiArchivePageId", "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
  ]);
  const writes = [];

  return {
    categories,
    topics,
    migration: {
      async verify() {
        return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
      }
    },
    posts: {
      async getPostFields(pid) {
        if (pid === 770) {
          return {
            content: "<p>render cache should not win</p>",
            sourceContent: '<!-- sow-topdata-wiki:page=deities:gond wiki_slug=gond --><p>Gond</p><img src="/uploads/gond.png">'
          };
        }
        if (pid === 780) {
          return {
            content: "<p>Tyr rendered</p>",
            sourceContent: '<p>Tyr</p><a href="https://example.test/tyr">remote</a>'
          };
        }
        throw new Error(`unexpected pid ${pid}`);
      }
    },
    topicFieldsApi: {
      async getTopicField(tid, field) {
        return topicFields.get(`${tid}:${field}`) || "";
      },
      async setTopicField(tid, field, value) {
        writes.push({ tid, field, value });
        topicFields.set(`${tid}:${field}`, value);
      }
    },
    articleCss: {
      async getArticleCss(tid) {
        return tid === 77 ? ".deity { color: gold; }" : "";
      }
    },
    discussionSettings: {
      async getDiscussionDisabled(tid) {
        return tid === 77;
      }
    },
    settingsService: {
      async getSettings() {
        return {
          categoryIds: [10],
          includeChildCategories: true,
          homeTopicId: 77,
          wikiNamespaceCreateGroups: ["Wiki Editors", "Administrators"]
        };
      }
    },
    uploadStore: {
      async readLocalUpload(reference) {
        if (reference === "/uploads/gond.png") {
          return { buffer: Buffer.from("gond asset"), contentType: "image/png" };
        }
        return null;
      }
    },
    idFactory: () => "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    writes
  };
}

(async () => {
  {
    const deps = createFixtureDeps();
    const first = await archiveExport.collectExport(deps);
    const second = await archiveExport.collectExport(createFixtureDeps());

    assert.equal(first.status, "ok");
    assert.equal(archiveManifest.serializeManifest(first.manifest), archiveManifest.serializeManifest(second.manifest));
    assert.deepEqual(first.manifest.namespaces.map((row) => row.canonicalPath), ["Lore", "Lore/Deities"]);
    assert.deepEqual(first.manifest.pages.map((row) => row.canonicalPath), ["Lore/Deities/Gond", "Lore/Deities/Tyr"]);
    assert.deepEqual(first.manifest.pages.map((row) => row.archivePageId), [
      "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    ]);
    assert.equal(first.manifest.settingsSnapshot.homepage.archivePageId, "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.deepEqual(first.manifest.settingsSnapshot.namespaceCreatorGroups, ["Administrators", "Wiki Editors"]);
    assert.deepEqual(deps.writes, [{
      tid: 78,
      field: "westgateWikiArchivePageId",
      value: "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }]);

    const serialized = archiveManifest.serializeManifest(first.manifest);
    assert.equal(sha256(serialized), sha256(archiveManifest.serializeManifest(second.manifest)));
    archiveManifest.validateManifest(first.manifest, { files: first.files });
  }

  {
    let collected = false;
    let verifySawRuntimeInput = false;
    let settingsRefetched = false;
    const topicFields = new Map([
      ["177:westgateWikiArchivePageId", "wgap_cccccccccccccccccccccccccccccccc"]
    ]);
    const result = await archiveExport.collectExport({
      migration: {
        async collectRuntimeInput() {
          collected = true;
          return {
            categories: [
              { cid: 30, name: "Runtime", parentCid: 0 }
            ],
            topics: [
              { tid: 177, cid: 30, title: "Runtime Page", titleRaw: "Runtime Page", mainPid: 1770, deleted: 0, scheduled: 0 }
            ],
            settings: {
              categoryIds: [30],
              includeChildCategories: false,
              homeTopicId: 177,
              wikiNamespaceCreateGroups: ["Runtime Editors"]
            }
          };
        },
        async verify(input) {
          verifySawRuntimeInput = Array.isArray(input && input.categories) &&
            input.categories[0] &&
            input.categories[0].name === "Runtime" &&
            Array.isArray(input.topics) &&
            input.topics[0] &&
            input.topics[0].title === "Runtime Page";
          return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
        }
      },
      settings: {
        categoryIds: [999],
        includeChildCategories: true,
        homeTopicId: 999,
        wikiNamespaceCreateGroups: ["Stale Editors"]
      },
      posts: {
        async getPostFields(pid) {
          assert.equal(pid, 1770);
          return { sourceContent: "<p>Runtime article</p>" };
        }
      },
      topicFieldsApi: {
        async getTopicField(tid, field) {
          return topicFields.get(`${tid}:${field}`) || "";
        },
        async setTopicField() {
          throw new Error("runtime fixture should reuse existing archive id");
        }
      },
      articleCss: { async getArticleCss() { return ""; } },
      discussionSettings: { async getDiscussionDisabled() { return false; } },
      settingsService: {
        async getSettings() {
          settingsRefetched = true;
          throw new Error("settings must come from collected runtime input");
        }
      },
      uploadStore: { async readLocalUpload() { return null; } }
    });

    assert.equal(collected, true);
    assert.equal(verifySawRuntimeInput, true);
    assert.equal(settingsRefetched, false);
    assert.deepEqual(result.manifest.namespaces.map((row) => row.canonicalPath), ["Runtime"]);
    assert.deepEqual(result.manifest.pages.map((row) => row.canonicalPath), ["Runtime/Runtime_Page"]);
    assert.equal(result.manifest.settingsSnapshot.homepage.archivePageId, "wgap_cccccccccccccccccccccccccccccccc");
    assert.deepEqual(result.manifest.settingsSnapshot.categoryRoots, [{
      archiveNamespaceId: result.manifest.namespaces[0].archiveNamespaceId,
      canonicalPath: "Runtime",
      includeDescendants: false
    }]);
  }

  {
    await assert.rejects(
      () => archiveExport.collectExport({
        categories,
        topics: [
          { tid: 177, cid: 11, title: "Local Asset", titleRaw: "Local Asset", mainPid: 1770, deleted: 0, scheduled: 0 }
        ],
        migration: {
          async verify() {
            return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
          }
        },
        posts: {
          async getPostFields() {
            return { sourceContent: '<p>Local</p><img src="/uploads/local.png">' };
          }
        },
        topicFieldsApi: {
          async getTopicField() {
            return "wgap_dddddddddddddddddddddddddddddddd";
          },
          async setTopicField() {}
        },
        articleCss: { async getArticleCss() { return ""; } },
        discussionSettings: { async getDiscussionDisabled() { return false; } },
        settingsService: {
          async getSettings() {
            return {
              categoryIds: [10],
              includeChildCategories: true,
              homeTopicId: null,
              wikiNamespaceCreateGroups: []
            };
          }
        }
      }),
      /archive-export-upload-store-unavailable/
    );
  }

  {
    const deps = createFixtureDeps();
    deps.migration = {
      async verify() {
        return {
          status: "needs-attention",
          treeIndex: { status: "blocking", blockingErrors: 1 },
          summary: { blockingErrors: 1 }
        };
      }
    };

    await assert.rejects(() => archiveExport.collectExport(deps), /archive-export-blocked-by-canonical-diagnostics/);
  }

  {
    const deps = createFixtureDeps();
    deps.migration = {
      async verify() {
        return {
          status: "needs-attention",
          treeIndex: { status: "ok", blockingErrors: 0 },
          summary: {
            blockingErrors: 0,
            legacyNamespaceMainPages: 1,
            retiredGeneratedSlugRows: 0
          }
        };
      }
    };

    await assert.rejects(() => archiveExport.collectExport(deps), /archive-export-blocked-by-canonical-diagnostics/);
  }

  {
    const result = await archiveExport.collectExport(createFixtureDeps());
    const gondPage = result.manifest.pages.find((page) => page.canonicalPath === "Lore/Deities/Gond");
    const gondHtml = result.files.get(gondPage.articleHtmlPath).toString();

    assert.equal(gondHtml.includes("Gond"), true);
    assert.equal(gondHtml.includes("discussion reply"), false);
    assert.equal(gondHtml.includes("render cache should not win"), false);
    assert.equal(JSON.stringify(result.manifest).includes("watches"), false);
    assert.equal(JSON.stringify(result.manifest).includes("notification"), false);
    assert.equal(gondPage.articleCss, ".deity { color: gold; }");
    assert.equal(gondPage.discussionDisabled, true);
    assert.deepEqual(gondPage.topdata, { managedMarkerPreserved: true });
    assert.equal(gondPage.wiki_slug, undefined);
  }

  {
    const result = await archiveExport.collectExport(createFixtureDeps());
    assert.equal(result.manifest.assets.length, 1);
    assert.match(result.manifest.assets[0].path, /^assets\/sha256\/[0-9a-f]{64}\.png$/);
    assert.deepEqual(result.manifest.reports.map((row) => `${row.severity}:${row.code}:${row.path}`), [
      "info:exported-page:Lore/Deities/Gond",
      "info:exported-page:Lore/Deities/Tyr",
      "warning:remote-asset:Lore/Deities/Tyr"
    ]);
  }

  {
    const topicFields = new Map([
      ["90:westgateWikiArchivePageId", "wgap_cccccccccccccccccccccccccccccccc"]
    ]);
    const result = await archiveExport.collectExport({
      categories: [
        { cid: 10, name: "Wiki", parentCid: 0 }
      ],
      topics: [
        { tid: 90, cid: 10, title: "Home", titleRaw: "Home", mainPid: 900, deleted: 0, scheduled: 0 }
      ],
      routeRootCid: 10,
      migration: {
        async verify() {
          return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
        }
      },
      posts: {
        async getPostFields(pid) {
          assert.equal(pid, 900);
          return { sourceContent: "<p>Root page</p>" };
        }
      },
      topicFieldsApi: {
        async getTopicField(tid, field) {
          return topicFields.get(`${tid}:${field}`) || "";
        },
        async setTopicField() {
          throw new Error("route-root page should reuse existing archive id");
        }
      },
      articleCss: { async getArticleCss() { return ""; } },
      discussionSettings: { async getDiscussionDisabled() { return false; } },
      settingsService: {
        async getSettings() {
          return {
            categoryIds: [10],
            includeChildCategories: true,
            homeTopicId: 90,
            routeRootCid: 10,
            wikiNamespaceCreateGroups: []
          };
        }
      },
      uploadStore: { async readLocalUpload() { return null; } }
    });

    assert.deepEqual(result.manifest.namespaces.map((row) => row.canonicalPath), [""]);
    assert.deepEqual(result.manifest.namespaces.map((row) => row.titlePath), [["Wiki"]]);
    assert.deepEqual(result.manifest.pages.map((row) => row.canonicalPath), ["Home"]);
    assert.equal(result.manifest.pages[0].archiveNamespaceId, result.manifest.namespaces[0].archiveNamespaceId);
    assert.deepEqual(result.manifest.settingsSnapshot.categoryRoots, [{
      archiveNamespaceId: result.manifest.namespaces[0].archiveNamespaceId,
      canonicalPath: "",
      includeDescendants: true
    }]);
    assert.deepEqual(result.manifest.settingsSnapshot.routeRoot, {
      archiveNamespaceId: result.manifest.namespaces[0].archiveNamespaceId,
      canonicalPath: ""
    });
    archiveManifest.validateManifest(result.manifest, { files: result.files });
  }

  {
    const result = await archiveExport.collectExport(createFixtureDeps());
    const preview = await importPreview.previewArchive({
      manifest: result.manifest,
      files: result.files,
      canonicalDiagnostics: { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } },
      destination: { namespaces: [], pages: [], assets: [] }
    });

    assert.equal(preview.status, "ok");
    assert.equal(preview.blockers.length, 0);
  }

  {
    const deps = createFixtureDeps();
    deps.articleCss = {
      async getArticleCss(tid) {
        return tid === 77 ? ".hero { position: fixed; color: red; }" : "";
      },
      sanitizeArticleCss(css) {
        return String(css || "").replace("position: fixed; ", "");
      }
    };
    const result = await archiveExport.collectExport(deps);
    const gondPage = result.manifest.pages.find((page) => page.canonicalPath === "Lore/Deities/Gond");

    assert.equal(gondPage.articleCss, ".hero { color: red; }");

    const preview = await importPreview.previewArchive({
      manifest: result.manifest,
      files: result.files,
      canonicalDiagnostics: { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } },
      destination: { namespaces: [], pages: [], assets: [] },
      articleCss: deps.articleCss
    });

    assert.equal(preview.status, "ok");
    assert.equal(preview.blockers.length, 0);
  }
})();
