"use strict";

const serializer = require("./serializer");

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
  const pageSlug = content == null ?
    String(topic && topic.westgateWikiPageSlug || "").trim() :
    wikiPageValidation.getTopdataWikiPageSlug(content);

  return {
    omitTid,
    pageSlug
  };
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
    const wikiDirectory = require("./wiki-directory-service");
    const wikiPageValidation = require("./wiki-page-validation");
    const wikiPaths = require("./wiki-paths");
    const wikiPage = await assertCanManageWikiPage(tid, req.uid);
    const currentCid = asPositiveInt(wikiPage.topic && wikiPage.topic.cid);
    await assertCanMoveToNamespace(payload.cid, req.uid, currentCid);

    const validation = await wikiPaths.validatePageTitlePath(
      payload.cid,
      payload.title,
      getGeneratedPageValidationOptions(wikiPageValidation, null, wikiPage.topic, tid)
    );
    if (wikiPageValidation.isBlockingResult(validation)) {
      return helpers.formatApiResponse(409, res, new Error(wikiPageValidation.getValidationMessage(validation)));
    }

    const mainPid = asPositiveInt(wikiPage.topic && wikiPage.topic.mainPid);
    if (!mainPid) {
      return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
    }

    if (payload.cid !== currentCid) {
      await topics.tools.move(tid, { cid: payload.cid, uid: req.uid });
    }

    const currentTitle = String(wikiPage.topic.titleRaw || wikiPage.topic.title || "").trim();
    if (payload.title !== currentTitle) {
      const postData = await posts.getPostData(mainPid);
      if (!postData) {
        return helpers.formatApiResponse(404, res, new Error("[[error:no-post]]"));
      }
      const content = postData.sourceContent || postData.content || "";
      await posts.edit({
        pid: mainPid,
        uid: req.uid,
        title: payload.title,
        content,
        sourceContent: content,
        req
      });
    }

    wikiDirectory.invalidateNamespace(currentCid);
    wikiDirectory.invalidateNamespace(payload.cid);
    const updatedTopic = await topics.getTopicData(tid);
    const wikiPath = await wikiPaths.getArticlePath(updatedTopic) || wikiPaths.getLegacyArticlePath(updatedTopic);

    return helpers.formatApiResponse(200, res, {
      tid,
      cid: payload.cid,
      title: payload.title,
      wikiPath
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
    const wikiDirectory = require("./wiki-directory-service");
    const wikiEditLocks = require("./wiki-edit-locks");
    const wikiPageValidation = require("./wiki-page-validation");
    const wikiPaths = require("./wiki-paths");
    const wikiPage = await assertCanManageWikiPage(tid, req.uid);
    const currentCid = asPositiveInt(wikiPage.topic && wikiPage.topic.cid);
    const mainPid = asPositiveInt(wikiPage.topic && wikiPage.topic.mainPid);
    if (!mainPid || (pid && pid !== mainPid)) {
      return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
    }

    const validation = await wikiPaths.validatePageTitlePath(
      currentCid,
      title,
      getGeneratedPageValidationOptions(wikiPageValidation, content, wikiPage.topic, tid)
    );
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
    await posts.edit({
      pid: mainPid,
      uid: req.uid,
      title,
      content: sanitized,
      sourceContent: sanitized,
      wikiEditLockToken: token,
      req
    });

    if (typeof posts.getPostFields === "function") {
      const stored = await posts.getPostFields(mainPid, ["content", "sourceContent"]);
      if (
        stored &&
        (String(stored.content || "") !== sanitized || String(stored.sourceContent || "") !== sanitized) &&
        typeof posts.setPostFields === "function"
      ) {
        await posts.setPostFields(mainPid, {
          content: sanitized,
          sourceContent: sanitized
        });
        if (typeof posts.clearCachedPost === "function") {
          posts.clearCachedPost(String(mainPid));
        }
      }
    }

    wikiDirectory.invalidateNamespace(currentCid);
    const updatedTopic = await topics.getTopicData(tid);
    const wikiPath = await wikiPaths.getArticlePath(updatedTopic) || wikiPaths.getLegacyArticlePath(updatedTopic);

    return helpers.formatApiResponse(200, res, {
      tid,
      pid: mainPid,
      title,
      wikiPath,
      content: sanitized,
      sourceContent: sanitized,
      topic: {
        tid,
        slug: updatedTopic && updatedTopic.slug
      }
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
