"use strict";

const wikiTopicMutations = require("./wiki-topic-mutations");

function getNodebb() {
  return {
    helpers: require.main.require("./src/controllers/helpers"),
    posts: require.main.require("./src/posts")
  };
}

function asPositiveInt(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && Number.isSafeInteger(value) && value > 0 ? value : 0;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

function getTid(req) {
  return asPositiveInt(
    (req.params && req.params.tid) ||
    (req.body && req.body.tid) ||
    (req.query && req.query.tid)
  );
}

function getRevisionId(req, key = "revisionId") {
  return String(
    (req.params && req.params[key]) ||
    (req.body && req.body[key]) ||
    (req.query && req.query[key]) ||
    ""
  ).trim();
}

function getTitle(topic) {
  return String(topic && (topic.titleRaw || topic.title) || "").trim();
}

function summarizeRevision(revision) {
  if (!revision) {
    return null;
  }
  const { patch, checkpointSource, ...summary } = revision;
  return summary;
}

function errorStatus(err) {
  if (!err) {
    return 500;
  }
  if (err.statusCode) {
    return err.statusCode;
  }
  if ([
    "invalid-wiki-revision-input",
    "revision-checkpoint-missing",
    "revision-hash-mismatch",
    "revision-not-found",
    "revision-parent-hash-mismatch",
    "revision-parent-not-found",
    "revision-parent-not-latest",
    "revision-patch-apply-failed"
  ].includes(err.message || "")) {
    return 400;
  }
  if (/not-found|no-topic|no-post/.test(err.message || "")) {
    return 404;
  }
  if (/not-tombstoned|tombstone-incomplete|tombstone-stale|parent-|revision-purge-active/.test(err.message || "")) {
    return 409;
  }
  return 500;
}

function apiError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function getPostSource(posts, pid) {
  if (typeof posts.getPostFields === "function") {
    const post = await posts.getPostFields(pid, ["content", "sourceContent"]);
    return post ? String(post.sourceContent || post.content || "") : "";
  }
  if (typeof posts.getPostData === "function") {
    const post = await posts.getPostData(pid);
    return post ? String(post.sourceContent || post.content || "") : "";
  }
  return "";
}

async function rollbackRestoreEdit({ posts, pid, uid, title, oldSource, attemptedSource, req }) {
  const latestSource = await getPostSource(posts, pid);
  if (latestSource === attemptedSource) {
    await posts.edit(wikiTopicMutations.managedPostEditPayload({
      pid,
      uid,
      title,
      content: oldSource,
      sourceContent: oldSource
    }, req));
    return { rolledBack: true };
  }
  return { rolledBack: false };
}

async function verifyRestoredPostStorage(posts, pid, expectedSource) {
  if (typeof posts.getPostFields !== "function") {
    return false;
  }

  const stored = await posts.getPostFields(pid, ["content", "sourceContent"]);
  if (
    stored &&
    String(stored.content || "") === expectedSource &&
    String(stored.sourceContent || "") === expectedSource
  ) {
    return true;
  }

  if (typeof posts.setPostFields !== "function") {
    return false;
  }

  await posts.setPostFields(pid, {
    content: expectedSource,
    sourceContent: expectedSource
  });
  if (typeof posts.clearCachedPost === "function") {
    posts.clearCachedPost(String(pid));
  }
  return true;
}

async function repairTombstone(wikiTombstones, tid, tombstone) {
  if (!tombstone) {
    return;
  }
  await wikiTombstones.setTombstone({
    tid,
    uid: tombstone.uid,
    revisionId: tombstone.revisionId,
    reason: tombstone.reason,
    timestamp: tombstone.at
  });
}

function getLockToken(req) {
  return String(
    (req.body && req.body.wikiEditLockToken) ||
    (req.query && req.query.wikiEditLockToken) ||
    ""
  );
}

function isCompleteTombstone(tombstone) {
  return !!(
    tombstone &&
    tombstone.tombstoned &&
    tombstone.at &&
    tombstone.uid &&
    tombstone.revisionId
  );
}

function isTombstoneRevisionRecord(record, revisionId) {
  if (!record || String(record.revisionId || "") !== String(revisionId || "")) {
    return false;
  }
  return record.action === "tombstone";
}

async function loadWikiPageForHistory(tid, uid) {
  if (!tid) {
    throw apiError("[[error:invalid-data]]", 400);
  }

  const topicService = require("../read/topic-service");
  const page = await topicService.getWikiPage(tid, uid, { includeTombstoned: true });
  if (page.status === "forbidden") {
    throw apiError("[[error:no-privileges]]", 403);
  }
  if (page.status !== "ok") {
    throw apiError("[[error:not-found]]", 404);
  }
  return page;
}

async function assertHistoryPermission(page, uid) {
  const wikiRevisionPermissions = require("./wiki-revision-permissions");
  const cid = asPositiveInt(page.topic && page.topic.cid);
  if (!cid || !(await wikiRevisionPermissions.canViewHistory(cid, uid))) {
    throw apiError("[[error:no-privileges]]", 403);
  }
}

async function assertRestorePermission(page, uid) {
  const wikiRevisionPermissions = require("./wiki-revision-permissions");
  const cid = asPositiveInt(page.topic && page.topic.cid);
  if (!cid || !(await wikiRevisionPermissions.canRestore(cid, uid))) {
    throw apiError("[[error:no-privileges]]", 403);
  }
}

async function assertHardPurgePermission(page, uid) {
  const wikiRevisionPermissions = require("./wiki-revision-permissions");
  const cid = asPositiveInt(page.topic && page.topic.cid);
  if (!cid || !(await wikiRevisionPermissions.canHardPurge(cid, uid))) {
    throw apiError("[[error:no-privileges]]", 403);
  }
}

function assertTombstonePermission(page) {
  if (Object.prototype.hasOwnProperty.call(page, "canDeleteWikiPage")) {
    if (page.canDeleteWikiPage) {
      return;
    }
  } else if (page.topicPrivileges && page.topicPrivileges["topics:delete"]) {
    return;
  }

  throw apiError("[[error:no-privileges]]", 403);
}

function invalidateWikiPageCaches(cid, reason) {
  const wikiDirectory = require("../tree/wiki-directory-service");
  const wikiPaths = require("../tree/wiki-paths");
  wikiDirectory.invalidateNamespace(cid);
  wikiPaths.invalidateWikiTreeIndex({ reason });
}

async function getCanonicalPathInfo(wikiPaths, topic, uid) {
  const canonicalPath = await wikiPaths.getCanonicalPagePath(topic, { uid });
  return {
    canonicalPath: canonicalPath || "",
    wikiPath: canonicalPath ? `/wiki/${canonicalPath}` : ""
  };
}

async function listRevisions(req, res) {
  const { helpers } = getNodebb();
  const tid = getTid(req);

  try {
    const wikiRevisions = require("./wiki-revisions");
    const page = await loadWikiPageForHistory(tid, req.uid);
    await assertHistoryPermission(page, req.uid);
    const revisions = await wikiRevisions.listRevisionSummaries(tid);
    return helpers.formatApiResponse(200, res, { tid, revisions });
  } catch (err) {
    return helpers.formatApiResponse(errorStatus(err), res, err);
  }
}

async function getRevision(req, res) {
  const { helpers } = getNodebb();
  const tid = getTid(req);
  const revisionId = getRevisionId(req);
  if (!revisionId) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  try {
    const wikiHtmlSanitizer = require("../content/wiki-html-sanitizer");
    const wikiRevisions = require("./wiki-revisions");
    const page = await loadWikiPageForHistory(tid, req.uid);
    await assertHistoryPermission(page, req.uid);
    const result = await wikiRevisions.reconstructRevision(tid, revisionId);
    return helpers.formatApiResponse(200, res, {
      tid,
      revision: summarizeRevision(result.revision),
      source: result.source,
      previewHtml: wikiHtmlSanitizer.renderReadOnlyWikiHtml(result.source)
    });
  } catch (err) {
    return helpers.formatApiResponse(errorStatus(err), res, err);
  }
}

async function diffRevisions(req, res) {
  const { helpers } = getNodebb();
  const tid = getTid(req);
  const fromRevisionId = getRevisionId(req, "fromRevisionId");
  const toRevisionId = getRevisionId(req, "toRevisionId");
  if (!fromRevisionId || !toRevisionId) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  try {
    const wikiRevisions = require("./wiki-revisions");
    const page = await loadWikiPageForHistory(tid, req.uid);
    await assertHistoryPermission(page, req.uid);
    const from = await wikiRevisions.reconstructRevision(tid, fromRevisionId);
    const to = await wikiRevisions.reconstructRevision(tid, toRevisionId);
    return helpers.formatApiResponse(200, res, {
      tid,
      fromRevision: summarizeRevision(from.revision),
      toRevision: summarizeRevision(to.revision),
      diff: wikiRevisions.compareSources(from.source, to.source)
    });
  } catch (err) {
    return helpers.formatApiResponse(errorStatus(err), res, err);
  }
}

async function restoreRevision(req, res) {
  const { helpers, posts } = getNodebb();
  const tid = getTid(req);
  const revisionId = getRevisionId(req);
  if (!revisionId) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  try {
    return await wikiTopicMutations.withTopicMutationGuard(tid, async () => {
      wikiTopicMutations.markManagedMutation(req);
      const wikiEditLocks = require("./wiki-edit-locks");
      const wikiPageValidation = require("./wiki-page-validation");
      const wikiPaths = require("../tree/wiki-paths");
      const wikiRevisions = require("./wiki-revisions");
      const wikiTombstones = require("./wiki-tombstones");
      const page = await loadWikiPageForHistory(tid, req.uid);
      await assertRestorePermission(page, req.uid);

      const topic = page.topic || {};
      const cid = asPositiveInt(topic.cid);
      const pid = asPositiveInt(topic.mainPid);
      if (!cid || !pid) {
        return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
      }

      const token = getLockToken(req);
      const lockResult = await wikiEditLocks.assertSaveLock(tid, req.uid, token);
      if (lockResult.status !== "ok") {
        return helpers.formatApiResponse(409, res, new Error(wikiEditLocks.getStatusMessage(lockResult)));
      }

      const oldSource = await getPostSource(posts, pid);
      const restored = await wikiRevisions.reconstructRevision(tid, revisionId);
      const sanitized = wikiPageValidation.sanitizeAndValidateWikiMainBody(restored.source);
      const title = getTitle(topic);
      const tombstone = await wikiTombstones.getTombstone(tid);
      const placement = await wikiPaths.validateCanonicalPagePlacement({ cid, title, omitTid: tid });
      if (wikiPageValidation.isBlockingResult(placement)) {
        return helpers.formatApiResponse(409, res, new Error(wikiPageValidation.getValidationMessage(placement)));
      }
      const revisionPayload = {
        tid,
        pid,
        cid,
        uid: req.uid,
        action: "restore",
        title,
        oldSource,
        newSource: sanitized,
        restoreSourceRevisionId: revisionId
      };

      await wikiRevisions.assertCanAppendRevision(revisionPayload);

      await posts.edit(wikiTopicMutations.managedPostEditPayload({
        pid,
        uid: req.uid,
        title,
        content: sanitized,
        sourceContent: sanitized
      }, req));

      let storageVerified = false;
      try {
        storageVerified = await verifyRestoredPostStorage(posts, pid, sanitized);
      } catch (err) {
        try {
          await rollbackRestoreEdit({
            posts,
            pid,
            uid: req.uid,
            title,
            oldSource,
            attemptedSource: sanitized,
            req
          });
        } catch (rollbackErr) {
          err.rollbackError = rollbackErr;
        }
        throw err;
      }
      if (!storageVerified) {
        const err = new Error("wiki-restore-storage-unverified");
        try {
          await rollbackRestoreEdit({
            posts,
            pid,
            uid: req.uid,
            title,
            oldSource,
            attemptedSource: sanitized,
            req
          });
        } catch (rollbackErr) {
          err.rollbackError = rollbackErr;
        }
        throw err;
      }

      let tombstoneCleared = false;
      if (tombstone) {
        let clearResult;
        try {
          clearResult = await wikiTombstones.clearTombstoneIfRevision(tid, tombstone.revisionId);
        } catch (err) {
          try {
            await rollbackRestoreEdit({
              posts,
              pid,
              uid: req.uid,
              title,
              oldSource,
              attemptedSource: sanitized,
              req
            });
          } catch (rollbackErr) {
            err.rollbackError = rollbackErr;
          }
          try {
            await repairTombstone(wikiTombstones, tid, tombstone);
          } catch (repairErr) {
            err.tombstoneRepairError = repairErr;
          }
          throw err;
        }
        if (!clearResult || !clearResult.matched || !clearResult.cleared) {
          try {
            await rollbackRestoreEdit({
              posts,
              pid,
              uid: req.uid,
              title,
              oldSource,
              attemptedSource: sanitized,
              req
            });
          } catch (rollbackErr) {
            const err = new Error("wiki-page-tombstone-stale");
            err.rollbackError = rollbackErr;
            throw err;
          }
          throw new Error("wiki-page-tombstone-stale");
        }
        tombstoneCleared = true;
      }

      let revision;
      try {
        revision = await wikiRevisions.appendRevision(revisionPayload);
      } catch (err) {
        try {
          const rollback = await rollbackRestoreEdit({
            posts,
            pid,
            uid: req.uid,
            title,
            oldSource,
            attemptedSource: sanitized,
            req
          });
          if (!rollback.rolledBack) {
            err.rollbackSkipped = "post-source-changed";
          }
        } catch (rollbackErr) {
          err.rollbackError = rollbackErr;
        }
        if (tombstoneCleared) {
          try {
            await repairTombstone(wikiTombstones, tid, tombstone);
          } catch (tombstoneRollbackErr) {
            err.tombstoneRollbackError = tombstoneRollbackErr;
          }
        }
        throw err;
      }

      invalidateWikiPageCaches(cid, "wiki-revision-restored");
      const pathInfo = await getCanonicalPathInfo(wikiPaths, topic, req.uid);

      return helpers.formatApiResponse(200, res, {
        ok: true,
        tid,
        revisionId: revision.revisionId,
        canonicalPath: pathInfo.canonicalPath,
        wikiPath: pathInfo.wikiPath
      });
    });
  } catch (err) {
    return helpers.formatApiResponse(errorStatus(err), res, err);
  }
}

async function tombstonePage(req, res) {
  const { helpers, posts } = getNodebb();
  const tid = getTid(req);

  try {
    return await wikiTopicMutations.withTopicMutationGuard(tid, async () => {
      wikiTopicMutations.markManagedMutation(req);
      const wikiRevisions = require("./wiki-revisions");
      const wikiTombstones = require("./wiki-tombstones");
      const wikiPaths = require("../tree/wiki-paths");
      const page = await loadWikiPageForHistory(tid, req.uid);
      assertTombstonePermission(page);

      const topic = page.topic || {};
      const cid = asPositiveInt(topic.cid);
      const pid = asPositiveInt(topic.mainPid);
      if (!cid || !pid) {
        return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
      }

      const reason = String(req.body && req.body.reason || req.body && req.body.tombstoneReason || "");
      const currentSource = await getPostSource(posts, pid);
      const pathInfo = await getCanonicalPathInfo(wikiPaths, topic, req.uid);
      await wikiRevisions.ensureRevisionBaseline({
        tid,
        pid,
        cid,
        uid: req.uid,
        title: getTitle(topic),
        source: currentSource,
        canonicalPath: pathInfo.canonicalPath,
        wikiPath: pathInfo.wikiPath
      });
      const timestamp = Date.now();
      const revisionId = wikiRevisions.createRevisionId({ tid, pid, cid, uid: req.uid, action: "tombstone", timestamp });
      const revisionPayload = {
        tid,
        pid,
        cid,
        uid: req.uid,
        action: "tombstone",
        title: getTitle(topic),
        oldSource: currentSource,
        newSource: currentSource,
        tombstoneReason: reason,
        revisionId,
        timestamp,
        canonicalPath: pathInfo.canonicalPath,
        wikiPath: pathInfo.wikiPath
      };

      await wikiRevisions.assertCanAppendRevision(revisionPayload);

      const previousTombstone = await wikiTombstones.getTombstone(tid);
      await wikiTombstones.setTombstone({
        tid,
        uid: req.uid,
        revisionId,
        reason,
        timestamp
      });

      let revision;
      try {
        revision = await wikiRevisions.appendRevision(revisionPayload);
      } catch (err) {
        if (previousTombstone) {
          try {
            const currentTombstone = await wikiTombstones.getTombstone(tid);
            if (currentTombstone && currentTombstone.revisionId === revisionId) {
              await wikiTombstones.setTombstone({
                tid,
                uid: previousTombstone.uid,
                revisionId: previousTombstone.revisionId,
                reason: previousTombstone.reason,
                timestamp: previousTombstone.at
              });
            }
          } catch (rollbackErr) {
            err.rollbackError = rollbackErr;
          }
        } else {
          try {
            await wikiTombstones.clearTombstoneIfRevision(tid, revisionId);
          } catch (rollbackErr) {
            err.rollbackError = rollbackErr;
          }
        }
        throw err;
      }
      invalidateWikiPageCaches(cid, "wiki-page-tombstoned");

      return helpers.formatApiResponse(200, res, {
        ok: true,
        tid,
        revisionId: revision.revisionId
      });
    });
  } catch (err) {
    return helpers.formatApiResponse(errorStatus(err), res, err);
  }
}

async function hardPurgePage(req, res) {
  const { helpers } = getNodebb();
  const tid = getTid(req);

  try {
    return await wikiTopicMutations.withTopicMutationGuard(tid, async () => {
      wikiTopicMutations.markManagedMutation(req);
      const wikiRevisions = require("./wiki-revisions");
      const wikiTombstones = require("./wiki-tombstones");
      async function recoverPurge(marker) {
        const requestUid = asPositiveInt(req.uid);
        const markerCid = asPositiveInt(marker && marker.cid);
        const wikiRevisionPermissions = require("./wiki-revision-permissions");
        if (!markerCid || !(await wikiRevisionPermissions.canHardPurge(markerCid, requestUid))) {
          throw apiError("[[error:no-privileges]]", 403);
        }
        await wikiRevisions.purgeRevisions(tid);
        await wikiRevisions.clearRevisionPurge(tid);
        invalidateWikiPageCaches(markerCid, "wiki-page-hard-purge-recovered");
        return helpers.formatApiResponse(200, res, { ok: true, tid, recovered: true });
      }

      const activePurge = await wikiRevisions.getRevisionPurge(tid);
      if (activePurge && activePurge.topicPurged) {
        return recoverPurge(activePurge);
      }

      let page;
      try {
        page = await loadWikiPageForHistory(tid, req.uid);
      } catch (err) {
        if (activePurge && errorStatus(err) === 404) {
          return recoverPurge(activePurge);
        }
        throw err;
      }
      await assertHardPurgePermission(page, req.uid);

      const tombstone = await wikiTombstones.getTombstone(tid);
      if (!isCompleteTombstone(tombstone)) {
        return helpers.formatApiResponse(409, res, new Error("wiki-page-not-tombstoned"));
      }

      const tombstoneRevision = await wikiRevisions.getRevisionRecord(tid, tombstone.revisionId);
      if (!isTombstoneRevisionRecord(tombstoneRevision, tombstone.revisionId)) {
        return helpers.formatApiResponse(409, res, new Error("wiki-page-tombstone-incomplete"));
      }

      const cid = asPositiveInt(page.topic && page.topic.cid);
      await wikiRevisions.beginRevisionPurge(tid, {
        uid: req.uid,
        cid,
        tombstoneRevisionId: tombstone.revisionId
      });
      let topicPurgeAttempted = false;
      try {
        const currentTombstone = await wikiTombstones.getTombstoneIfRevision(tid, tombstone.revisionId);
        if (!isCompleteTombstone(currentTombstone)) {
          throw new Error("wiki-page-tombstone-stale");
        }
        const finalTombstone = await wikiTombstones.getTombstoneIfRevision(tid, tombstone.revisionId);
        if (!isCompleteTombstone(finalTombstone)) {
          throw new Error("wiki-page-tombstone-stale");
        }

        topicPurgeAttempted = true;
        await wikiTombstones.hardPurgeCheckedTombstone(tid, req.uid, finalTombstone);
        await wikiRevisions.markRevisionPurgeTopicPurged(tid);
        await wikiRevisions.purgeRevisions(tid);
        await wikiRevisions.clearRevisionPurge(tid);
      } catch (err) {
        if (!topicPurgeAttempted) {
          await wikiRevisions.clearRevisionPurge(tid);
        }
        throw err;
      }
      invalidateWikiPageCaches(cid, "wiki-page-hard-purged");
      return helpers.formatApiResponse(200, res, { ok: true, tid });
    });
  } catch (err) {
    return helpers.formatApiResponse(errorStatus(err), res, err);
  }
}

// action:topic.post hook body — seeds the initial "create" revision for a new
// wiki page. Lives here (not in library.js) so the entrypoint stays wiring-only.
// Requires resolve at call time so tests can patch config/wiki-revisions.
// action:topic.post fires without being awaited, so a rejection here becomes an
// unhandled rejection (and drops the create-revision baseline silently). Log and
// swallow — the baseline self-heals on the next edit.
async function recordCreateRevision(data) {
  try {
    return await recordCreateRevisionImpl(data);
  } catch (err) {
    require.main.require("./src/winston").error(`[westgate-wiki] recordCreateRevision failed: ${err && err.stack || err}`);
    return data;
  }
}

async function recordCreateRevisionImpl(data) {
  if (!data) {
    return data;
  }

  const posts = require.main.require("./src/posts");
  const topics = require.main.require("./src/topics");
  const config = require("../core/config");
  const wikiRevisions = require("./wiki-revisions");
  const settings = await config.getSettings();
  const effectiveCategoryIds = Array.isArray(settings.effectiveCategoryIds) ? settings.effectiveCategoryIds : [];
  const post = data.post || data.postData || {};
  const topicInput = data.topic || data.topicData || {};
  const tid = parseInt(topicInput.tid || post.tid || data.tid, 10);
  if (!Number.isInteger(tid) || tid <= 0) {
    return data;
  }

  const topic = topicInput.cid && topicInput.mainPid ?
    topicInput :
    (await topics.getTopicData(tid) || topicInput);
  const cid = parseInt(topic && topic.cid, 10);
  if (!Number.isInteger(cid) || cid <= 0 || !effectiveCategoryIds.includes(cid)) {
    return data;
  }

  const mainPid = parseInt(topic && topic.mainPid, 10);
  const pid = parseInt(post.pid || data.pid || mainPid, 10);
  if (!Number.isInteger(mainPid) || mainPid <= 0 || !Number.isInteger(pid) || pid !== mainPid) {
    return data;
  }

  const uid = parseInt(data.uid || post.uid || topic.uid, 10);
  if (!Number.isInteger(uid) || uid <= 0) {
    return data;
  }

  if (await wikiRevisions.hasRevisions(tid)) {
    return data;
  }

  let source = String(post.sourceContent || post.content || "");
  if (!source && typeof posts.getPostFields === "function") {
    const stored = await posts.getPostFields(mainPid, ["content", "sourceContent"]);
    source = stored ? String(stored.sourceContent || stored.content || "") : "";
  }
  if (!source.trim()) {
    return data;
  }

  await wikiRevisions.appendRevision({
    tid,
    pid: mainPid,
    cid,
    uid,
    action: "create",
    title: String(topic.titleRaw || topic.title || ""),
    oldSource: "",
    newSource: source,
    canonicalPath: String(topic.canonicalPath || ""),
    wikiPath: String(topic.wikiPath || "")
  });

  return data;
}

module.exports = {
  diffRevisions,
  getRevision,
  hardPurgePage,
  listRevisions,
  recordCreateRevision,
  restoreRevision,
  tombstonePage
};
