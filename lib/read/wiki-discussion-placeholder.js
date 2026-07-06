"use strict";

const nconf = require.main.require("nconf");
const categories = require.main.require("./src/categories");
const topics = require.main.require("./src/topics");

const config = require("../core/config");
const wikiPaths = require("../tree/wiki-paths");
const wikiDiscussionSettings = require("./wiki-discussion-settings");
const wikiTombstones = require("../pages/wiki-tombstones");

function toPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function withRelativePath(path) {
  const relativePath = String(nconf.get("relative_path") || "").replace(/\/$/, "");
  const normalizedPath = String(path || "");

  if (!relativePath || /^https?:\/\//i.test(normalizedPath) || normalizedPath.startsWith(relativePath + "/")) {
    return normalizedPath;
  }

  return `${relativePath}${normalizedPath.startsWith("/") ? "" : "/"}${normalizedPath}`;
}

function getTemplateTopicData(templateData) {
  const topic = templateData && (templateData.topic || templateData.topicData);
  const tid = toPositiveInt(templateData && templateData.tid) || toPositiveInt(topic && topic.tid);

  return {
    ...(topic || {}),
    tid,
    cid: toPositiveInt(templateData && templateData.cid) || toPositiveInt(topic && topic.cid),
    mainPid: toPositiveInt(templateData && templateData.mainPid) || toPositiveInt(topic && topic.mainPid),
    slug: (templateData && templateData.slug) || (topic && topic.slug),
    title: (templateData && (templateData.titleRaw || templateData.title)) || (topic && (topic.titleRaw || topic.title))
  };
}

function getTopicPosts(templateData) {
  if (!templateData) {
    return [];
  }
  if (Array.isArray(templateData.posts)) {
    return templateData.posts;
  }
  if (templateData.topic && Array.isArray(templateData.topic.posts)) {
    return templateData.topic.posts;
  }
  if (templateData.topicData && Array.isArray(templateData.topicData.posts)) {
    return templateData.topicData.posts;
  }
  return [];
}

function getViewerUid(data, templateData) {
  return toPositiveInt(
    (data && data.uid) ||
    (data && data.req && data.req.uid) ||
    (templateData && templateData.uid)
  );
}

function findMainPost(posts, mainPid) {
  if (!Array.isArray(posts) || !posts.length || !mainPid) {
    return null;
  }
  return posts.find((post) => toPositiveInt(post && post.pid) === mainPid) || null;
}

function hasTombstoneFields(topicData) {
  return !!topicData && wikiTombstones.TOMBSTONE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(topicData, field));
}

async function isTombstonedTopic(topicData) {
  if (wikiTombstones.isTombstonedTopic(topicData)) {
    return true;
  }
  if (hasTombstoneFields(topicData)) {
    return false;
  }
  return !!(await wikiTombstones.getTombstone(topicData && topicData.tid));
}

async function loadTopicDataIfNeeded(topicData) {
  if (topicData.cid && topicData.slug && topicData.title && topicData.mainPid) {
    return topicData;
  }

  const tid = toPositiveInt(topicData.tid);
  if (!tid) {
    return topicData;
  }

  const fullTopicData = await topics.getTopicData(tid);
  return {
    ...(fullTopicData || {}),
    ...topicData,
    cid: topicData.cid || toPositiveInt(fullTopicData && fullTopicData.cid),
    mainPid: topicData.mainPid || toPositiveInt(fullTopicData && fullTopicData.mainPid),
    slug: topicData.slug || (fullTopicData && fullTopicData.slug),
    title: topicData.title || (fullTopicData && (fullTopicData.titleRaw || fullTopicData.title))
  };
}

function buildPlaceholderHtml(topicData, articlePath, options = {}) {
  const href = escapeAttribute(withRelativePath(articlePath));
  const title = escapeHtml(topicData.title || "this article");
  const linkInner = `<i class="fa-solid fa-fw fa-book wiki-forum-link-icon" aria-hidden="true"></i><span class="wiki-forum-link-text">${title}</span>`;
  const disabledNotice = options.discussionDisabled ?
    '<p class="wiki-discussion-placeholder__notice">Discussion is disabled for this article.</p>' :
    "";

  return [
    '<div class="wiki-discussion-placeholder" data-wiki-discussion-placeholder="1">',
    '<p class="wiki-discussion-placeholder__text">',
    `A discussion about article <a class="wiki-discussion-placeholder__link wiki-link-from-forum" href="${href}">${linkInner}</a>.`,
    "</p>",
    disabledNotice,
    "</div>"
  ].join("");
}

function replacePostContent(post, placeholderHtml) {
  post.content = placeholderHtml;

  if (Object.prototype.hasOwnProperty.call(post, "excerpt")) {
    post.excerpt = "";
  }
  if (Object.prototype.hasOwnProperty.call(post, "teaser")) {
    post.teaser = "";
  }
  if (Object.prototype.hasOwnProperty.call(post, "body")) {
    post.body = placeholderHtml;
  }
}

async function filterTopicBuild(data) {
  const templateData = data && data.templateData;
  const posts = getTopicPosts(templateData);

  if (!templateData || !posts.length) {
    return data;
  }

  const topicData = await loadTopicDataIfNeeded(getTemplateTopicData(templateData));
  const cid = toPositiveInt(topicData.cid);
  const settings = await config.getSettings();

  if (!cid || !settings.effectiveCategoryIds.includes(cid)) {
    return data;
  }
  if (await isTombstonedTopic(topicData)) {
    return data;
  }

  const mainPid = toPositiveInt(topicData.mainPid);
  const mainPost = findMainPost(posts, mainPid);
  if (!mainPost) {
    return data;
  }
  const uid = getViewerUid(data, templateData);
  if (!uid) {
    return data;
  }

  const category = await categories.getCategoryData(cid);
  const pageInfo = await wikiPaths.getCanonicalPageInfo(topicData, { category, uid });
  const articlePath = pageInfo.wikiPath || "";
  if (!articlePath) {
    return data;
  }

  const discussionDisabled = await wikiDiscussionSettings.getDiscussionDisabled(topicData.tid);
  if (discussionDisabled) {
    wikiDiscussionSettings.applyReplyDisabledTemplateState(templateData);
  }

  replacePostContent(mainPost, buildPlaceholderHtml(topicData, articlePath, { discussionDisabled }));
  return data;
}

module.exports = {
  buildPlaceholderHtml,
  filterTopicBuild,
  getTemplateTopicData,
  replacePostContent
};
