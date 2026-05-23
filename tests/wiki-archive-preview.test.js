"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const archiveSchema = require("../lib/wiki-archive-schema");

const importPreview = require("../lib/wiki-archive-import");

function sha256(value) {
  return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value))).digest("hex");
}

const ROOT_NS = "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHILD_NS = "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PAGE_ID = "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_PAGE_ID = "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function checksumRecord(path, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return {
    path,
    bytes: buffer.length,
    sha256: sha256(buffer)
  };
}

function buildArchive(overrides = {}) {
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
      articleCss: "",
      discussionDisabled: false,
      topdata: { managedMarkerPreserved: false },
      assetIds: []
    }
  ];
  const htmlByPath = {
    [`pages/${PAGE_ID}.html`]: "<p>Gond</p>",
    [`pages/${OTHER_PAGE_ID}.html`]: "<p>Tyr</p>",
    ...(overrides.htmlByPath || {})
  };
  const files = new Map();
  pages.forEach((page) => {
    files.set(page.articleHtmlPath, htmlByPath[page.articleHtmlPath] || "<p>Article</p>");
  });

  const assets = overrides.assets || [];
  assets.forEach((asset) => {
    files.set(asset.path, overrides.assetFiles && overrides.assetFiles[asset.path] || Buffer.from(asset.path));
  });

  const checksums = Array.from(files.entries())
    .map(([path, value]) => checksumRecord(path, value))
    .sort((a, b) => a.path.localeCompare(b.path));

  assets.forEach((asset) => {
    const checksum = checksums.find((row) => row.path === asset.path);
    asset.sha256 = checksum.sha256;
    asset.bytes = checksum.bytes;
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
      namespaceCreatorGroups: []
    },
    reports: overrides.reports || []
  };

  return { manifest, files };
}

function okDiagnostics() {
  return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
}

(async () => {
  {
    const archive = buildArchive();
    archive.files.set(`pages/${PAGE_ID}.html`, "<p>Tampered</p>");

    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: okDiagnostics()
      }),
      /archive-checksum-mismatch/
    );
  }

  {
    const unsafeAsset = {
      assetId: "asset_html",
      path: `assets/sha256/${sha256("<script>unsafe</script>")}.html`,
      sha256: "",
      bytes: 0,
      contentType: "text/html",
      sourceReferences: ["/uploads/unsafe.html"],
      referencedByPageIds: [PAGE_ID]
    };
    const archive = buildArchive({
      assets: [unsafeAsset],
      assetFiles: {
        [unsafeAsset.path]: Buffer.from("<script>unsafe</script>")
      },
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/Deities/Gond",
        title: "Gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: ["asset_html"]
      }]
    });

    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: okDiagnostics()
      }),
      /unsupported-archive-asset-type/
    );
  }

  {
    const archive = buildArchive({
      htmlByPath: {
        [`pages/${PAGE_ID}.html`]: '<p><img src="x" onerror="alert(1)"></p>'
      }
    });

    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: okDiagnostics()
      }),
      /unsafe-archive-html/
    );
  }

  {
    const archive = buildArchive({
      htmlByPath: {
        [`pages/${PAGE_ID}.html`]: "<p><a href=javascript:alert(1)>bad</a></p>"
      }
    });

    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: okDiagnostics()
      }),
      /unsafe-archive-html/
    );
  }

  {
    const archive = buildArchive({
      htmlByPath: {
        [`pages/${PAGE_ID}.html`]: '<p><a href="jav&#x61;script:alert(1)">bad</a></p>'
      }
    });

    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: okDiagnostics()
      }),
      /unsafe-archive-html/
    );
  }

  {
    const archive = buildArchive({
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/Deities/Gond",
        title: "Gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "body { display: none; }",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: []
      }]
    });

    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: okDiagnostics()
      }),
      /unsafe-archive-css/
    );
  }

  {
    const archive = buildArchive({
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/Deities/Gond",
        title: "Gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: ".hero { position: fixed; color: red; }",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: []
      }]
    });

    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: okDiagnostics(),
        articleCss: {
          sanitizeArticleCss(css) {
            return String(css || "").replace("position: fixed; ", "");
          }
        }
      }),
      /unsafe-archive-css/
    );
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: { namespaces: [], pages: [], assets: [] }
    });

    assert.equal(preview.status, "ok");
    assert.deepEqual(
      preview.operations.map((operation) => `${operation.type}:${operation.canonicalPath}`),
      [
        "namespace.create:Lore",
        "namespace.create:Lore/Deities",
        "page.create:Lore/Deities/Gond"
      ]
    );
  }

  {
    const archive = buildArchive({
      reports: [
        {
          severity: "warning",
          code: "missing-local-upload",
          path: "Lore/Deities/Gond",
          sourceReference: "/uploads/missing.png",
          message: "Local upload reference could not be read"
        },
        {
          severity: "info",
          code: "local-upload-imported",
          path: "Lore/Deities/Gond",
          sourceReference: "/uploads/imported.png",
          message: "Local upload reference imported"
        },
        {
          severity: "warning",
          code: "remote-upload-reference",
          path: "Lore/Deities/Gond",
          sourceReference: "https://example.com/remote.png",
          message: "Remote upload reference preserved"
        }
      ]
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" },
          { cid: 11, canonicalPath: "Lore/Deities" }
        ],
        pages: [],
        assets: []
      }
    });

    assert.deepEqual(preview.warnings, [
      {
        severity: "warning",
        code: "missing-local-upload",
        path: "Lore/Deities/Gond",
        sourceReference: "/uploads/missing.png",
        message: "Local upload reference could not be read"
      },
      {
        severity: "warning",
        code: "remote-upload-reference",
        path: "Lore/Deities/Gond",
        sourceReference: "https://example.com/remote.png",
        message: "Remote upload reference preserved"
      }
    ]);
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" },
          { cid: 11, canonicalPath: "Lore/Deities" }
        ],
        pages: [{
          tid: 77,
          cid: 11,
          title: "Gond, Wonderbringer",
          canonicalPath: "Lore/Deities/Wonderbringer",
          westgateWikiArchivePageId: PAGE_ID
        }],
        assets: []
      }
    });

    assert.equal(preview.status, "ok");
    const pageOp = preview.operations.find((operation) => operation.type === "page.update");
    assert.equal(pageOp.match, "archive-id");
    assert.equal(pageOp.tid, 77);
    assert.deepEqual(pageOp.changes.canonicalPath, {
      from: "Lore/Deities/Wonderbringer",
      to: "Lore/Deities/Gond"
    });
    assert.deepEqual(pageOp.changes.title, {
      from: "Gond, Wonderbringer",
      to: "Gond"
    });
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" }
        ],
        pages: [{
          tid: 77,
          cid: 10,
          title: "Gond",
          canonicalPath: "Lore/Gond",
          westgateWikiArchivePageId: PAGE_ID
        }],
        assets: []
      }
    });

    const pageOp = preview.operations.find((operation) => operation.type === "page.update");
    assert.deepEqual(pageOp.changes.category, {
      from: 10,
      toArchiveNamespaceId: CHILD_NS,
      planned: true
    });
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" },
          { cid: 11, canonicalPath: "Lore/Deities" }
        ],
        pages: [
          {
            tid: 77,
            cid: 11,
            title: "Gond",
            canonicalPath: "Lore/Deities/Old_Gond",
            westgateWikiArchivePageId: PAGE_ID
          },
          {
            tid: 78,
            cid: 11,
            title: "Gond",
            canonicalPath: "Lore/Deities/Gond",
            westgateWikiArchivePageId: ""
          }
        ],
        assets: []
      }
    });

    assert.equal(preview.status, "blocked");
    assert.deepEqual(preview.blockers.map((blocker) => blocker.code), ["page-id-path-disagreement"]);
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
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
      }
    });

    assert.equal(preview.status, "ok");
    const pageOp = preview.operations.find((operation) => operation.type === "page.adopt");
    assert.equal(pageOp.match, "canonical-path");
    assert.equal(pageOp.tid, 77);
    assert.deepEqual(pageOp.changes.archivePageId, { from: "", to: PAGE_ID });
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" },
          { cid: 11, canonicalPath: "Lore/Deities" }
        ],
        pages: [
          { tid: 78, cid: 11, title: "Gond", canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "" },
          { tid: 77, cid: 11, title: "Gond", canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "" }
        ],
        assets: []
      }
    });

    assert.equal(preview.status, "blocked");
    assert.deepEqual(preview.blockers.map((blocker) => blocker.code), ["page-canonical-ambiguous"]);
    assert.deepEqual(preview.blockers[0].tids, [77, 78]);
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      destination: {
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
      }
    });

    const settingsOp = preview.operations.find((operation) => operation.type === "settings.preview");
    assert.equal(settingsOp.homepage.archivePageId, PAGE_ID);
    assert.equal(settingsOp.homepage.tid, 77);
  }

  {
    const archive = buildArchive({
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
        namespaceCreatorGroups: []
      }
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      destination: {
        namespaces: [{ cid: 10, canonicalPath: "" }],
        pages: [{ tid: 77, cid: 10, title: "Home", canonicalPath: "Home", westgateWikiArchivePageId: "" }],
        assets: []
      }
    });

    assert.equal(preview.status, "ok");
    const settingsOp = preview.operations.find((operation) => operation.type === "settings.preview");
    assert.deepEqual(settingsOp.routeRoot, {
      archiveNamespaceId: ROOT_NS,
      canonicalPath: "",
      cid: 10,
      planned: false
    });
  }

  {
    const alpha = Buffer.from("alpha");
    const beta = Buffer.from("beta");
    const assetA = {
      assetId: "asset_alpha",
      path: `assets/sha256/${sha256(alpha)}.png`,
      sha256: "",
      bytes: 0,
      contentType: "image/png",
      sourceReferences: ["/uploads/alpha.png"],
      referencedByPageIds: [PAGE_ID]
    };
    const assetB = {
      assetId: "asset_beta",
      path: `assets/sha256/${sha256(beta)}.jpg`,
      sha256: "",
      bytes: 0,
      contentType: "image/jpeg",
      sourceReferences: ["/uploads/beta.jpg"],
      referencedByPageIds: [PAGE_ID]
    };
    const archive = buildArchive({
      assets: [assetB, assetA],
      assetFiles: {
        [assetA.path]: alpha,
        [assetB.path]: beta
      },
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/Deities/Gond",
        title: "Gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: ["asset_beta", "asset_alpha"]
      }]
    });
    const writes = [];
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
        pages: [],
        assets: [{ sha256: assetB.sha256, path: "/uploads/imported/beta.jpg" }]
      },
      assetStore: {
        async write() {
          writes.push("write");
        }
      }
    });

    assert.equal(writes.length, 0);
    assert.deepEqual(
      preview.operations.filter((operation) => operation.type.startsWith("asset.")).map((operation) => `${operation.type}:${operation.path}`),
      [
        `asset.import:${assetA.path}`,
        `asset.reuse:${assetB.path}`
      ]
    );
  }

  {
    const assetBytes = Buffer.from("same-content");
    const asset = {
      assetId: "asset_same_content",
      path: `assets/sha256/${sha256(assetBytes)}.png`,
      sha256: "",
      bytes: 0,
      contentType: "image/png",
      sourceReferences: ["/uploads/same-content.png"],
      referencedByPageIds: [PAGE_ID]
    };
    const archive = buildArchive({
      assets: [asset],
      assetFiles: {
        [asset.path]: assetBytes
      },
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/Deities/Gond",
        title: "Gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: ["asset_same_content"]
      }]
    });
    const destinationAssetA = { sha256: asset.sha256, path: "/uploads/imported/a.png" };
    const destinationAssetB = { sha256: asset.sha256, path: "/uploads/imported/b.png" };

    const first = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
        pages: [],
        assets: [destinationAssetB, destinationAssetA]
      }
    });
    const second = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
        pages: [],
        assets: [destinationAssetA, destinationAssetB]
      }
    });
    const firstReuse = first.operations.find((operation) => operation.type === "asset.reuse");
    const secondReuse = second.operations.find((operation) => operation.type === "asset.reuse");

    assert.equal(firstReuse.destinationPath, "/uploads/imported/a.png");
    assert.deepEqual(firstReuse, secondReuse);
  }

  {
    const archive = buildArchive();
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" },
          { cid: 12, canonicalPath: "Lore" }
        ],
        pages: [],
        assets: []
      }
    });

    assert.equal(preview.status, "blocked");
    assert(preview.blockers.some((blocker) => blocker.code === "settings-category-root-unsafe"));
  }

  {
    const original = Buffer.from("original");
    const changed = Buffer.from("changed");
    const asset = {
      assetId: "asset_changed",
      path: "assets/sha256/shared-name.png",
      sha256: "",
      bytes: 0,
      contentType: "image/png",
      sourceReferences: ["/uploads/shared-name.png"],
      referencedByPageIds: [PAGE_ID]
    };
    const archive = buildArchive({
      assets: [asset],
      assetFiles: {
        [asset.path]: changed
      },
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/Deities/Gond",
        title: "Gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: ["asset_changed"]
      }]
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [{ cid: 10, canonicalPath: "Lore" }, { cid: 11, canonicalPath: "Lore/Deities" }],
        pages: [],
        assets: [{ sha256: sha256(original), path: asset.path }]
      }
    });

    assert.equal(preview.status, "ok");
    assert.deepEqual(
      preview.operations.filter((operation) => operation.type.startsWith("asset.")).map((operation) => `${operation.type}:${operation.path}`),
      [`asset.import:${asset.path}`]
    );
  }

  {
    const archive = buildArchive({
      namespaces: [
        {
          archiveNamespaceId: ROOT_NS,
          parentArchiveNamespaceId: null,
          canonicalPath: "Lore",
          titlePath: ["Lore"]
        },
        {
          archiveNamespaceId: CHILD_NS,
          parentArchiveNamespaceId: ROOT_NS,
          canonicalPath: "Lore/deities",
          titlePath: ["Lore", "deities"]
        }
      ],
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/deities/Gond",
        title: "Gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: []
      }]
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" },
          { cid: 11, canonicalPath: "Lore/Deities" }
        ],
        pages: [],
        assets: []
      }
    });

    assert.equal(preview.status, "blocked");
    assert(preview.blockers.some((blocker) =>
      blocker.code === "namespace-placement-unsafe" &&
      blocker.placementStatus === "namespace-folded-collision"));
  }

  {
    const archive = buildArchive({
      pages: [{
        archivePageId: PAGE_ID,
        archiveNamespaceId: CHILD_NS,
        canonicalPath: "Lore/Deities/gond",
        title: "gond",
        articleHtmlPath: `pages/${PAGE_ID}.html`,
        articleCss: "",
        discussionDisabled: false,
        topdata: { managedMarkerPreserved: false },
        assetIds: []
      }]
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      destination: {
        namespaces: [
          { cid: 10, canonicalPath: "Lore" },
          { cid: 11, canonicalPath: "Lore/Deities" }
        ],
        pages: [
          { tid: 78, cid: 11, title: "Gond", canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "" }
        ],
        assets: []
      }
    });

    assert.equal(preview.status, "blocked");
    assert(preview.blockers.some((blocker) =>
      blocker.code === "page-placement-unsafe" &&
      blocker.placementStatus === "page-folded-collision"));
  }

  {
    const archive = buildArchive({
      settingsSnapshot: {
        categoryRoots: [{
          archiveNamespaceId: ROOT_NS,
          canonicalPath: "Lore",
          includeDescendants: true
        }],
        includeChildCategories: true,
        homepage: { archivePageId: PAGE_ID },
        namespaceCreatorGroups: ["Wiki Editors"]
      }
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      destination: {
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
      }
    });

    assert.equal(preview.status, "blocked");
    assert(preview.blockers.some((blocker) =>
      blocker.code === "settings-namespace-creator-group-unverified" &&
      blocker.groupName === "Wiki Editors"));
  }

  {
    const archive = buildArchive({
      settingsSnapshot: {
        categoryRoots: [{
          archiveNamespaceId: ROOT_NS,
          canonicalPath: "Lore",
          includeDescendants: true
        }],
        includeChildCategories: true,
        homepage: { archivePageId: PAGE_ID },
        namespaceCreatorGroups: ["Wiki Editors"]
      }
    });
    const preview = await importPreview.previewArchive({
      manifest: archive.manifest,
      files: archive.files,
      canonicalDiagnostics: okDiagnostics(),
      includeSettings: true,
      destinationGroups: ["Administrators", "Wiki Editors"],
      destination: {
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
      }
    });

    assert.equal(preview.status, "ok");
    const settingsOp = preview.operations.find((operation) => operation.type === "settings.preview");
    assert.deepEqual(settingsOp.namespaceCreatorGroups, ["Wiki Editors"]);
  }

  {
    const archive = buildArchive();
    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: { status: "needs-attention", treeIndex: { status: "blocking", blockingErrors: 1 } }
      }),
      /archive-import-blocked-by-canonical-diagnostics/
    );
  }

  {
    const archive = buildArchive();
    await assert.rejects(
      () => importPreview.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        canonicalDiagnostics: {
          status: "needs-attention",
          treeIndex: { status: "ok", blockingErrors: 0 },
          summary: {
            blockingErrors: 0,
            legacyNamespaceMainPages: 0,
            retiredGeneratedSlugRows: 1
          }
        }
      }),
      /archive-import-blocked-by-canonical-diagnostics/
    );
  }
})();
