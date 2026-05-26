"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const archiveSchema = require("../lib/wiki-archive-schema");
const importPreview = require("../lib/wiki-archive-import");
const archiveApply = require("../lib/wiki-archive-apply");

const ROOT_NS = "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHILD_NS = "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PAGE_ID = "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_PAGE_ID = "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function sha256(value) {
  return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value))).digest("hex");
}

function checksumRecord(path, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return {
    path,
    bytes: buffer.length,
    sha256: sha256(buffer)
  };
}

function okDiagnostics() {
  return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
}

function buildArchive(overrides = {}) {
  const assetBytes = overrides.assetBytes || Buffer.from("gond-image");
  const existingAssetBytes = overrides.existingAssetBytes || Buffer.from("existing-map");
  const asset = {
    assetId: "asset_gond",
    path: `assets/sha256/${sha256(assetBytes)}.png`,
    sha256: "",
    bytes: 0,
    contentType: "image/png",
    sourceReferences: ["/uploads/source/gond.png"],
    referencedByPageIds: [PAGE_ID]
  };
  const existingAsset = {
    assetId: "asset_existing",
    path: `assets/sha256/${sha256(existingAssetBytes)}.jpg`,
    sha256: "",
    bytes: 0,
    contentType: "image/jpeg",
    sourceReferences: ["/assets/uploads/files/map.jpg"],
    referencedByPageIds: [PAGE_ID]
  };
  const assets = overrides.assets || [asset, existingAsset];
  const namespaces = overrides.namespaces || [
    {
      archiveNamespaceId: ROOT_NS,
      parentArchiveNamespaceId: null,
      canonicalPath: "Lore",
      titlePath: ["Lore"]
    },
    {
      archiveNamespaceId: CHILD_NS,
      parentArchiveNamespaceId: ROOT_NS,
      canonicalPath: "Lore/Deities",
      titlePath: ["Lore", "Deities"]
    }
  ];
  const pages = overrides.pages || [
    {
      archivePageId: PAGE_ID,
      archiveNamespaceId: CHILD_NS,
      canonicalPath: "Lore/Deities/Gond",
      title: "Gond",
      articleHtmlPath: `pages/${PAGE_ID}.html`,
      articleCss: ".deity { color: gold; }",
      discussionDisabled: true,
      topdata: { managedMarkerPreserved: false },
      assetIds: assets.map((row) => row.assetId)
    }
  ];
  const htmlByPath = {
    [`pages/${PAGE_ID}.html`]: '<p><img src="/uploads/source/gond.png" /><a href="https://example.test/remote.png" rel="noopener noreferrer">remote</a><a href="/assets/uploads/files/map.jpg" rel="noopener noreferrer">map</a></p>',
    [`pages/${OTHER_PAGE_ID}.html`]: "<p>Other</p>",
    ...(overrides.htmlByPath || {})
  };
  const assetFiles = {
    [asset.path]: assetBytes,
    [existingAsset.path]: existingAssetBytes,
    ...(overrides.assetFiles || {})
  };
  const files = new Map();
  pages.forEach((page) => {
    files.set(page.articleHtmlPath, htmlByPath[page.articleHtmlPath] || "<p>Article</p>");
  });
  assets.forEach((row) => {
    files.set(row.path, assetFiles[row.path] || Buffer.from(row.path));
  });
  const checksums = Array.from(files.entries())
    .map(([path, value]) => checksumRecord(path, value))
    .sort((a, b) => a.path.localeCompare(b.path));

  assets.forEach((row) => {
    const checksum = checksums.find((record) => record.path === row.path);
    row.sha256 = checksum.sha256;
    row.bytes = checksum.bytes;
  });

  const manifest = {
    schemaId: archiveSchema.ARCHIVE_SCHEMA_ID,
    formatId: archiveSchema.ARCHIVE_FORMAT_ID,
    version: archiveSchema.ARCHIVE_FORMAT_VERSION,
    canonicalPathContractVersion: archiveSchema.CANONICAL_PATH_CONTRACT_VERSION,
    exporter: { plugin: "nodebb-plugin-westgate-wiki", version: "0.1.0" },
    checksums,
    namespaces,
    pages,
    assets,
    settingsSnapshot: overrides.settingsSnapshot || {
      categoryRoots: [{
        archiveNamespaceId: ROOT_NS,
        canonicalPath: "Lore",
        includeDescendants: true
      }],
      includeChildCategories: true,
      homepage: { archivePageId: PAGE_ID },
      namespaceCreatorGroups: ["Wiki Curators"]
    },
    reports: []
  };

  return { manifest, files, asset, existingAsset };
}

function approve(preview) {
  return { ...preview, approved: true };
}

async function buildApprovedPreview(archive, options = {}) {
  const preview = await importPreview.previewArchive({
    manifest: archive.manifest,
    files: archive.files,
    canonicalDiagnostics: okDiagnostics(),
    destination: options.destination || { namespaces: [], pages: [], assets: [] },
    destinationGroups: options.destinationGroups || ["Wiki Curators"],
    includeSettings: options.includeSettings
  });
  assert.equal(preview.status, "ok");
  return approve(preview);
}

function createServices(overrides = {}) {
  const events = [];
  const importedAssetsBySha = new Map(overrides.importedAssetsBySha || []);
  let nextCid = 10;
  let nextTid = 100;
  let nextPid = 1000;

  const services = {
    assets: {
      async findBySha256(sha) {
        events.push(`asset.find:${sha.slice(0, 8)}`);
        return importedAssetsBySha.get(sha) || null;
      },
      async importAsset({ asset, buffer }) {
        events.push(`asset.import:${asset.assetId}:${buffer.toString("utf8")}`);
        const result = { path: `/uploads/imported/${asset.assetId}.bin` };
        importedAssetsBySha.set(asset.sha256, result);
        return result;
      }
    },
    namespaces: {
      async createNamespace({ canonicalPath, parentCid }) {
        const cid = nextCid;
        nextCid += 1;
        events.push(`namespace.create:${canonicalPath}:${parentCid || 0}:${cid}`);
        return { cid };
      }
    },
    pages: {
      async createPage({ cid, title, content, uid }) {
        const tid = nextTid;
        const pid = nextPid;
        nextTid += 1;
        nextPid += 1;
        events.push(`page.create:${cid}:${title}:${uid}:${tid}:${pid}:${content}`);
        return { tid, pid, cid };
      },
      async updatePage({ tid, cid, title, content, uid }) {
        events.push(`page.update:${tid}:${cid}:${title}:${uid}:${content}`);
        return { tid, pid: 7770, cid };
      }
    },
    topics: {
      async setTopicField(tid, field, value) {
        events.push(`topic.set:${tid}:${field}:${value}`);
      },
      tools: {
        async move(tid, payload) {
          events.push(`topic.move:${tid}:${payload.cid}:${payload.uid}`);
        }
      }
    },
    posts: {
      async edit(payload) {
        events.push(`post.edit:${payload.pid}:${payload.title}:${payload.uid}:${payload.content}`);
      },
      async getPostFields(pid) {
        events.push(`post.fields:${pid}`);
        return { content: "", sourceContent: "" };
      },
      async setPostFields(pid, fields) {
        events.push(`post.set:${pid}:${fields.content}`);
      },
      clearCachedPost(pid) {
        events.push(`post.clear:${pid}`);
      }
    },
    articleCss: {
      async setArticleCss(tid, css) {
        events.push(`css.set:${tid}:${css}`);
      }
    },
    discussionSettings: {
      async setDiscussionDisabled(tid, disabled) {
        events.push(`discussion.set:${tid}:${disabled}`);
      }
    },
    uploadAssociations: {
      async syncPostUploads({ pid, tid, html }) {
        events.push(`uploads.sync:${pid}:${tid}:${html}`);
      }
    },
    settings: {
      async applySettings(settings) {
        events.push(`settings.apply:${JSON.stringify(settings)}`);
      }
    },
    invalidation: {
      async invalidateNamespace(cid) {
        events.push(`invalidate.namespace:${cid}`);
      },
      async invalidateWikiTreeIndex(payload) {
        events.push(`invalidate.tree:${payload.reason}`);
      },
      async invalidateContent(payload) {
        events.push(`invalidate.content:${payload.tid || ""}:${payload.pid || ""}:${payload.cid || ""}`);
      },
      async invalidateSearch(payload) {
        events.push(`invalidate.search:${payload.tid || ""}:${payload.cid || ""}`);
      },
      async invalidateListing(payload) {
        events.push(`invalidate.listing:${payload.cid || ""}`);
      }
    }
  };

  return {
    events,
    importedAssetsBySha,
    services: {
      ...services,
      ...overrides.services
    }
  };
}

async function applyWithMissingService(servicePath, expectedCode) {
  const archive = buildArchive({
    assets: [],
    htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
  });
  const destination = {
    namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
    pages: [],
    assets: []
  };
  const preview = await buildApprovedPreview(archive, { destination });
  const { services } = createServices();
  const parts = servicePath.split(".");
  let current = services;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current[parts[i]];
  }
  delete current[parts[parts.length - 1]];

  const report = await archiveApply.applyArchive({
    manifest: archive.manifest,
    files: archive.files,
    preview,
    destination,
    canonicalDiagnostics: okDiagnostics(),
    uid: 1,
    services
  });

  assert.equal(report.status, "failed");
  assert.equal(report.results[report.results.length - 1].type, "page.create");
  assert.equal(report.results[report.results.length - 1].code, expectedCode);
}

(async () => {
  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    await assert.rejects(
      () => archiveApply.applyArchive({
        manifest: archive.manifest,
        files: archive.files,
        uid: 1,
        services: createServices().services
      }),
      (err) => err && err.code === "archive-apply-preview-required"
    );
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const blockedPreview = approve({ status: "blocked", blockers: [{ code: "page-id-path-disagreement" }], operations: [] });
    await assert.rejects(
      () => archiveApply.applyArchive({
        manifest: archive.manifest,
        files: archive.files,
        preview: blockedPreview,
        uid: 1,
        services: createServices().services
      }),
      (err) => err && err.code === "archive-apply-preview-blocked"
    );
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: { namespaces: [], pages: [], assets: [] }
    });

    await assert.rejects(
      () => archiveApply.applyArchive({
        manifest: archive.manifest,
        files: archive.files,
        preview,
        destination: { namespaces: [], pages: [], assets: [] },
        canonicalDiagnostics: okDiagnostics(),
        uid: 1,
        services: createServices().services
      }),
      (err) => err && err.code === "archive-apply-preview-not-approved"
    );
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const preview = await buildApprovedPreview(archive, { destination: { namespaces: [], pages: [], assets: [] } });

    await assert.rejects(
      () => archiveApply.applyArchive({
        manifest: archive.manifest,
        files: archive.files,
        preview,
        destination: {
          namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
          pages: [{ tid: 77, cid: 11, title: "Gond", canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: PAGE_ID }],
          assets: []
        },
        canonicalDiagnostics: okDiagnostics(),
        uid: 1,
        services: createServices().services
      }),
      (err) => err && err.code === "archive-apply-preview-stale"
    );
  }

  {
    const archive = buildArchive();
    const destination = {
      namespaces: [],
      pages: [],
      assets: [{ sha256: archive.existingAsset.sha256, path: "/uploads/existing/map.jpg" }],
      groups: ["Wiki Curators"]
    };
    const preview = await buildApprovedPreview(archive, { destination, includeSettings: true });
    const { services, events } = createServices({
      importedAssetsBySha: [[archive.existingAsset.sha256, { path: "/uploads/existing/map.jpg" }]]
    });

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      destinationGroups: ["Wiki Curators"],
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      uid: 42,
      services
    });

    assert.equal(report.status, "completed");
    assert.deepEqual(report.maps.namespaces, { [ROOT_NS]: 10, [CHILD_NS]: 11 });
    assert.deepEqual(report.maps.assets[archive.asset.assetId], "/uploads/imported/asset_gond.bin");
    assert.deepEqual(report.maps.assets[archive.existingAsset.assetId], "/uploads/existing/map.jpg");
    assert.deepEqual(report.maps.pages[PAGE_ID], { tid: 100, pid: 1000, cid: 11 });
    assert(events.indexOf("asset.import:asset_gond:gond-image") < events.findIndex((event) => event.startsWith("page.create:")));
    const pageCreate = events.find((event) => event.startsWith("page.create:"));
    assert.match(pageCreate, /page\.create:11:Gond:42:100:1000:/);
    assert.match(pageCreate, /\/uploads\/imported\/asset_gond\.bin/);
    assert.match(pageCreate, /\/uploads\/existing\/map\.jpg/);
    assert.match(pageCreate, /https:\/\/example\.test\/remote\.png/);
    assert(events.indexOf(events.find((event) => event.startsWith("uploads.sync:1000:100:"))) > events.indexOf(pageCreate));
    assert(events.some((event) => event === `topic.set:100:${archiveSchema.PORTABLE_TOPIC_FIELD}:${PAGE_ID}`));
    assert(events.some((event) => event === "css.set:100:.deity { color: gold; }"));
    assert(events.some((event) => event === "discussion.set:100:true"));
    assert(events.some((event) => event === "invalidate.tree:archive-import-apply"));
    const settingsApply = events.find((event) => event.startsWith("settings.apply:"));
    assert.match(settingsApply, /"cid":10/);
    assert.match(settingsApply, /"tid":100/);
  }

  {
    const archive = buildArchive({
      assets: [],
      namespaces: [{
        archiveNamespaceId: ROOT_NS,
        parentArchiveNamespaceId: null,
        canonicalPath: "",
        titlePath: []
      }],
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: ROOT_NS,
        canonicalPath: "Home",
        title: "Home",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: []
      }],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Home</p>" },
      settingsSnapshot: {
        categoryRoots: [{
          archiveNamespaceId: ROOT_NS,
          canonicalPath: "",
          includeDescendants: true
        }],
        includeChildCategories: true,
        homepage: { archivePageId: PAGE_ID },
        routeRoot: {
          archiveNamespaceId: ROOT_NS,
          canonicalPath: ""
        },
        namespaceCreatorGroups: ["Wiki Curators"]
      }
    });
    const destination = {
      namespaces: [{ cid: 10, canonicalPath: "" }],
      pages: [],
      assets: [],
      groups: ["Wiki Curators"]
    };
    const preview = await buildApprovedPreview(archive, { destination, includeSettings: true });
    const { services, events } = createServices();

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      destinationGroups: ["Wiki Curators"],
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      uid: 42,
      services
    });

    assert.equal(report.status, "completed");
    const settingsApply = events.find((event) => event.startsWith("settings.apply:"));
    assert.match(settingsApply, /"routeRootCid":10/);
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const destination = {
      namespaces: [
        { cid: 10, canonicalPath: "Lore" },
        { cid: 11, canonicalPath: "Lore/Deities" }
      ],
      pages: [{
        tid: 77,
        cid: 10,
        title: "Old Gond",
        canonicalPath: "Lore/Old_Gond",
        westgateWikiArchivePageId: PAGE_ID
      }],
      assets: []
    };
    const preview = await buildApprovedPreview(archive, { destination });
    const { services, events } = createServices();

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 9,
      services
    });

    assert.equal(report.status, "completed");
    assert.deepEqual(report.maps.pages[PAGE_ID], { tid: 77, pid: 7770, cid: 11 });
    assert(events.some((event) => event.startsWith("page.update:77:11:Gond:9:")));
    assert(events.some((event) => event === `topic.set:77:${archiveSchema.PORTABLE_TOPIC_FIELD}:${PAGE_ID}`));
    assert(events.some((event) => event === "uploads.sync:7770:77:<p>Article</p>"));
  }

  {
    const archive = buildArchive({ assets: [] });
    const destination = {
      namespaces: [
        { cid: 10, canonicalPath: "Lore" },
        { cid: 11, canonicalPath: "Lore/Deities" }
      ],
      pages: [{
        tid: 77,
        cid: 11,
        title: "Gond",
        canonicalPath: "Lore/Deities/Gond",
        westgateWikiArchivePageId: ""
      }],
      assets: []
    };
    const preview = await buildApprovedPreview(archive, { destination, includeSettings: true });
    const { services, events } = createServices();

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      destinationGroups: ["Wiki Curators"],
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: false,
      uid: 9,
      services
    });

    assert.equal(report.status, "completed");
    assert(events.some((event) => event.startsWith("page.update:77:11:Gond:9:")));
    assert(events.some((event) => event === `topic.set:77:${archiveSchema.PORTABLE_TOPIC_FIELD}:${PAGE_ID}`));
    assert.equal(events.some((event) => event.startsWith("settings.apply:")), false);
    assert.deepEqual(report.results.map((row) => `${row.status}:${row.type}:${row.code || ""}`), [
      "already-applied:namespace.match:",
      "already-applied:namespace.match:",
      "completed:page.adopt:",
      "skipped:settings.preview:archive-apply-settings-not-requested"
    ]);
  }

  {
    await applyWithMissingService("articleCss.setArticleCss", "archive-apply-article-css-service-unavailable");
  }

  {
    await applyWithMissingService("discussionSettings.setDiscussionDisabled", "archive-apply-discussion-settings-service-unavailable");
  }

  {
    await applyWithMissingService("uploadAssociations.syncPostUploads", "archive-apply-upload-associations-service-unavailable");
  }

  {
    await applyWithMissingService("invalidation.invalidateContent", "archive-apply-invalidate-content-service-unavailable");
  }

  {
    await applyWithMissingService("invalidation.invalidateSearch", "archive-apply-invalidate-search-service-unavailable");
  }

  {
    await applyWithMissingService("invalidation.invalidateListing", "archive-apply-invalidate-listing-service-unavailable");
  }

  {
    await applyWithMissingService("invalidation.invalidateWikiTreeIndex", "archive-apply-invalidate-tree-service-unavailable");
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const destination = { namespaces: [], pages: [], assets: [] };
    const preview = await buildApprovedPreview(archive, { destination });
    const { services, events } = createServices();
    delete services.invalidation.invalidateListing;

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 1,
      services
    });

    assert.equal(report.status, "failed");
    assert.equal(report.results[report.results.length - 1].type, "namespace.create");
    assert.equal(report.results[report.results.length - 1].code, "archive-apply-invalidate-listing-service-unavailable");
    assert.equal(events.some((event) => event.startsWith("namespace.create:")), false);
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const destination = {
      namespaces: [
        { cid: 10, canonicalPath: "Lore" },
        { cid: 11, canonicalPath: "Lore/Deities" }
      ],
      pages: [{
        tid: 77,
        mainPid: 880,
        cid: 10,
        title: "Old Gond",
        canonicalPath: "Lore/Old_Gond",
        westgateWikiArchivePageId: PAGE_ID
      }],
      assets: []
    };
    const preview = await buildApprovedPreview(archive, { destination });
    const { services, events } = createServices({
      services: {
        pages: {
          async updatePage({ tid, cid, title, content, uid }) {
            events.push(`page.update:${tid}:${cid}:${title}:${uid}:${content}`);
            return { tid, cid };
          }
        }
      }
    });

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 9,
      services
    });

    assert.equal(report.status, "completed");
    assert.deepEqual(report.maps.pages[PAGE_ID], { tid: 77, pid: 880, cid: 11 });
    assert(events.some((event) => event === "uploads.sync:880:77:<p>Article</p>"));
    assert(events.some((event) => event === "invalidate.content:77:880:11"));
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const destination = {
      namespaces: [
        { cid: 10, canonicalPath: "Lore" },
        { cid: 11, canonicalPath: "Lore/Deities" }
      ],
      pages: [{
        tid: 78,
        cid: 11,
        title: "Gond",
        canonicalPath: "Lore/Deities/Gond",
        westgateWikiArchivePageId: ""
      }],
      assets: []
    };
    const preview = await buildApprovedPreview(archive, { destination });
    const base = createServices();
    const { services, events } = base;
    services.pages = {
      async updatePage({ tid, cid, title, content, uid }) {
        events.push(`page.update:${tid}:${cid}:${title}:${uid}:${content}`);
        return { tid, cid };
      }
    };
    services.topics.getTopicField = async (tid, field) => {
      events.push(`topic.get:${tid}:${field}`);
      return field === "mainPid" ? "881" : "";
    };

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 9,
      services
    });

    assert.equal(report.status, "completed");
    assert.deepEqual(report.maps.pages[PAGE_ID], { tid: 78, pid: 881, cid: 11 });
    assert(events.some((event) => event === "topic.get:78:mainPid"));
    assert(events.some((event) => event === "uploads.sync:881:78:<p>Article</p>"));
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const destination = {
      namespaces: [
        { cid: 10, canonicalPath: "Lore" },
        { cid: 11, canonicalPath: "Lore/Deities" }
      ],
      pages: [{
        tid: 79,
        mainPid: 882,
        cid: 10,
        title: "Old Gond",
        canonicalPath: "Lore/Old_Gond",
        westgateWikiArchivePageId: PAGE_ID
      }],
      assets: []
    };
    const preview = await buildApprovedPreview(archive, { destination });
    const { services, events } = createServices();
    delete services.pages.updatePage;
    services.topics.getTopicField = async (tid, field) => {
      events.push(`topic.get:${tid}:${field}`);
      return "";
    };
    services.topics.tools.move = async (tid, payload) => {
      events.push(`topic.move:${tid}:${payload.cid}:${payload.uid}`);
    };

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 9,
      services
    });

    assert.equal(report.status, "failed");
    assert.equal(report.results[report.results.length - 1].type, "page.update");
    assert.equal(report.results[report.results.length - 1].code, "archive-apply-page-update-service-unavailable");
    assert.equal(events.some((event) => event.startsWith("topic.move:79:")), false);
    assert.equal(events.some((event) => event.startsWith("post.edit:882:")), false);
    assert.equal(events.some((event) => event.startsWith("topic.get:79:mainPid")), false);
    assert.equal(events.some((event) => event === "uploads.sync:882:79:<p>Article</p>"), false);
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const destination = {
      namespaces: [
        { cid: 10, canonicalPath: "Lore" },
        { cid: 11, canonicalPath: "Lore/Deities" }
      ],
      pages: [{
        tid: 80,
        cid: 10,
        title: "Old Gond",
        canonicalPath: "Lore/Old_Gond",
        westgateWikiArchivePageId: PAGE_ID
      }],
      assets: []
    };
    const preview = await buildApprovedPreview(archive, { destination });
    const { services, events } = createServices();
    delete services.pages.updatePage;
    delete services.topics.getTopicField;

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 9,
      services
    });

    assert.equal(report.status, "failed");
    assert.equal(report.results[report.results.length - 1].type, "page.update");
    assert.equal(report.results[report.results.length - 1].code, "archive-apply-page-update-service-unavailable");
    assert.equal(events.some((event) => event.startsWith("topic.move:80:")), false);
    assert.equal(events.some((event) => event.startsWith("post.edit:")), false);
  }

  {
    const archive = buildArchive({
      assets: [],
      htmlByPath: { [`pages/${PAGE_ID}.html`]: "<p>Article</p>" }
    });
    const destination = {
      namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
      pages: [],
      assets: []
    };
    const preview = await buildApprovedPreview(archive, { destination });
    const { services, events } = createServices();
    delete services.topics.setTopicField;

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 1,
      services
    });

    assert.equal(report.status, "failed");
    assert.equal(report.results[report.results.length - 1].type, "page.create");
    assert.equal(report.results[report.results.length - 1].code, "archive-apply-archive-id-service-unavailable");
    assert.equal(events.some((event) => event.startsWith("page.create:")), false);
  }

  {
    const archive = buildArchive({ assets: [] });
    const destination = {
      namespaces: [
        { cid: 10, canonicalPath: "Lore" },
        { cid: 11, canonicalPath: "Lore/Deities" }
      ],
      pages: [{
        tid: 77,
        cid: 11,
        title: "Gond",
        canonicalPath: "Lore/Deities/Gond",
        westgateWikiArchivePageId: PAGE_ID
      }],
      assets: [],
      groups: ["Wiki Curators"]
    };
    const preview = await buildApprovedPreview(archive, { destination, includeSettings: true });
    const { services } = createServices();
    delete services.invalidation.invalidateWikiTreeIndex;

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      destinationGroups: ["Wiki Curators"],
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      uid: 1,
      services
    });

    assert.equal(report.status, "failed");
    assert.equal(report.results[report.results.length - 1].type, "page.update");
    assert.equal(report.results[report.results.length - 1].code, "archive-apply-invalidate-tree-service-unavailable");
  }

  {
    const archive = buildArchive({
      assets: [],
      namespaces: [{
        archiveNamespaceId: ROOT_NS,
        parentArchiveNamespaceId: null,
        canonicalPath: "Lore",
        titlePath: ["Lore"]
      }],
      pages: [],
      settingsSnapshot: {
        categoryRoots: [{
          archiveNamespaceId: ROOT_NS,
          canonicalPath: "Lore",
          includeDescendants: true
        }],
        includeChildCategories: true,
        homepage: null,
        namespaceCreatorGroups: ["Wiki Curators"]
      }
    });
    const destination = {
      namespaces: [{ cid: 10, canonicalPath: "Lore" }],
      pages: [],
      assets: [],
      groups: ["Wiki Curators"]
    };
    const preview = await buildApprovedPreview(archive, { destination, includeSettings: true });
    const { services } = createServices();
    delete services.invalidation.invalidateWikiTreeIndex;

    const report = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview,
      destination,
      destinationGroups: ["Wiki Curators"],
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      uid: 1,
      services
    });

    assert.equal(report.status, "failed");
    assert.equal(report.results[report.results.length - 1].type, "settings.preview");
    assert.equal(report.results[report.results.length - 1].code, "archive-apply-invalidate-tree-service-unavailable");
  }

  {
    const archive = buildArchive();
    const firstDestination = { namespaces: [], pages: [], assets: [] };
    const firstPreview = await buildApprovedPreview(archive, { destination: firstDestination });
    const firstServices = createServices({
      services: {
        pages: {
          async createPage() {
            throw Object.assign(new Error("create failed"), { code: "test-page-create-failed" });
          }
        }
      }
    });
    const failed = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview: firstPreview,
      destination: firstDestination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 1,
      services: firstServices.services
    });

    assert.equal(failed.status, "failed");
    assert.deepEqual(failed.results.map((row) => `${row.status}:${row.type}:${row.code || ""}`), [
      "completed:asset.import:",
      "completed:asset.import:",
      "completed:namespace.create:",
      "completed:namespace.create:",
      "failed:page.create:test-page-create-failed"
    ]);

    const secondDestination = {
      namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
      pages: [],
      assets: [
        { sha256: archive.asset.sha256, path: "/uploads/imported/asset_gond.bin" },
        { sha256: archive.existingAsset.sha256, path: "/uploads/imported/asset_existing.bin" }
      ]
    };
    const secondPreview = await buildApprovedPreview(archive, { destination: secondDestination });
    const second = createServices({
      importedAssetsBySha: [
        [archive.asset.sha256, { path: "/uploads/imported/asset_gond.bin" }],
        [archive.existingAsset.sha256, { path: "/uploads/imported/asset_existing.bin" }]
      ]
    });
    const recovered = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview: secondPreview,
      destination: secondDestination,
      canonicalDiagnostics: okDiagnostics(),
      uid: 1,
      services: second.services
    });

    assert.equal(recovered.status, "completed");
    assert.equal(second.events.some((event) => event.startsWith("asset.import:")), false);
    assert.equal(second.events.some((event) => event.startsWith("namespace.create:")), false);
    assert(second.events.some((event) => event.startsWith("page.create:11:Gond:1:")));
    assert.deepEqual(recovered.results.map((row) => `${row.status}:${row.type}`), [
      "already-applied:asset.reuse",
      "already-applied:asset.reuse",
      "already-applied:namespace.match",
      "already-applied:namespace.match",
      "completed:page.create"
    ]);
  }

  {
    const archive = buildArchive({ assets: [] });
    const firstDestination = { namespaces: [], pages: [], assets: [], groups: ["Wiki Curators"] };
    const firstPreview = await buildApprovedPreview(archive, { destination: firstDestination, includeSettings: true });
    const first = createServices({
      services: {
        settings: {
          async applySettings() {
            throw Object.assign(new Error("settings failed"), { code: "test-settings-failed" });
          }
        }
      }
    });
    const failed = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview: firstPreview,
      destination: firstDestination,
      destinationGroups: ["Wiki Curators"],
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      uid: 1,
      services: first.services
    });

    assert.equal(failed.status, "failed");
    assert.deepEqual(failed.results.map((row) => `${row.status}:${row.type}:${row.code || ""}`), [
      "completed:namespace.create:",
      "completed:namespace.create:",
      "completed:page.create:",
      "failed:settings.preview:test-settings-failed"
    ]);

    const secondDestination = {
      namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
      pages: [{
        tid: 100,
        cid: 11,
        title: "Gond",
        canonicalPath: "Lore/Deities/Gond",
        westgateWikiArchivePageId: PAGE_ID
      }],
      assets: [],
      groups: ["Wiki Curators"]
    };
    const secondPreview = await buildApprovedPreview(archive, { destination: secondDestination, includeSettings: true });
    const second = createServices();
    const recovered = await archiveApply.applyArchive({
      manifest: archive.manifest,
      files: archive.files,
      preview: secondPreview,
      destination: secondDestination,
      destinationGroups: ["Wiki Curators"],
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      uid: 1,
      services: second.services
    });

    assert.equal(recovered.status, "completed");
    assert.equal(second.events.some((event) => event.startsWith("page.create:")), false);
    assert(second.events.some((event) => event.startsWith("page.update:100:11:Gond:1:")));
    assert(second.events.some((event) => event.startsWith("settings.apply:")));
  }
})();
