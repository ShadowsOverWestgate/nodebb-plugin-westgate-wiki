"use strict";

const MOVE_GUARD_MARKER = Symbol.for("westgateWikiNativeMoveGuard");

const wikiTopicMutations = require("./wiki-topic-mutations");

function getNodebb() {
  return {
    posts: require.main.require("./src/posts"),
    topics: require.main.require("./src/topics")
  };
}

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getBlockedPostMutationError() {
  return new Error("Use the wiki page actions to delete, restore, or purge wiki pages.");
}

function getBlockedMoveError() {
  return new Error("Use the wiki page actions to move wiki pages.");
}

async function getWikiCategoryIds() {
  const config = require("./config");
  const settings = await config.getSettings();
  return new Set((Array.isArray(settings.effectiveCategoryIds) ? settings.effectiveCategoryIds : [])
    .map(asPositiveInt)
    .filter(Boolean));
}

function getTopicCid(topic) {
  return asPositiveInt(topic && (topic.cid || (topic.topic && topic.topic.cid)));
}

function getTopicMainPid(topic) {
  return asPositiveInt(topic && (topic.mainPid || (topic.topic && topic.topic.mainPid)));
}

async function getTopicFields(tid) {
  const { topics } = getNodebb();
  if (!tid || !topics || typeof topics.getTopicFields !== "function") {
    return null;
  }
  return await topics.getTopicFields(tid, ["tid", "cid", "mainPid"]);
}

async function loadPostTopicForPid(pid) {
  const { posts } = getNodebb();
  if (!pid || !posts || typeof posts.getPostFields !== "function") {
    return null;
  }
  const post = await posts.getPostFields(pid, ["pid", "tid"]);
  const tid = asPositiveInt(post && post.tid);
  if (!tid) {
    return null;
  }
  return await getTopicFields(tid);
}

async function isWikiMainPost(post, wikiCategoryIds) {
  const pid = asPositiveInt(post && post.pid);
  if (!pid) {
    return false;
  }

  let topic = post && post.topic;
  if (!topic || !getTopicCid(topic) || !getTopicMainPid(topic)) {
    topic = await getTopicFields(post && post.tid);
  }
  if (!topic) {
    topic = await loadPostTopicForPid(pid);
  }

  const cid = getTopicCid(topic);
  const mainPid = getTopicMainPid(topic);
  return !!(cid && mainPid && wikiCategoryIds.has(cid) && mainPid === pid);
}

async function assertPostMutationAllowed(data, pid) {
  if (wikiTopicMutations.isManagedMutation(data)) {
    return;
  }
  const parsedPid = asPositiveInt(pid);
  if (!parsedPid) {
    return;
  }

  const wikiCategoryIds = await getWikiCategoryIds();
  if (!wikiCategoryIds.size) {
    return;
  }
  const topic = await loadPostTopicForPid(parsedPid);
  if (!topic) {
    return;
  }
  const cid = getTopicCid(topic);
  const mainPid = getTopicMainPid(topic);
  if (cid && mainPid && wikiCategoryIds.has(cid) && mainPid === parsedPid) {
    throw getBlockedPostMutationError();
  }
}

async function validatePostDelete(data) {
  await assertPostMutationAllowed(data, data && data.pid);
  return data;
}

async function validatePostRestore(data) {
  await assertPostMutationAllowed(data, data && data.pid);
  return data;
}

async function validatePostsPurge(data) {
  if (wikiTopicMutations.isManagedMutation(data)) {
    return data;
  }
  const posts = Array.isArray(data && data.posts) ? data.posts : [];
  if (!posts.length) {
    return data;
  }

  const wikiCategoryIds = await getWikiCategoryIds();
  if (!wikiCategoryIds.size) {
    return data;
  }
  for (const post of posts) {
    if (await isWikiMainPost(post, wikiCategoryIds)) {
      throw getBlockedPostMutationError();
    }
  }
  return data;
}

async function assertTopicMoveAllowed(tid, data) {
  if (wikiTopicMutations.isManagedMutation(data)) {
    return;
  }

  const topic = await getTopicFields(tid);
  if (!topic) {
    return;
  }

  const fromCid = getTopicCid(topic);
  const toCid = asPositiveInt(data && data.cid);
  if (!fromCid && !toCid) {
    return;
  }

  const wikiCategoryIds = await getWikiCategoryIds();
  if (wikiCategoryIds.has(fromCid) || wikiCategoryIds.has(toCid)) {
    throw getBlockedMoveError();
  }
}

function install() {
  const { topics } = getNodebb();
  if (!topics || !topics.tools || typeof topics.tools.move !== "function" || topics.tools.move[MOVE_GUARD_MARKER]) {
    return;
  }

  const originalMove = topics.tools.move;
  const guardedMove = async function guardedWikiTopicMove(tid, data) {
    await assertTopicMoveAllowed(tid, data);
    return await originalMove.apply(this, arguments);
  };
  Object.defineProperty(guardedMove, MOVE_GUARD_MARKER, {
    value: true
  });
  Object.defineProperty(guardedMove, "westgateWikiOriginalMove", {
    value: originalMove
  });
  topics.tools.move = guardedMove;
}

module.exports = {
  assertTopicMoveAllowed,
  install,
  validatePostDelete,
  validatePostRestore,
  validatePostsPurge
};
