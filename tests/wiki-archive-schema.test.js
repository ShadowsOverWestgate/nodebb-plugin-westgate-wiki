"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const archiveConfig = require("../lib/archive/wiki-archive-config");
const archiveManifest = require("../lib/archive/wiki-archive-manifest");
const archiveSchema = require("../lib/archive/wiki-archive-schema");
const migration = require("../lib/tree/wiki-canonical-diagnostics");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validPageId(suffix = "11111111111111111111111111111111") {
  return `wgap_${suffix}`;
}

function makeValidManifest(overrides = {}) {
  const pageHtml = "<p>Wonderbringer.</p>\n";
  const tyrPageHtml = "<p>Even-handed.</p>\n";
  const assetBytes = Buffer.from("fakepngbytes\n");
  const reportJson = "{\"warnings\":[]}\n";
  const pagePath = `pages/${validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")}.html`;
  const tyrPagePath = `pages/${validPageId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")}.html`;
  const assetPath = "assets/sha256/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.png";
  const reportPath = "reports/export-summary.json";

  return {
    manifest: {
      schemaId: archiveSchema.ARCHIVE_SCHEMA_ID,
      formatId: archiveSchema.ARCHIVE_FORMAT_ID,
      version: archiveSchema.ARCHIVE_FORMAT_VERSION,
      canonicalPathContractVersion: migration.CANONICAL_PATH_MIGRATION_VERSION,
      exporter: {
        plugin: "nodebb-plugin-westgate-wiki",
        version: "0.1.0"
      },
      checksums: [
        { path: pagePath, bytes: Buffer.byteLength(pageHtml), sha256: sha256(pageHtml) },
        { path: tyrPagePath, bytes: Buffer.byteLength(tyrPageHtml), sha256: sha256(tyrPageHtml) },
        { path: assetPath, bytes: assetBytes.length, sha256: sha256(assetBytes) },
        { path: reportPath, bytes: Buffer.byteLength(reportJson), sha256: sha256(reportJson) }
      ],
      namespaces: [
        {
          archiveNamespaceId: "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          parentArchiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          canonicalPath: "Lore/Deities",
          titlePath: ["Lore", "Deities"]
        },
        {
          archiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          parentArchiveNamespaceId: null,
          canonicalPath: "Lore",
          titlePath: ["Lore"]
        }
      ],
      pages: [
        {
          archivePageId: validPageId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
          archiveNamespaceId: "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          canonicalPath: "Lore/Deities/Tyr",
          title: "Tyr",
          articleHtmlPath: tyrPagePath,
          articleCss: "",
          discussionDisabled: false,
          topdata: { managedMarkerPreserved: false }
        },
        {
          archivePageId: validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
          archiveNamespaceId: "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          canonicalPath: "Lore/Deities/Gond",
          title: "Gond",
          articleHtmlPath: pagePath,
          articleCss: ".deity { color: gold; }",
          discussionDisabled: true,
          topdata: { managedMarkerPreserved: true }
        }
      ],
      assets: [
        {
          assetId: "asset_ffffffffffffffffffffffffffffffff",
          path: assetPath,
          sha256: sha256(assetBytes),
          bytes: assetBytes.length,
          contentType: "image/png",
          referencedByPageIds: [validPageId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
        }
      ],
      settingsSnapshot: {
        categoryRoots: [
          {
            archiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            canonicalPath: "Lore",
            includeDescendants: true
          }
        ],
        includeChildCategories: true,
        homepage: { archivePageId: validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") },
        namespaceCreatorGroups: ["Administrators", "Wiki Editors"]
      },
      reports: [
        { code: "remote-asset", severity: "warning", path: "Lore/Deities/Tyr", message: "Remote asset preserved" },
        { code: "exported-page", severity: "info", path: "Lore/Deities/Gond", message: "Page exported" }
      ],
      ...overrides
    },
    files: {
      [pagePath]: pageHtml,
      [tyrPagePath]: tyrPageHtml,
      [assetPath]: assetBytes,
      [reportPath]: reportJson
    }
  };
}

(async () => {
  {
    assert.equal(archiveSchema.ARCHIVE_SCHEMA_ID, "westgate-wiki-archive/v1");
    assert.equal(archiveSchema.ARCHIVE_FORMAT_ID, "westgate-wiki-archive");
    assert.equal(archiveSchema.ARCHIVE_FORMAT_VERSION, 1);
    assert.equal(archiveSchema.CANONICAL_PATH_CONTRACT_VERSION, migration.CANONICAL_PATH_MIGRATION_VERSION);
    assert.equal(archiveSchema.PORTABLE_TOPIC_FIELD, "westgateWikiArchivePageId");
    assert.equal(archiveSchema.ARCHIVE_PAYLOAD_FIELD_OWNERS.pages.archivePageId, "wiki-archive-identity");
    assert.equal(archiveSchema.ARCHIVE_PAYLOAD_FIELD_OWNERS.pages.canonicalPath, "wiki-tree-index");
    assert.equal(archiveSchema.ARCHIVE_PAYLOAD_FIELD_OWNERS.settingsSnapshot.homepage, "wiki-archive-schema");
    assert.match(archiveSchema.ARCHIVE_EXCLUDED_FIELDS.discussionReplies, /out of scope/i);
    assert.match(archiveSchema.ARCHIVE_EXCLUDED_FIELDS.nodebbCategoryPrivileges, /destination-owned/i);
  }

  {
    const policy = archiveConfig.getArchivePolicyDefaults();
    assert(policy.limits.maxPages > 0);
    assert(policy.limits.maxAssets > 0);
    assert(policy.limits.maxSubordinateFiles > 0);
    assert(policy.retention.completedJobTtlMs > 0);
    assert(policy.cleanup.artifactSweepIntervalMs > 0);
  }

  {
    const { manifest } = makeValidManifest();
    const first = archiveManifest.serializeManifest(manifest);
    const second = archiveManifest.serializeManifest({
      ...manifest,
      reports: manifest.reports.slice().reverse(),
      namespaces: manifest.namespaces.slice().reverse(),
      pages: manifest.pages.slice().reverse(),
      checksums: manifest.checksums.slice().reverse()
    });

    assert.equal(first, second);
    assert.equal(first.endsWith("\n"), true);

    const parsed = JSON.parse(first);
    assert.deepEqual(parsed.namespaces.map((row) => row.canonicalPath), ["Lore", "Lore/Deities"]);
    assert.deepEqual(parsed.pages.map((row) => row.canonicalPath), ["Lore/Deities/Gond", "Lore/Deities/Tyr"]);
    assert.deepEqual(parsed.assets[0].referencedByPageIds, [
      validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      validPageId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    ]);
    assert.deepEqual(parsed.reports.map((row) => `${row.severity}:${row.code}:${row.path}`), [
      "info:exported-page:Lore/Deities/Gond",
      "warning:remote-asset:Lore/Deities/Tyr"
    ]);
  }

  {
    const { manifest } = makeValidManifest({
      pages: [
        { archivePageId: validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), canonicalPath: "Lore/Éclair" },
        { archivePageId: validPageId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), canonicalPath: "Lore/alpha" },
        { archivePageId: validPageId("cccccccccccccccccccccccccccccccc"), canonicalPath: "Lore/Álpha" },
        { archivePageId: validPageId("dddddddddddddddddddddddddddddddd"), canonicalPath: "Lore/Zulu" },
        { archivePageId: validPageId("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"), canonicalPath: "Lore/Alpha" }
      ],
      namespaces: [
        { archiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", canonicalPath: "Lore/Éclair" },
        { archiveNamespaceId: "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", canonicalPath: "Lore/alpha" },
        { archiveNamespaceId: "wgan_cccccccccccccccccccccccccccccccc", canonicalPath: "Lore/Álpha" },
        { archiveNamespaceId: "wgan_dddddddddddddddddddddddddddddddd", canonicalPath: "Lore/Zulu" },
        { archiveNamespaceId: "wgan_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", canonicalPath: "Lore/Alpha" }
      ],
      reports: [
        { severity: "warning", code: "Éclair", path: "Lore/Éclair", message: "" },
        { severity: "warning", code: "alpha", path: "Lore/alpha", message: "" },
        { severity: "warning", code: "Álpha", path: "Lore/Álpha", message: "" },
        { severity: "warning", code: "Zulu", path: "Lore/Zulu", message: "" },
        { severity: "warning", code: "Alpha", path: "Lore/Alpha", message: "" }
      ]
    });
    const parsed = JSON.parse(archiveManifest.serializeManifest(manifest));
    const expectedCodeUnitOrder = ["Lore/Alpha", "Lore/Zulu", "Lore/alpha", "Lore/Álpha", "Lore/Éclair"];
    assert.deepEqual(parsed.pages.map((row) => row.canonicalPath), expectedCodeUnitOrder);
    assert.deepEqual(parsed.namespaces.map((row) => row.canonicalPath), expectedCodeUnitOrder);
    assert.deepEqual(parsed.reports.map((row) => row.path), expectedCodeUnitOrder);
  }

  {
    const { manifest, files } = makeValidManifest();
    const result = archiveManifest.validateManifest(manifest, { files });
    assert.equal(result.status, "ok");
    assert.equal(result.manifest.canonicalPathContractVersion, migration.CANONICAL_PATH_MIGRATION_VERSION);
    assert.equal(result.manifest.settingsSnapshot.homepage.archivePageId, validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  }

  {
    const { manifest, files } = makeValidManifest();
    const rootNamespace = {
      archiveNamespaceId: "wgan_cccccccccccccccccccccccccccccccc",
      parentArchiveNamespaceId: null,
      canonicalPath: "",
      titlePath: []
    };
    const pageId = validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const pages = manifest.pages.map((page) => page.archivePageId === pageId ? {
      ...page,
      archiveNamespaceId: rootNamespace.archiveNamespaceId,
      canonicalPath: "Home",
      title: "Home"
    } : page);
    const settingsSnapshot = {
      ...manifest.settingsSnapshot,
      categoryRoots: [{
        archiveNamespaceId: rootNamespace.archiveNamespaceId,
        canonicalPath: "",
        includeDescendants: true
      }],
      routeRoot: {
        archiveNamespaceId: rootNamespace.archiveNamespaceId,
        canonicalPath: ""
      }
    };
    const result = archiveManifest.validateManifest({
      ...manifest,
      namespaces: manifest.namespaces.concat(rootNamespace),
      pages,
      settingsSnapshot
    }, { files });

    assert.equal(result.status, "ok");
    assert.equal(result.manifest.namespaces[0].canonicalPath, "");
    assert.equal(result.manifest.settingsSnapshot.routeRoot.canonicalPath, "");
  }

  {
    const { manifest, files } = makeValidManifest();
    const namespaces = manifest.namespaces.map((namespace) => namespace.archiveNamespaceId === "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ?
      { ...namespace, canonicalPath: "Lore/Faiths", titlePath: ["Lore", "Deities"] } :
      namespace);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, namespaces }, { files }),
      /invalid-namespace-canonical-path/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const otherNamespace = {
      archiveNamespaceId: "wgan_cccccccccccccccccccccccccccccccc",
      parentArchiveNamespaceId: null,
      canonicalPath: "Other",
      titlePath: ["Other"]
    };
    const namespaces = manifest.namespaces
      .map((namespace) => namespace.archiveNamespaceId === "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ?
        { ...namespace, parentArchiveNamespaceId: otherNamespace.archiveNamespaceId } :
        namespace)
      .concat(otherNamespace);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, namespaces }, { files }),
      /invalid-archive-namespace-parent/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const namespaces = [{
      archiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      parentArchiveNamespaceId: null,
      canonicalPath: "category",
      titlePath: ["category"]
    }];
    const pages = manifest.pages.map((page) => ({
      ...page,
      archiveNamespaceId: namespaces[0].archiveNamespaceId,
      canonicalPath: "category/Gond"
    }));
    assert.throws(
      () => archiveManifest.validateManifest({
        ...manifest,
        namespaces,
        pages,
        settingsSnapshot: {
          ...manifest.settingsSnapshot,
          categoryRoots: [{
            archiveNamespaceId: namespaces[0].archiveNamespaceId,
            canonicalPath: "category",
            includeDescendants: true
          }]
        }
      }, { files }),
      /invalid-namespace-canonical-path/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const pages = manifest.pages.map((page) => page.archivePageId === validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") ?
      { ...page, canonicalPath: "Lore/Deities/Wonderbringer", title: "Gond" } :
      page);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, pages }, { files }),
      /invalid-page-canonical-path/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const pages = manifest.pages.map((page) => page.archivePageId === validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") ?
      { ...page, canonicalPath: "Lore/Deities/Gond", title: "Lore :: Deities :: Gond" } :
      page);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, pages }, { files }),
      /invalid-page-canonical-path/
    );
  }

  for (const [label, mutate, errorPattern] of [
    [
      "top-level unknown key",
      (manifest) => ({ ...manifest, tid: 77 }),
      /invalid-archive-manifest/
    ],
    [
      "exporter unknown key",
      (manifest) => ({ ...manifest, exporter: { ...manifest.exporter, cid: 10 } }),
      /invalid-exporter-record/
    ],
    [
      "checksum unknown key",
      (manifest) => ({
        ...manifest,
        checksums: manifest.checksums.map((record, index) => index === 0 ? { ...record, pid: 123 } : record)
      }),
      /invalid-checksum-record/
    ],
    [
      "namespace unknown key",
      (manifest) => ({
        ...manifest,
        namespaces: manifest.namespaces.map((record, index) => index === 0 ? { ...record, cid: 10 } : record)
      }),
      /invalid-namespace-record/
    ],
    [
      "asset unknown key",
      (manifest) => ({
        ...manifest,
        assets: manifest.assets.map((record, index) => index === 0 ? { ...record, slug: "raw-upload-slug" } : record)
      }),
      /invalid-asset-record/
    ],
    [
      "report unknown key",
      (manifest) => ({
        ...manifest,
        reports: manifest.reports.map((record, index) => index === 0 ? { ...record, tid: 77 } : record)
      }),
      /invalid-report-record/
    ],
    [
      "topdata unknown key",
      (manifest) => ({
        ...manifest,
        pages: manifest.pages.map((record, index) => index === 0 ?
          { ...record, topdata: { ...record.topdata, wiki_slug: "retired-generated-slug" } } :
          record)
      }),
      /invalid-topdata-record/
    ]
  ]) {
    const { manifest, files } = makeValidManifest();
    assert.throws(
      () => archiveManifest.validateManifest(mutate(manifest), { files }),
      errorPattern,
      label
    );
  }

  for (const retiredField of ["wiki_slug", "westgateWikiPageSlug", "tid", "pid", "cid", "slug"]) {
    const { manifest, files } = makeValidManifest();
    const pages = manifest.pages.map((page, index) => index === 0 ? { ...page, [retiredField]: "retired-authority" } : page);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, pages }, { files }),
      /invalid-page-record/,
      retiredField
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const pages = manifest.pages.map((page, index) => index === 0 ? { ...page, assetIds: "asset-list" } : page);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, pages }, { files }),
      /invalid-page-asset-list/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const pages = manifest.pages.map((page, index) => index === 0 ? { ...page, assetIds: ["not-an-asset"] } : page);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, pages }, { files }),
      /invalid-archive-asset-reference/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const pageId = validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const assetId = manifest.assets[0].assetId;
    const pages = manifest.pages.map((page) => page.archivePageId === pageId ? { ...page, assetIds: [assetId] } : page);
    const assets = manifest.assets.map((asset) => asset.assetId === assetId ?
      { ...asset, referencedByPageIds: [validPageId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")] } :
      asset);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, pages, assets }, { files }),
      /invalid-page-asset-reference/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const assetId = manifest.assets[0].assetId;
    const pages = manifest.pages.map((page, index) => index === 0 ? { ...page, assetIds: [assetId] } : page);
    assert.equal(archiveManifest.validateManifest({ ...manifest, pages }, { files }).status, "ok");
  }

  for (const invalidManifest of [null, "manifest", 7, []]) {
    assert.throws(
      () => archiveManifest.validateManifest(invalidManifest, { files: {} }),
      /invalid-archive-manifest/
    );
  }

  {
    const fixturePath = path.join(__dirname, "fixtures", "westgate-wiki-archive-v1-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const pageHtml = "<p>Wonderbringer.</p>\n";
    const result = archiveManifest.validateManifest(manifest, {
      files: {
        [`pages/${validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")}.html`]: pageHtml
      }
    });
    assert.equal(result.status, "ok");
    assert.equal(archiveManifest.serializeManifest(manifest), fs.readFileSync(fixturePath, "utf8"));
  }

  {
    const { manifest, files } = makeValidManifest({ schemaId: "westgate-wiki-archive/v2" });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /unsupported-archive-schema/
    );
  }

  {
    const { manifest, files } = makeValidManifest({ version: 2 });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /unsupported-archive-version/
    );
  }

  {
    const { manifest, files } = makeValidManifest({ canonicalPathContractVersion: "slug-leaf-v0" });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /unsupported-canonical-path-contract/
    );
  }

  for (const [field, errorPattern] of [
    ["checksums", /invalid-checksum-list/],
    ["namespaces", /invalid-namespace-list/],
    ["pages", /invalid-page-list/],
    ["assets", /invalid-asset-list/],
    ["reports", /invalid-report-list/]
  ]) {
    const { manifest, files } = makeValidManifest({ [field]: { not: "an array" } });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      errorPattern,
      field
    );
  }

  for (const unsafePath of ["../x", "/tmp/x", "assets/../x", "assets\\x.png"]) {
    const { manifest, files } = makeValidManifest({
      checksums: [{ path: unsafePath, bytes: 1, sha256: "a".repeat(64) }]
    });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /unsafe-archive-path/,
      unsafePath
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files, policy: { limits: { maxPages: 1 } } }),
      /archive-limit-exceeded/
    );
  }

  for (const mutate of [
    (manifest) => ({
      ...manifest,
      checksums: manifest.checksums.concat({ ...manifest.checksums[0] })
    }),
    (manifest) => ({
      ...manifest,
      namespaces: manifest.namespaces.concat({
        ...manifest.namespaces[0],
        canonicalPath: "Lore/Other",
        titlePath: ["Lore", "Other"]
      })
    }),
    (manifest) => ({
      ...manifest,
      namespaces: manifest.namespaces.concat({
        ...manifest.namespaces[0],
        archiveNamespaceId: "wgan_cccccccccccccccccccccccccccccccc"
      })
    }),
    (manifest) => ({
      ...manifest,
      pages: manifest.pages.concat({
        ...manifest.pages[0],
        canonicalPath: "Lore/Deities/Other",
        title: "Other"
      })
    }),
    (manifest) => ({
      ...manifest,
      pages: manifest.pages.concat({
        ...manifest.pages[0],
        archivePageId: validPageId("cccccccccccccccccccccccccccccccc")
      })
    }),
    (manifest) => ({
      ...manifest,
      assets: manifest.assets.concat({
        ...manifest.assets[0]
      })
    }),
    (manifest) => ({
      ...manifest,
      assets: manifest.assets.concat({
        ...manifest.assets[0],
        assetId: "asset_cccccccccccccccccccccccccccccccc"
      })
    })
  ]) {
    const { manifest, files } = makeValidManifest();
    assert.throws(
      () => archiveManifest.validateManifest(mutate(manifest), { files }),
      /duplicate-archive-field/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const namespaces = manifest.namespaces.map((namespace) => namespace.archiveNamespaceId === "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ?
      { ...namespace, parentArchiveNamespaceId: "wgan_cccccccccccccccccccccccccccccccc" } :
      namespace);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, namespaces }, { files }),
      /invalid-archive-namespace-parent/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const namespaces = manifest.namespaces.map((namespace) => namespace.archiveNamespaceId === "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ?
      { ...namespace, parentArchiveNamespaceId: namespace.archiveNamespaceId } :
      namespace);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, namespaces }, { files }),
      /invalid-archive-namespace-parent/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const namespaces = manifest.namespaces.map((namespace) => {
      if (namespace.archiveNamespaceId === "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") {
        return { ...namespace, parentArchiveNamespaceId: "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
      }
      if (namespace.archiveNamespaceId === "wgan_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
        return { ...namespace, parentArchiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
      }
      return namespace;
    });
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, namespaces }, { files }),
      /invalid-archive-namespace-cycle/
    );
  }

  {
    const { manifest, files } = makeValidManifest({
      checksums: []
    });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /missing-archive-checksum/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const assetPath = manifest.assets[0].path;
    const checksums = manifest.checksums.filter((record) => record.path !== assetPath);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, checksums }, { files }),
      /missing-archive-checksum/
    );
  }

  {
    const { manifest, files } = makeValidManifest({
      checksums: [{ path: `pages/${validPageId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")}.html`, bytes: 999, sha256: "0".repeat(64) }]
    });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /archive-checksum-mismatch/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const checksums = manifest.checksums.map((record, index) => index === 0 ?
      { ...record, bytes: `${record.bytes}junk` } :
      record);
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, checksums }, { files }),
      /invalid-checksum-record/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const assets = manifest.assets.map((asset) => ({ ...asset, sha256: "0".repeat(64) }));
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, assets }, { files }),
      /asset-checksum-metadata-mismatch/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const assets = manifest.assets.map((asset) => ({ ...asset, bytes: asset.bytes + 1 }));
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, assets }, { files }),
      /asset-checksum-metadata-mismatch/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const assets = manifest.assets.map((asset) => ({ ...asset, bytes: `${asset.bytes}junk` }));
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, assets }, { files }),
      /invalid-asset-bytes/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const assets = manifest.assets.map((asset) => ({ ...asset, referencedByPageIds: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, assets }, { files }),
      /invalid-asset-reference-list/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const assets = manifest.assets.map((asset) => ({ ...asset, referencedByPageIds: ["not-a-page-id"] }));
    assert.throws(
      () => archiveManifest.validateManifest({ ...manifest, assets }, { files }),
      /invalid-archive-page-reference/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    assert.throws(
      () => archiveManifest.validateManifest(manifest, {
        files: {
          ...files,
          "pages/unmanifested.html": "<p>Not declared.</p>\n"
        }
      }),
      /unmanifested-archive-file/
    );
  }

  {
    const { manifest, files } = makeValidManifest();
    const fileMap = new Map(Object.entries(files));
    fileMap.set("reports/unmanifested.json", "{}\n");
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files: fileMap }),
      /unmanifested-archive-file/
    );
  }

  {
    const { manifest, files } = makeValidManifest({
      settingsSnapshot: {
        includeChildCategories: true,
        homepage: { tid: 77, slug: "Lore/Deities/Gond" },
        categoryRoots: [],
        namespaceCreatorGroups: []
      }
    });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /invalid-settings-snapshot/
    );
  }

  for (const settingsSnapshot of [
    {},
    {
      categoryRoots: [],
      homepage: null,
      namespaceCreatorGroups: []
    },
    {
      categoryRoots: [],
      includeChildCategories: "1",
      homepage: null,
      namespaceCreatorGroups: []
    },
    {
      categoryRoots: "Lore",
      includeChildCategories: true,
      homepage: null,
      namespaceCreatorGroups: []
    },
    {
      categoryRoots: [{ archiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", tid: 77 }],
      includeChildCategories: true,
      homepage: null,
      namespaceCreatorGroups: []
    },
    {
      categoryRoots: [{ archiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", canonicalPath: "Wrong/Path", includeDescendants: true }],
      includeChildCategories: true,
      homepage: null,
      namespaceCreatorGroups: []
    },
    {
      categoryRoots: [],
      includeChildCategories: true,
      homepage: null,
      namespaceCreatorGroups: ["Administrators", 77]
    }
  ]) {
    const { manifest, files } = makeValidManifest({ settingsSnapshot });
    assert.throws(
      () => archiveManifest.validateManifest(manifest, { files }),
      /invalid-settings-snapshot/
    );
  }

  {
    const { manifest, files } = makeValidManifest({
      settingsSnapshot: {
        categoryRoots: [],
        includeChildCategories: false,
        homepage: null,
        namespaceCreatorGroups: []
      }
    });
    assert.equal(archiveManifest.validateManifest(manifest, { files }).status, "ok");
  }
})();
