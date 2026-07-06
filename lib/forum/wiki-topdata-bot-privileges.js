"use strict";

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

function hasTopdataManagedMarker(content) {
  const text = String(content || "");
  return text.includes("sow-topdata-wiki:page=") && text.includes("sow-topdata-wiki:managed:start");
}

async function isGeneratedWikiMainPost(pid) {
  const { posts, topics } = getNodebb();
  const post = await posts.getPostFields(pid, ["pid", "tid", "content", "sourceContent"]);
  const tid = asPositiveInt(post && post.tid);
  if (!tid) {
    return false;
  }

  const topic = await topics.getTopicFields(tid, ["tid", "cid", "mainPid"]);
  const cid = asPositiveInt(topic && topic.cid);
  const mainPid = asPositiveInt(topic && topic.mainPid);
  if (!cid || mainPid !== asPositiveInt(pid)) {
    return false;
  }

  const settings = await require("../core/config").getSettings();
  if (!settings.effectiveCategoryIds.includes(cid)) {
    return false;
  }

  return hasTopdataManagedMarker(post.sourceContent || post.content);
}

async function filterPostEditPrivilege(data) {
  if (!data || data.isOwner || data.isEditor || data.isMod || !data.edit || !asPositiveInt(data.pid)) {
    return data;
  }

  if (await isGeneratedWikiMainPost(data.pid)) {
    data.isEditor = true;
  }
  return data;
}

module.exports = {
  filterPostEditPrivilege,
  hasTopdataManagedMarker,
  isGeneratedWikiMainPost
};
