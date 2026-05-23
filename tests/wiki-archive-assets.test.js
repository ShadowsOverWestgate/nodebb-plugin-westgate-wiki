"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const archiveAssets = require("../lib/wiki-archive-assets");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

(async () => {
  {
    const png = Buffer.from("local portrait");
    const gif = Buffer.from("local flame");
    const result = await archiveAssets.collectAssetsFromPages([
      {
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/Deities/Gond",
        articleHtml: [
          '<figure><img src="/assets/uploads/files/gond.png"></figure>',
          '<source src="/uploads/flame.gif">',
          '<a href="https://example.test/remote.png">remote</a>',
          '<a href="/assets/uploads/files/missing.png">missing</a>'
        ].join("")
      }
    ], {
      uploadStore: {
        async readLocalUpload(reference) {
          if (reference === "/assets/uploads/files/gond.png") {
            return { buffer: png, contentType: "image/png" };
          }
          if (reference === "/uploads/flame.gif") {
            return { buffer: gif, contentType: "image/gif" };
          }
          return null;
        }
      }
    });

    const expectedPngHash = sha256(png);
    const expectedGifHash = sha256(gif);
    assert.deepEqual(result.assets.map((asset) => asset.path), [
      `assets/sha256/${expectedGifHash}.gif`,
      `assets/sha256/${expectedPngHash}.png`
    ]);
    assert.equal(result.files.get(`assets/sha256/${expectedPngHash}.png`).toString(), "local portrait");
    assert.equal(result.files.get(`assets/sha256/${expectedGifHash}.gif`).toString(), "local flame");
    assert.deepEqual(result.pageAssetIds.get("wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), [
      `asset_${expectedGifHash.slice(0, 32)}`,
      `asset_${expectedPngHash.slice(0, 32)}`
    ]);
    assert.deepEqual(result.reports.map((row) => `${row.severity}:${row.code}:${row.sourceReference}`), [
      "warning:missing-local-upload:/assets/uploads/files/missing.png",
      "warning:remote-asset:https://example.test/remote.png"
    ]);
  }

  {
    const result = await archiveAssets.collectAssetsFromPages([
      {
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/A",
        articleHtml: '<img src="/assets/uploads/files/shared.png">'
      },
      {
        archivePageId: "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        canonicalPath: "Lore/B",
        articleHtml: '<a href="/assets/uploads/files/shared.png">download</a>'
      }
    ], {
      uploadStore: {
        async readLocalUpload() {
          return { buffer: Buffer.from("shared"), contentType: "image/png" };
        }
      }
    });

    assert.equal(result.assets.length, 1);
    assert.deepEqual(result.assets[0].referencedByPageIds, [
      "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    ]);
  }

  {
    let uploadStoreCalls = 0;
    const result = await archiveAssets.collectAssetsFromPages([
      {
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/Remote",
        articleHtml: '<img src="//cdn.example.test/uploads/remote.png">'
      }
    ], {
      uploadStore: {
        async readLocalUpload() {
          uploadStoreCalls += 1;
          return { buffer: Buffer.from("remote content must not be bundled"), contentType: "image/png" };
        }
      }
    });

    assert.equal(uploadStoreCalls, 0);
    assert.deepEqual(result.assets, []);
    assert.deepEqual(Array.from(result.files.keys()), []);
    assert.deepEqual(result.reports.map((row) => `${row.severity}:${row.code}:${row.sourceReference}`), [
      "warning:remote-asset://cdn.example.test/uploads/remote.png"
    ]);
  }

  {
    let uploadStoreCalls = 0;
    const result = await archiveAssets.collectAssetsFromPages([
      {
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/File",
        articleHtml: '<img src="file:///uploads/secret.png">'
      }
    ], {
      uploadStore: {
        async readLocalUpload() {
          uploadStoreCalls += 1;
          return { buffer: Buffer.from("secret content must not be bundled"), contentType: "image/png" };
        }
      }
    });

    assert.equal(uploadStoreCalls, 0);
    assert.deepEqual(result.assets, []);
    assert.deepEqual(Array.from(result.files.keys()), []);
    assert.deepEqual(result.reports.map((row) => `${row.severity}:${row.code}:${row.sourceReference}`), [
      "warning:unsupported-local-reference:file:///uploads/secret.png"
    ]);
  }
})();
