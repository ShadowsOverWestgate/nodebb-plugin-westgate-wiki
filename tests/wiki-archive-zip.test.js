"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const archiveExport = require("../lib/wiki-archive-export");
const archiveSchema = require("../lib/wiki-archive-schema");
const archiveZip = require("../lib/wiki-archive-zip");

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

function validArchive(overrides = {}) {
  const pageId = "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const namespaceId = "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const files = new Map([
    [`pages/${pageId}.html`, "<p>Gond</p>"],
    ["reports/export-summary.json", `${JSON.stringify({ reports: [] }, null, 2)}\n`]
  ]);
  const manifest = {
    schemaId: archiveSchema.ARCHIVE_SCHEMA_ID,
    formatId: archiveSchema.ARCHIVE_FORMAT_ID,
    version: archiveSchema.ARCHIVE_FORMAT_VERSION,
    canonicalPathContractVersion: archiveSchema.CANONICAL_PATH_CONTRACT_VERSION,
    exporter: { plugin: "nodebb-plugin-westgate-wiki", version: "0.1.0" },
    checksums: Array.from(files.entries()).map(([path, value]) => checksumRecord(path, value)).sort((a, b) => a.path.localeCompare(b.path)),
    namespaces: [{
      archiveNamespaceId: namespaceId,
      parentArchiveNamespaceId: null,
      canonicalPath: "Lore",
      titlePath: ["Lore"]
    }],
    pages: [{
      archivePageId: pageId,
      archiveNamespaceId: namespaceId,
      canonicalPath: "Lore/Gond",
      title: "Gond",
      articleHtmlPath: `pages/${pageId}.html`,
      articleCss: "",
      discussionDisabled: false,
      topdata: { managedMarkerPreserved: false },
      assetIds: []
    }],
    assets: [],
    settingsSnapshot: {
      categoryRoots: [{
        archiveNamespaceId: namespaceId,
        canonicalPath: "Lore",
        includeDescendants: true
      }],
      includeChildCategories: true,
      homepage: { archivePageId: pageId },
      namespaceCreatorGroups: []
    },
    reports: [],
    ...overrides.manifest
  };
  return {
    manifest,
    files: overrides.files || files
  };
}

function localHeader({ name, flags = 0, compression = 0, crc = 0, compressedSize = 0, uncompressedSize = 0 }) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(10, 4);
  header.writeUInt16LE(flags, 6);
  header.writeUInt16LE(compression, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0x0021, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(uncompressedSize, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer]);
}

function endOfCentralDirectory({ centralOffset = 0, centralSize = 0, entries = 0 } = {}) {
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries, 8);
  eocd.writeUInt16LE(entries, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return eocd;
}

function findEndOfCentralDirectory(zip) {
  for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      return {
        offset,
        centralSize: zip.readUInt32LE(offset + 12),
        centralOffset: zip.readUInt32LE(offset + 16)
      };
    }
  }
  throw new Error("fixture eocd not found");
}

function mutateCentralDirectory(zip, mutate) {
  const eocd = findEndOfCentralDirectory(zip);
  const next = Buffer.from(zip);
  mutate(next, eocd.centralOffset, eocd);
  return next;
}

function prependHiddenBytes(zip, prefix) {
  const eocd = findEndOfCentralDirectory(zip);
  const prefixBuffer = Buffer.from(prefix);
  const next = Buffer.concat([prefixBuffer, zip]);
  const nextEocdOffset = eocd.offset + prefixBuffer.length;
  next.writeUInt32LE(eocd.centralOffset + prefixBuffer.length, nextEocdOffset + 16);

  let cursor = eocd.centralOffset + prefixBuffer.length;
  while (cursor < nextEocdOffset) {
    assert.equal(next.readUInt32LE(cursor), 0x02014b50);
    const nameLength = next.readUInt16LE(cursor + 28);
    const extraLength = next.readUInt16LE(cursor + 30);
    const commentLength = next.readUInt16LE(cursor + 32);
    next.writeUInt32LE(next.readUInt32LE(cursor + 42) + prefixBuffer.length, cursor + 42);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return next;
}

function localEntryNames(zip) {
  const names = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(zip.slice(nameStart, nameStart + nameLength).toString("utf8"));
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return names;
}

(async () => {
  {
    const archive = validArchive();
    const first = archiveZip.createArchiveZip(archive);
    const second = archiveZip.createArchiveZip(validArchive());

    assert.equal(Buffer.compare(first, second), 0);

    const roundTrip = archiveZip.readArchiveZip(first);
    assert.deepEqual(roundTrip.manifest, archive.manifest);
    assert.deepEqual(Array.from(roundTrip.files.keys()).sort(), Array.from(archive.files.keys()).sort());
    assert.equal(roundTrip.files.get(`pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html`).toString("utf8"), "<p>Gond</p>");
  }

  {
    const archive = validArchive({
      files: new Map([
        ["pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html", "<p>Gond</p>"],
        ["../escape.html", "escape"]
      ])
    });
    archive.manifest.checksums = Array.from(archive.files.entries()).map(([path, value]) => checksumRecord(path, value));
    assert.throws(() => archiveZip.createArchiveZip(archive), /unsafe-archive-path/);
  }

  {
    const traversal = mutateCentralDirectory(archiveZip.createArchiveZip(validArchive()), (next, centralOffset) => {
      const unsafeName = Buffer.from("/manifest.jso");
      unsafeName.copy(next, 30);
      unsafeName.copy(next, centralOffset + 46);
    });
    assert.throws(() => archiveZip.readArchiveZip(traversal), /unsafe-archive-path/);
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);
    const tampered = Buffer.from(zip);
    const needle = Buffer.from("<p>Gond</p>");
    const offset = tampered.indexOf(needle);
    assert.notEqual(offset, -1);
    tampered.write("<p>Tyr!</p>", offset, needle.length, "utf8");
    assert.throws(() => archiveZip.readArchiveZip(tampered), /archive-checksum-mismatch|archive-entry-crc-mismatch/);
  }

  {
    const duplicate = Buffer.concat([
      localHeader({ name: "manifest.json" }),
      localHeader({ name: "manifest.json" }),
      endOfCentralDirectory()
    ]);
    assert.throws(() => archiveZip.readArchiveZip(duplicate), /invalid-archive-zip/);
  }

  {
    const compressed = mutateCentralDirectory(archiveZip.createArchiveZip(validArchive()), (next, centralOffset) => {
      next.writeUInt16LE(8, centralOffset + 10);
    });
    assert.throws(() => archiveZip.readArchiveZip(compressed), /unsupported-archive-zip-compression/);
  }

  {
    const dataDescriptor = mutateCentralDirectory(archiveZip.createArchiveZip(validArchive()), (next, centralOffset) => {
      next.writeUInt16LE(0x08, centralOffset + 8);
    });
    assert.throws(() => archiveZip.readArchiveZip(dataDescriptor), /unsupported-archive-zip-data-descriptor/);
  }

  {
    const encrypted = mutateCentralDirectory(archiveZip.createArchiveZip(validArchive()), (next, centralOffset) => {
      next.writeUInt16LE(0x01, centralOffset + 8);
    });
    assert.throws(() => archiveZip.readArchiveZip(encrypted), /unsupported-archive-zip-encryption/);
  }

  {
    const archive = validArchive();
    assert.throws(
      () => archiveZip.createArchiveZip(archive, { policy: { limits: { maxSubordinateFiles: 1 } } }),
      /archive-limit-exceeded/
    );
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);
    assert.throws(
      () => archiveZip.readArchiveZip(zip, { policy: { limits: { maxArchiveBytes: 10 } } }),
      /archive-limit-exceeded/
    );
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);

    assert.throws(
      () => archiveZip.createArchiveZip(archive, { policy: { limits: { maxArchiveBytes: zip.length - 1 } } }),
      /archive-limit-exceeded: archiveBytes/
    );
  }

  {
    const archive = validArchive({
      files: new Map([
        ["pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html", "<p>Gond</p>"],
        ["reports/ä.json", "{}\n"],
        ["reports/z.json", "{}\n"]
      ])
    });
    archive.manifest.checksums = Array.from(archive.files.entries())
      .map(([path, value]) => checksumRecord(path, value))
      .sort((a, b) => a.path < b.path ? -1 : (a.path > b.path ? 1 : 0));

    const zip = archiveZip.createArchiveZip(archive);
    assert.deepEqual(localEntryNames(zip).slice(1), [
      "pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html",
      "reports/z.json",
      "reports/ä.json"
    ]);
    assert.deepEqual(Array.from(archiveZip.readArchiveZip(zip).files.keys()), [
      "pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html",
      "reports/z.json",
      "reports/ä.json"
    ]);
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);
    const eocd = findEndOfCentralDirectory(zip);
    const truncatedBeforeCentral = zip.slice(0, eocd.centralOffset);

    assert.throws(() => archiveZip.readArchiveZip(truncatedBeforeCentral), /invalid-archive-zip/);
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);
    const withLeadingBytes = prependHiddenBytes(zip, "hidden");

    assert.throws(() => archiveZip.readArchiveZip(withLeadingBytes), /invalid-archive-zip/);
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);
    const unsupportedFlag = mutateCentralDirectory(Buffer.from(zip), (next, centralOffset) => {
      const unsupportedFlags = 0x0800 | 0x0002;
      next.writeUInt16LE(unsupportedFlags, 6);
      next.writeUInt16LE(unsupportedFlags, centralOffset + 8);
    });

    assert.throws(() => archiveZip.readArchiveZip(unsupportedFlag), /unsupported-archive-zip-flags/);
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);
    const mismatched = mutateCentralDirectory(zip, (next, centralOffset) => {
      assert.equal(next.readUInt32LE(centralOffset), 0x02014b50);
      next.writeUInt32LE(next.readUInt32LE(centralOffset + 20) + 1, centralOffset + 20);
      next.writeUInt32LE(next.readUInt32LE(centralOffset + 24) + 1, centralOffset + 24);
    });

    assert.throws(() => archiveZip.readArchiveZip(mismatched), /archive-zip-central-local-mismatch/);
  }

  {
    const archive = validArchive({
      files: new Map([
        ["pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html", "<p>Gond</p>"],
        ["reports/aaaa.json", "{}\n"],
        ["reports/bbbb.json", "{}\n"]
      ])
    });
    archive.manifest.checksums = Array.from(archive.files.entries())
      .map(([path, value]) => checksumRecord(path, value))
      .sort((a, b) => a.path.localeCompare(b.path));
    const zip = archiveZip.createArchiveZip(archive);
    const duplicated = mutateCentralDirectory(zip, (next, centralOffset, eocd) => {
      let cursor = centralOffset;
      let firstReportOffset = 0;
      let secondReportOffset = 0;
      for (let index = 0; index < 4; index += 1) {
        assert.equal(next.readUInt32LE(cursor), 0x02014b50);
        const nameLength = next.readUInt16LE(cursor + 28);
        const extraLength = next.readUInt16LE(cursor + 30);
        const commentLength = next.readUInt16LE(cursor + 32);
        const name = next.slice(cursor + 46, cursor + 46 + nameLength).toString("utf8");
        if (name === "reports/aaaa.json") {
          firstReportOffset = cursor;
        }
        if (name === "reports/bbbb.json") {
          secondReportOffset = cursor;
        }
        cursor += 46 + nameLength + extraLength + commentLength;
      }
      assert.notEqual(firstReportOffset, 0);
      assert.notEqual(secondReportOffset, 0);
      const firstNameLength = next.readUInt16LE(firstReportOffset + 28);
      const firstName = next.slice(firstReportOffset + 46, firstReportOffset + 46 + firstNameLength);
      firstName.copy(next, secondReportOffset + 46);
      next.writeUInt32LE(eocd.centralOffset, secondReportOffset + 42);
    });

    assert.throws(() => archiveZip.readArchiveZip(duplicated), /duplicate-archive-entry/);
  }

  {
    const archive = validArchive();
    const zip = archiveZip.createArchiveZip(archive);
    const eocd = findEndOfCentralDirectory(zip);
    const truncatedCentral = Buffer.concat([
      zip.slice(0, eocd.offset - 1),
      endOfCentralDirectory({
        centralOffset: eocd.centralOffset,
        centralSize: eocd.centralSize,
        entries: 3
      })
    ]);

    assert.throws(() => archiveZip.readArchiveZip(truncatedCentral), /invalid-archive-zip/);
  }

  {
    let called = false;
    const result = await archiveExport.createExportZip({
      categories: [{ cid: 1, name: "Lore", parentCid: 0 }],
      topics: [{ tid: 10, cid: 1, title: "Gond", titleRaw: "Gond", mainPid: 100, deleted: 0, scheduled: 0 }],
      migration: {
        async verify() {
          return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
        }
      },
      posts: { async getPostFields() { return { sourceContent: "<p>Gond</p>" }; } },
      topicFieldsApi: {
        async getTopicField() { return "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; },
        async setTopicField() {}
      },
      articleCss: { async getArticleCss() { return ""; } },
      discussionSettings: { async getDiscussionDisabled() { return false; } },
      settingsService: {
        async getSettings() {
          return { categoryIds: [1], includeChildCategories: true, homeTopicId: 10, wikiNamespaceCreateGroups: [] };
        }
      },
      createArchiveZip(input) {
        called = true;
        return archiveZip.createArchiveZip(input);
      }
    });
    assert.equal(called, true);
    assert.equal(Buffer.isBuffer(result.zip), true);
    assert.equal(archiveZip.readArchiveZip(result.zip).manifest.pages[0].canonicalPath, "Lore/Gond");
  }
})();
