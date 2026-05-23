"use strict";

const archiveConfig = require("./wiki-archive-config");
const archiveManifest = require("./wiki-archive-manifest");

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const DOS_DATE_1980_01_01 = 0x0021;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const MAX_UINT32 = 0xffffffff;
const MAX_UINT16 = 0xffff;
const EXTERNAL_FILE_ATTRS = (0o100644 * 0x10000) >>> 0;

let crcTable = null;

function makeError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c >>> 0;
  }
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(String(value === undefined || value === null ? "" : value));
}

function getFileEntries(files) {
  if (files instanceof Map) {
    return Array.from(files.entries());
  }
  if (files && typeof files === "object") {
    return Object.keys(files).map((key) => [key, files[key]]);
  }
  return [];
}

function compareText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function normalizeEntryPath(entryPath) {
  const safePath = archiveManifest.assertSafeArchivePath(entryPath);
  if (safePath === "manifest.json") {
    throw makeError("reserved-archive-entry-path", "reserved-archive-entry-path: manifest.json");
  }
  return safePath;
}

function assertZip32Value(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw makeError(code || "archive-zip64-unsupported");
  }
}

function validateZipPolicy(entryCount, uncompressedBytes, policy) {
  const limits = policy.limits || {};
  if (Number.isInteger(limits.maxSubordinateFiles) && limits.maxSubordinateFiles > 0 && entryCount - 1 > limits.maxSubordinateFiles) {
    throw makeError("archive-limit-exceeded", "archive-limit-exceeded: zipEntries");
  }
  if (Number.isInteger(limits.maxArchiveBytes) && limits.maxArchiveBytes > 0 && uncompressedBytes > limits.maxArchiveBytes) {
    throw makeError("archive-limit-exceeded", "archive-limit-exceeded: zipUncompressedBytes");
  }
}

function createLocalFileRecord(name, data) {
  const nameBuffer = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30);
  const crc = crc32(data);
  header.writeUInt32LE(LOCAL_FILE_HEADER, 0);
  header.writeUInt16LE(10, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(STORE_METHOD, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return {
    crc,
    data,
    name,
    nameBuffer,
    record: Buffer.concat([header, nameBuffer, data])
  };
}

function createCentralDirectoryRecord(entry, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
  header.writeUInt16LE(0x031e, 4);
  header.writeUInt16LE(10, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(STORE_METHOD, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(entry.nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(EXTERNAL_FILE_ATTRS, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, entry.nameBuffer]);
}

function createArchiveZip(input = {}, options = {}) {
  const policy = archiveConfig.normalizeArchivePolicy(options.policy || input.policy || {});
  const validation = archiveManifest.validateManifest(input.manifest, {
    files: input.files,
    policy
  });
  const serializedManifest = archiveManifest.serializeManifest(validation.manifest);
  const entries = [["manifest.json", serializedManifest]]
    .concat(getFileEntries(input.files)
      .map(([entryPath, value]) => [normalizeEntryPath(entryPath), value])
      .sort((a, b) => compareText(a[0], b[0])));
  const seen = new Set();
  let totalUncompressed = 0;

  const localRecords = entries.map(([entryPath, value]) => {
    if (seen.has(entryPath)) {
      throw makeError("duplicate-archive-entry", `duplicate-archive-entry: ${entryPath}`);
    }
    seen.add(entryPath);
    const data = toBuffer(value);
    totalUncompressed += data.length;
    assertZip32Value(data.length);
    return createLocalFileRecord(entryPath, data);
  });

  validateZipPolicy(localRecords.length, totalUncompressed, policy);
  if (localRecords.length > MAX_UINT16) {
    throw makeError("archive-zip64-unsupported");
  }

  const output = [];
  const central = [];
  let offset = 0;
  localRecords.forEach((entry) => {
    assertZip32Value(offset);
    output.push(entry.record);
    central.push(createCentralDirectoryRecord(entry, offset));
    offset += entry.record.length;
  });

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(central);
  assertZip32Value(centralOffset);
  assertZip32Value(centralBuffer.length);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(localRecords.length, 8);
  eocd.writeUInt16LE(localRecords.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const zipBuffer = Buffer.concat(output.concat([centralBuffer, eocd]));
  if (Number.isInteger(policy.limits.maxArchiveBytes) && policy.limits.maxArchiveBytes > 0 && zipBuffer.length > policy.limits.maxArchiveBytes) {
    throw makeError("archive-limit-exceeded", "archive-limit-exceeded: archiveBytes");
  }
  return zipBuffer;
}

function validateZipFlags(flags) {
  if (flags & 0x0041) {
    throw makeError("unsupported-archive-zip-encryption");
  }
  if (flags & 0x0008) {
    throw makeError("unsupported-archive-zip-data-descriptor");
  }
  if (flags & ~UTF8_FLAG) {
    throw makeError("unsupported-archive-zip-flags");
  }
}

function findEndOfCentralDirectory(zipBuffer) {
  if (zipBuffer.length < 22) {
    throw makeError("invalid-archive-zip");
  }
  const eocdOffset = zipBuffer.length - 22;
  if (zipBuffer.readUInt32LE(eocdOffset) !== END_OF_CENTRAL_DIRECTORY) {
    throw makeError("invalid-archive-zip");
  }

  const diskNumber = zipBuffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = zipBuffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = zipBuffer.readUInt16LE(eocdOffset + 8);
  const entriesTotal = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const commentLength = zipBuffer.readUInt16LE(eocdOffset + 20);

  if (commentLength !== 0 || diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entriesTotal) {
    throw makeError("unsupported-archive-zip-feature");
  }
  if (entriesTotal === MAX_UINT16 || centralSize === MAX_UINT32 || centralOffset === MAX_UINT32) {
    throw makeError("archive-zip64-unsupported");
  }
  if (centralOffset + centralSize !== eocdOffset || centralOffset > zipBuffer.length || centralSize > zipBuffer.length) {
    throw makeError("invalid-archive-zip");
  }

  return {
    centralOffset,
    centralSize,
    entriesTotal,
    eocdOffset
  };
}

function validateCompression(compression, compressedSize, uncompressedSize) {
  if (compression !== STORE_METHOD) {
    throw makeError("unsupported-archive-zip-compression");
  }
  if (compressedSize === MAX_UINT32 || uncompressedSize === MAX_UINT32) {
    throw makeError("archive-zip64-unsupported");
  }
  if (compressedSize !== uncompressedSize) {
    throw makeError("unsupported-archive-zip-compression");
  }
}

function parseCentralDirectory(zipBuffer, eocd) {
  const entries = [];
  const seen = new Set();
  let offset = eocd.centralOffset;

  for (let index = 0; index < eocd.entriesTotal; index += 1) {
    if (offset + 46 > eocd.eocdOffset || zipBuffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER) {
      throw makeError("invalid-archive-zip");
    }

    const flags = zipBuffer.readUInt16LE(offset + 8);
    const compression = zipBuffer.readUInt16LE(offset + 10);
    const crc = zipBuffer.readUInt32LE(offset + 16);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(offset + 24);
    const nameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const diskStart = zipBuffer.readUInt16LE(offset + 34);
    const localOffset = zipBuffer.readUInt32LE(offset + 42);

    validateZipFlags(flags);
    validateCompression(compression, compressedSize, uncompressedSize);
    if (diskStart !== 0 || localOffset === MAX_UINT32) {
      throw makeError("archive-zip64-unsupported");
    }

    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const nextOffset = nameEnd + extraLength + commentLength;
    if (nameEnd > eocd.eocdOffset || nextOffset > eocd.eocdOffset) {
      throw makeError("invalid-archive-zip");
    }

    const entryPath = archiveManifest.assertSafeArchivePath(zipBuffer.slice(nameStart, nameEnd).toString("utf8"));
    if (seen.has(entryPath)) {
      throw makeError("duplicate-archive-entry", `duplicate-archive-entry: ${entryPath}`);
    }
    seen.add(entryPath);
    entries.push({
      compressedSize,
      compression,
      crc,
      entryPath,
      flags,
      localOffset,
      uncompressedSize
    });
    offset = nextOffset;
  }

  if (offset !== eocd.eocdOffset) {
    throw makeError("invalid-archive-zip");
  }
  return entries;
}

function readLocalEntry(zipBuffer, centralEntry) {
  const offset = centralEntry.localOffset;
  if (offset + 30 > zipBuffer.length || zipBuffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER) {
    throw makeError("invalid-archive-zip");
  }

  const flags = zipBuffer.readUInt16LE(offset + 6);
  const compression = zipBuffer.readUInt16LE(offset + 8);
  const crc = zipBuffer.readUInt32LE(offset + 14);
  const compressedSize = zipBuffer.readUInt32LE(offset + 18);
  const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
  const nameLength = zipBuffer.readUInt16LE(offset + 26);
  const extraLength = zipBuffer.readUInt16LE(offset + 28);
  validateZipFlags(flags);
  validateCompression(compression, compressedSize, uncompressedSize);

  const nameStart = offset + 30;
  const nameEnd = nameStart + nameLength;
  const dataStart = nameEnd + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (nameEnd > zipBuffer.length || dataStart > zipBuffer.length || dataEnd > zipBuffer.length) {
    throw makeError("invalid-archive-zip");
  }

  const entryPath = archiveManifest.assertSafeArchivePath(zipBuffer.slice(nameStart, nameEnd).toString("utf8"));
  if (entryPath !== centralEntry.entryPath ||
    flags !== centralEntry.flags ||
    compression !== centralEntry.compression ||
    compressedSize !== centralEntry.compressedSize ||
    uncompressedSize !== centralEntry.uncompressedSize ||
    crc !== centralEntry.crc) {
    throw makeError("archive-zip-central-local-mismatch", `archive-zip-central-local-mismatch: ${centralEntry.entryPath}`);
  }

  const data = zipBuffer.slice(dataStart, dataEnd);
  if (crc32(data) !== crc) {
    throw makeError("archive-entry-crc-mismatch", `archive-entry-crc-mismatch: ${entryPath}`);
  }

  return {
    data,
    dataEnd,
    entryPath,
    uncompressedSize
  };
}

function parseZipEntries(zipBuffer, policy) {
  const eocd = findEndOfCentralDirectory(zipBuffer);
  const centralEntries = parseCentralDirectory(zipBuffer, eocd);
  const entries = new Map();
  let totalUncompressed = 0;
  let expectedLocalOffset = 0;

  centralEntries.slice().sort((a, b) => a.localOffset - b.localOffset).forEach((centralEntry) => {
    if (centralEntry.localOffset !== expectedLocalOffset) {
      throw makeError("invalid-archive-zip");
    }
    const local = readLocalEntry(zipBuffer, centralEntry);
    if (entries.has(local.entryPath)) {
      throw makeError("duplicate-archive-entry", `duplicate-archive-entry: ${local.entryPath}`);
    }
    entries.set(local.entryPath, local.data);
    totalUncompressed += local.uncompressedSize;
    expectedLocalOffset = local.dataEnd;
    validateZipPolicy(entries.size, totalUncompressed, policy);
  });

  if (expectedLocalOffset !== eocd.centralOffset) {
    throw makeError("invalid-archive-zip");
  }
  return entries;
}

function readArchiveZip(zip, options = {}) {
  const policy = archiveConfig.normalizeArchivePolicy(options.policy || {});
  const zipBuffer = toBuffer(zip);
  if (Number.isInteger(policy.limits.maxArchiveBytes) && policy.limits.maxArchiveBytes > 0 && zipBuffer.length > policy.limits.maxArchiveBytes) {
    throw makeError("archive-limit-exceeded", "archive-limit-exceeded: archiveBytes");
  }

  const entries = parseZipEntries(zipBuffer, policy);
  const manifestBuffer = entries.get("manifest.json");
  if (!manifestBuffer) {
    throw makeError("missing-archive-manifest", "missing-archive-manifest");
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestBuffer.toString("utf8"));
  } catch (err) {
    throw makeError("invalid-archive-manifest-json");
  }

  entries.delete("manifest.json");
  const files = new Map(Array.from(entries.entries()).sort((a, b) => compareText(a[0], b[0])));
  const validation = archiveManifest.validateManifest(manifest, { files, policy });
  return {
    manifest: validation.manifest,
    files
  };
}

module.exports = {
  createArchiveZip,
  readArchiveZip
};
