"use strict";

const config = require("./config");
const wikiLinks = require("./wiki-links");

function looksLikeWikiStoredHtml(content) {
  const trimmed = String(content || "").trim();
  if (trimmed.length < 3 || !trimmed.startsWith("<")) {
    return false;
  }
  return /^(?:<!--|<(?:p|div|figure|h[1-6]|blockquote|ul|ol|table|article|aside|span|section|pre|hr|code|strong|em|img|label)\b)/i.test(trimmed);
}

async function markdownBeforeParse({ env, data }) {
  if (!env || !data || !data.postData) {
    return { env, data };
  }
  if (data.type === "markdown") {
    return { env, data };
  }
  const raw = String(data.postData.content || "");
  if (!looksLikeWikiStoredHtml(raw)) {
    return { env, data };
  }

  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return { env, data };
  }

  const categoryId = await wikiLinks.getPostCategoryId(data.postData, settings);
  if (!categoryId) {
    return { env, data };
  }

  env.parse = false;
  return { env, data };
}

module.exports = {
  markdownBeforeParse,
  looksLikeWikiStoredHtml
};
