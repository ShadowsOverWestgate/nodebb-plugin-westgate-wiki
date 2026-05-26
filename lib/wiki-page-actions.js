"use strict";

const serializer = require("./serializer");
const wikiTopicMutations = require("./wiki-topic-mutations");

function getNodebb() {
  return {
    helpers: require.main.require("./src/controllers/helpers"),
    posts: require.main.require("./src/posts"),
    privileges: require.main.require("./src/privileges"),
    topics: require.main.require("./src/topics")
  };
}

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeTitleSegment(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function splitTitlePath(value) {
  return serializer.getTitlePath(String(value || "")).map(normalizeTitleSegment).filter(Boolean);
}

function titleFromPath(parts) {
  return parts.map(normalizeTitleSegment).filter(Boolean).join(" :: ");
}

function buildSubpageDraftTitle(pageTitlePath, fallbackTitle) {
  const parts = Array.isArray(pageTitlePath) && pageTitlePath.length ?
    pageTitlePath.map(normalizeTitleSegment).filter(Boolean) :
    splitTitlePath(fallbackTitle);
  return titleFromPath(parts.concat("Subpage"));
}

function normalizeMovePayload(payload) {
  const cid = asPositiveInt(payload && payload.cid);
  const titleInput = normalizeTitleSegment(payload && payload.title);
  const parentTitle = titleFromPath(splitTitlePath(payload && payload.parentTitle));
  const titleParts = splitTitlePath(titleInput);
  const titleLeaf = titleParts.length ? titleParts[titleParts.length - 1] : "";
  const title = parentTitle ? titleFromPath(splitTitlePath(parentTitle).concat(titleLeaf)) : titleFromPath(titleParts);

  return {
    cid,
    title,
    parentTitle,
    titleLeaf
  };
}

function getGeneratedPageValidationOptions(wikiPageValidation, content, topic, omitTid) {
  const pageSlug = content == null ? "" : wikiPageValidation.getTopdataWikiPageSlug(content);

  return {
    omitTid,
    pageSlug
  };
}

async function getCanonicalWikiPathInfo(wikiPaths, topic, uid) {
  const canonicalPath = await wikiPaths.getCanonicalPagePath(topic, { uid });
  return {
    canonicalPath: canonicalPath || "",
    wikiPath: canonicalPath ? `/wiki/${canonicalPath}` : ""
  };
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

async function rollbackPostEdit({ posts, pid, uid, title, oldSource, attemptedSource, req }) {
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

async function verifyPostStorage(posts, pid, expectedSource) {
  if (typeof posts.getPostFields !== "function") {
    return false;
  }
  const stored = await posts.getPostFields(pid, ["content", "sourceContent"]);
  return !!(
    stored &&
    String(stored.content || "") === expectedSource &&
    String(stored.sourceContent || "") === expectedSource
  );
}

async function assertCanManageWikiPage(tid, uid) {
  const topicService = require("./topic-service");
  const wikiPage = await topicService.getWikiPage(tid, uid);
  if (wikiPage.status === "forbidden") {
    const err = new Error("[[error:no-privileges]]");
    err.statusCode = 403;
    throw err;
  }
  if (wikiPage.status !== "ok") {
    const err = new Error("[[error:not-found]]");
    err.statusCode = 404;
    throw err;
  }
  if (!wikiPage.canEditWikiPage) {
    const err = new Error("[[error:no-privileges]]");
    err.statusCode = 403;
    throw err;
  }
  return wikiPage;
}

async function assertCanMoveToNamespace(cid, uid, currentCid) {
  const { privileges } = getNodebb();
  const wikiPaths = require("./wiki-paths");
  const namespace = await wikiPaths.getNamespaceEntry(cid);
  if (namespace.status !== "ok") {
    const err = new Error("[[error:not-found]]");
    err.statusCode = 404;
    throw err;
  }

  const categoryPrivileges = await privileges.categories.get(cid, uid);
  if (!categoryPrivileges || !categoryPrivileges["topics:read"]) {
    const err = new Error("[[error:no-privileges]]");
    err.statusCode = 403;
    throw err;
  }

  if (parseInt(cid, 10) !== parseInt(currentCid, 10) && !categoryPrivileges["topics:create"]) {
    const err = new Error("[[error:no-privileges]]");
    err.statusCode = 403;
    throw err;
  }

  return namespace;
}

async function moveWikiPage(req, res) {
  const { helpers, posts, topics } = getNodebb();
  const tid = asPositiveInt(req.body && req.body.tid);
  const payload = normalizeMovePayload(req.body || {});
  if (!tid || !payload.cid || !payload.title) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  try {
    return await wikiTopicMutations.withTopicMutationGuard(tid, async () => {
      wikiTopicMutations.markManagedMutation(req);
      const wikiDirectory = require("./wiki-directory-service");
      const wikiPageValidation = require("./wiki-page-validation");
      const wikiPaths = require("./wiki-paths");
      const wikiRevisions = require("./wiki-revisions");
      const wikiPage = await assertCanManageWikiPage(tid, req.uid);
      const currentCid = asPositiveInt(wikiPage.topic && wikiPage.topic.cid);
      await assertCanMoveToNamespace(payload.cid, req.uid, currentCid);

      const validation = await wikiPaths.validateCanonicalPagePlacement({
        cid: payload.cid,
        title: payload.title,
        omitTid: tid
      });
      if (wikiPageValidation.isBlockingResult(validation)) {
        return helpers.formatApiResponse(409, res, new Error(wikiPageValidation.getValidationMessage(validation)));
      }

      const mainPid = asPositiveInt(wikiPage.topic && wikiPage.topic.mainPid);
      if (!mainPid) {
        return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
      }

      const currentTitle = String(wikiPage.topic.titleRaw || wikiPage.topic.title || "").trim();
      const changed = payload.cid !== currentCid || payload.title !== currentTitle;
      const source = changed ? await getPostSource(posts, mainPid) : "";
      const currentPathInfo = changed ? await getCanonicalWikiPathInfo(wikiPaths, wikiPage.topic, req.uid) : { canonicalPath: "", wikiPath: "" };
      let titleEditSource = source;
      let revisionPayload = null;

      if (changed) {
        await wikiRevisions.ensureRevisionBaseline({
          tid,
          pid: mainPid,
          cid: currentCid,
          uid: req.uid,
          title: currentTitle,
          source,
          canonicalPath: currentPathInfo.canonicalPath,
          wikiPath: currentPathInfo.wikiPath
        });
        revisionPayload = {
          tid,
          pid: mainPid,
          cid: payload.cid,
          uid: req.uid,
          action: "move",
          title: payload.title,
          oldSource: source,
          newSource: source,
          canonicalPath: "",
          wikiPath: ""
        };
        await wikiRevisions.assertCanAppendRevision(revisionPayload);
      }

      if (payload.title !== currentTitle) {
        const postData = await posts.getPostData(mainPid);
        if (!postData) {
          return helpers.formatApiResponse(404, res, new Error("[[error:no-post]]"));
        }
        titleEditSource = postData.sourceContent || postData.content || "";
      }

      let moved = false;
      let titleEdited = false;
      try {
        if (payload.cid !== currentCid) {
          await topics.tools.move(tid, { cid: payload.cid, uid: req.uid });
          moved = true;
        }

        if (payload.title !== currentTitle) {
          await posts.edit(wikiTopicMutations.managedPostEditPayload({
            pid: mainPid,
            uid: req.uid,
            title: payload.title,
            content: titleEditSource,
            sourceContent: titleEditSource
          }, req));
          titleEdited = true;
        }

        wikiDirectory.invalidateNamespace(currentCid);
        wikiDirectory.invalidateNamespace(payload.cid);
        wikiPaths.invalidateWikiTreeIndex({ reason: "wiki-page-moved" });
        const updatedTopic = await topics.getTopicData(tid);
        const pathInfo = await getCanonicalWikiPathInfo(wikiPaths, updatedTopic, req.uid);

        if (changed) {
          await wikiRevisions.appendRevision({
            ...revisionPayload,
            canonicalPath: pathInfo.canonicalPath,
            wikiPath: pathInfo.wikiPath
          });
        }

        return helpers.formatApiResponse(200, res, {
          tid,
          cid: payload.cid,
          title: payload.title,
          wikiPath: pathInfo.wikiPath
        });
      } catch (err) {
        if (changed) {
          try {
            if (titleEdited) {
              const rollback = await rollbackPostEdit({
                posts,
                pid: mainPid,
                uid: req.uid,
                title: currentTitle,
                oldSource: source,
                attemptedSource: source,
                req
              });
              if (!rollback.rolledBack) {
                err.rollbackSkipped = "post-source-changed";
              }
            }
            if (moved) {
              await topics.tools.move(tid, { cid: currentCid, uid: req.uid });
            }
            wikiDirectory.invalidateNamespace(currentCid);
            wikiDirectory.invalidateNamespace(payload.cid);
            wikiPaths.invalidateWikiTreeIndex({ reason: "wiki-page-move-rolled-back" });
          } catch (rollbackErr) {
            err.rollbackError = rollbackErr;
          }
        }
        throw err;
      }
    });
  } catch (err) {
    return helpers.formatApiResponse(err.statusCode || 500, res, err);
  }
}

async function saveWikiPage(req, res) {
  const { helpers, posts, topics } = getNodebb();
  const tid = asPositiveInt(req.body && req.body.tid);
  const pid = asPositiveInt(req.body && req.body.pid);
  const title = normalizeTitleSegment(req.body && req.body.title);
  const content = String(req.body && req.body.content || "").trim();
  if (!tid || !title || !content) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  try {
    return await wikiTopicMutations.withTopicMutationGuard(tid, async () => {
      wikiTopicMutations.markManagedMutation(req);
      const wikiDirectory = require("./wiki-directory-service");
      const wikiEditLocks = require("./wiki-edit-locks");
      const wikiPageValidation = require("./wiki-page-validation");
      const wikiPaths = require("./wiki-paths");
      const wikiRevisions = require("./wiki-revisions");
      const wikiPage = await assertCanManageWikiPage(tid, req.uid);
      const currentCid = asPositiveInt(wikiPage.topic && wikiPage.topic.cid);
      const mainPid = asPositiveInt(wikiPage.topic && wikiPage.topic.mainPid);
      if (!mainPid || (pid && pid !== mainPid)) {
        return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
      }

      const validation = await wikiPaths.validateCanonicalPagePlacement({
        cid: currentCid,
        title,
        omitTid: tid
      });
      if (wikiPageValidation.isBlockingResult(validation)) {
        return helpers.formatApiResponse(409, res, new Error(wikiPageValidation.getValidationMessage(validation)));
      }

      const token = String(
        (req.body && req.body.wikiEditLockToken) ||
        (req.query && req.query.wikiEditLockToken) ||
        ""
      );
      const lockResult = await wikiEditLocks.assertSaveLock(tid, req.uid, token);
      if (lockResult.status !== "ok") {
        return helpers.formatApiResponse(409, res, new Error(wikiEditLocks.getStatusMessage(lockResult)));
      }

      const sanitized = wikiPageValidation.sanitizeAndValidateWikiMainBody(content);
      const oldSource = await getPostSource(posts, mainPid);
      const currentPathInfo = await getCanonicalWikiPathInfo(wikiPaths, wikiPage.topic, req.uid);
      await wikiRevisions.ensureRevisionBaseline({
        tid,
        pid: mainPid,
        cid: currentCid,
        uid: req.uid,
        title,
        source: oldSource,
        canonicalPath: currentPathInfo.canonicalPath,
        wikiPath: currentPathInfo.wikiPath
      });
      const revisionPayload = {
        tid,
        pid: mainPid,
        cid: currentCid,
        uid: req.uid,
        action: "edit",
        title,
        oldSource,
        newSource: sanitized,
        canonicalPath: currentPathInfo.canonicalPath,
        wikiPath: currentPathInfo.wikiPath
      };
      await wikiRevisions.assertCanAppendRevision(revisionPayload);

      await posts.edit(wikiTopicMutations.managedPostEditPayload({
        pid: mainPid,
        uid: req.uid,
        title,
        content: sanitized,
        sourceContent: sanitized,
        wikiEditLockToken: token
      }, req));

      let storageVerified = false;
      try {
        storageVerified = await verifyPostStorage(posts, mainPid, sanitized);
      } catch (err) {
        try {
          await rollbackPostEdit({
            posts,
            pid: mainPid,
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
        const err = new Error("wiki-save-storage-unverified");
        try {
          await rollbackPostEdit({
            posts,
            pid: mainPid,
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

      let revision;
      try {
        revision = await wikiRevisions.appendRevision(revisionPayload);
      } catch (err) {
        try {
          const rollback = await rollbackPostEdit({
            posts,
            pid: mainPid,
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
        wikiDirectory.invalidateNamespace(currentCid);
        wikiPaths.invalidateWikiTreeIndex({ reason: "wiki-page-save-rolled-back" });
        throw err;
      }

      wikiDirectory.invalidateNamespace(currentCid);
      wikiPaths.invalidateWikiTreeIndex({ reason: "wiki-page-saved" });
      const updatedTopic = await topics.getTopicData(tid);
      const pathInfo = await getCanonicalWikiPathInfo(wikiPaths, updatedTopic, req.uid);

      return helpers.formatApiResponse(200, res, {
        tid,
        pid: mainPid,
        title,
        revisionId: revision.revisionId,
        wikiPath: pathInfo.wikiPath,
        content: sanitized,
        sourceContent: sanitized,
        topic: {
          tid,
          slug: updatedTopic && updatedTopic.slug
        }
      });
    });
  } catch (err) {
    return helpers.formatApiResponse(err.statusCode || 500, res, err);
  }
}

async function changeWikiPageOwner(req, res) {
  const { helpers, posts, user } = {
    ...getNodebb(),
    user: require.main.require("./src/user")
  };
  const tid = asPositiveInt(req.body && req.body.tid);
  const uid = asPositiveInt(req.body && req.body.uid);
  if (!tid || !uid) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  try {
    const wikiPage = await assertCanManageWikiPage(tid, req.uid);
    const mainPid = asPositiveInt(wikiPage.topic && wikiPage.topic.mainPid);
    if (!mainPid) {
      return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
    }
    await posts.changeOwner([mainPid], uid);
    const owner = await user.getUserFields(uid, ["uid", "username", "userslug", "displayname"]);

    return helpers.formatApiResponse(200, res, {
      tid,
      uid,
      owner
    });
  } catch (err) {
    return helpers.formatApiResponse(err.statusCode || 500, res, err);
  }
}

module.exports = {
  buildSubpageDraftTitle,
  changeWikiPageOwner,
  getGeneratedPageValidationOptions,
  moveWikiPage,
  normalizeMovePayload,
  saveWikiPage
};
