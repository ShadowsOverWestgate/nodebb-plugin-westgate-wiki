"use strict";

const crypto = require("node:crypto");

const { PORTABLE_TOPIC_FIELD } = require("./wiki-archive-schema");

const PAGE_ARCHIVE_ID_PATTERN = /^wgap_[0-9a-f]{32}$/;

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function isValidPageArchiveId(value) {
  return PAGE_ARCHIVE_ID_PATTERN.test(String(value || ""));
}

function assertValidPageArchiveId(value) {
  if (!isValidPageArchiveId(value)) {
    throw new Error("invalid-archive-page-id");
  }
  return String(value);
}

function assertNotPublicPathAuthority(value) {
  const normalized = String(value || "").trim();
  if (normalized && !isValidPageArchiveId(normalized)) {
    throw new Error("archive-id-not-public-path-authority");
  }
  return true;
}

function createPageArchiveId() {
  return `wgap_${crypto.randomBytes(16).toString("hex")}`;
}

function getTopicApi(customTopics) {
  if (customTopics) {
    return customTopics;
  }
  return require.main.require("./src/topics");
}

function normalizeCandidate(row) {
  return {
    ...(row || {}),
    tid: toPositiveInt(row && row.tid),
    canonicalPath: String(row && row.canonicalPath || "").trim(),
    archivePageId: String(
      row && (row.archivePageId || row[PORTABLE_TOPIC_FIELD] || row.westgateWikiArchivePageId) || ""
    ).trim()
  };
}

function sortedTids(rows) {
  return rows.map((row) => row.tid).filter(Boolean).sort((a, b) => a - b);
}

function makeMatch(status, row) {
  return {
    status,
    tid: row.tid,
    match: {
      tid: row.tid,
      archivePageId: row.archivePageId || "",
      canonicalPath: row.canonicalPath || ""
    }
  };
}

function matchDestinationPage(sourcePage = {}, destinationRows = []) {
  const archivePageId = String(sourcePage.archivePageId || "").trim();
  const canonicalPath = String(sourcePage.canonicalPath || "").trim();
  if (archivePageId) {
    assertValidPageArchiveId(archivePageId);
  }

  const candidates = (Array.isArray(destinationRows) ? destinationRows : [])
    .map(normalizeCandidate)
    .filter((row) => row.tid);
  const archiveIdMatches = archivePageId ?
    candidates.filter((row) => row.archivePageId === archivePageId) :
    [];
  const canonicalPathMatches = canonicalPath ?
    candidates.filter((row) => row.canonicalPath === canonicalPath) :
    [];

  if (archiveIdMatches.length > 1) {
    return {
      status: "ambiguous-archive-id",
      archivePageId,
      tids: sortedTids(archiveIdMatches)
    };
  }

  if (archiveIdMatches.length === 1) {
    const idMatch = archiveIdMatches[0];
    const differentPathMatches = canonicalPathMatches.filter((row) => row.tid !== idMatch.tid);
    if (differentPathMatches.length) {
      return {
        status: "conflict-id-path-disagreement",
        archivePageId,
        canonicalPath,
        archiveIdTid: idMatch.tid,
        canonicalPathTid: differentPathMatches[0].tid,
        canonicalPathTids: sortedTids(differentPathMatches)
      };
    }
    return makeMatch("matched-archive-id", idMatch);
  }

  if (canonicalPathMatches.length > 1) {
    return {
      status: "ambiguous-canonical-path",
      canonicalPath,
      tids: sortedTids(canonicalPathMatches)
    };
  }

  if (canonicalPathMatches.length === 1) {
    return makeMatch("matched-canonical-path", canonicalPathMatches[0]);
  }

  return {
    status: "not-found",
    archivePageId,
    canonicalPath
  };
}

async function getStoredPageArchiveId(tid, options = {}) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    throw new Error("invalid-tid");
  }

  const topics = getTopicApi(options.topics);
  if (!topics || typeof topics.getTopicField !== "function") {
    throw new Error("NodeBB topics.getTopicField API unavailable");
  }

  const value = String(await topics.getTopicField(parsedTid, PORTABLE_TOPIC_FIELD) || "").trim();
  if (!value) {
    return "";
  }
  return assertValidPageArchiveId(value);
}

async function setPageArchiveId(tid, archivePageId, options = {}) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    throw new Error("invalid-tid");
  }

  const normalizedId = assertValidPageArchiveId(archivePageId);
  const topics = getTopicApi(options.topics);
  if (!topics || typeof topics.setTopicField !== "function") {
    throw new Error("NodeBB topics.setTopicField API unavailable");
  }

  await topics.setTopicField(parsedTid, PORTABLE_TOPIC_FIELD, normalizedId);
  return normalizedId;
}

async function getOrCreatePageArchiveId(tid, options = {}) {
  const existing = await getStoredPageArchiveId(tid, options);
  if (existing) {
    return existing;
  }

  const idFactory = typeof options.idFactory === "function" ? options.idFactory : createPageArchiveId;
  const next = assertValidPageArchiveId(idFactory());
  await setPageArchiveId(tid, next, options);
  return next;
}

module.exports = {
  PAGE_ARCHIVE_ID_PATTERN,
  PORTABLE_TOPIC_FIELD,
  assertNotPublicPathAuthority,
  assertValidPageArchiveId,
  createPageArchiveId,
  getOrCreatePageArchiveId,
  getStoredPageArchiveId,
  isValidPageArchiveId,
  matchDestinationPage,
  setPageArchiveId
};
