"use strict";

const nconf = require.main.require("nconf");
const slugify = require.main.require("./src/slugify");
const user = require.main.require("./src/user");

const config = require("../core/config");
const wikiLinks = require("./wiki-links");

const PROTECTED_TAGS = new Set(["a", "code", "pre", "script", "style", "textarea", "template"]);
const MAX_MENTIONS_PER_POST = 50;
const mentionRegex = () => /(^|[^\w@./:+-])@([A-Za-z0-9][A-Za-z0-9_-]{0,38})(?=$|[^A-Za-z0-9_-])/g;
const USER_ENTITY_RE = /<span\b(?=[^>]*\bdata-wiki-entity=(["'])user\1)([^>]*)>([\s\S]*?)<\/span>/gi;

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

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function getHtmlAttribute(source, name) {
  const re = new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  const match = String(source || "").match(re);
  return match ? decodeHtmlAttribute(match[2]) : "";
}

function getTagName(tagSource) {
  const match = String(tagSource || "").match(/^<\/?\s*([a-zA-Z][\w:-]*)/);
  return match ? match[1].toLowerCase() : "";
}

function findClosingTagEnd(content, tagName, fromIndex) {
  const closeRe = new RegExp(`</\\s*${tagName}\\s*>`, "ig");
  closeRe.lastIndex = fromIndex;
  const match = closeRe.exec(content);
  return match ? match.index + match[0].length : -1;
}

function buildTagRanges(content) {
  const ranges = [];
  const tagRe = /<!--[\s\S]*?-->|<[^>]*>/g;
  let match;

  while ((match = tagRe.exec(content)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }

  return ranges;
}

function buildProtectedRanges(content) {
  const ranges = [];
  const openTagRe = /<([a-zA-Z][\w:-]*)(?:\s[^>]*)?>/g;
  let match;

  while ((match = openTagRe.exec(content)) !== null) {
    const tagSource = match[0];
    const tagName = getTagName(tagSource);
    const isSelfClosing = /\/\s*>$/.test(tagSource);

    if (isSelfClosing || !PROTECTED_TAGS.has(tagName)) {
      continue;
    }

    const end = findClosingTagEnd(content, tagName, match.index + tagSource.length);
    if (end === -1) {
      ranges.push([match.index, content.length]);
      break;
    }

    ranges.push([match.index, end]);
    openTagRe.lastIndex = end;
  }

  return ranges;
}

function mergeRanges(ranges) {
  const sorted = ranges
    .filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && end > start)
    .sort((a, b) => a[0] - b[0]);

  return sorted.reduce((merged, range) => {
    const previous = merged[merged.length - 1];
    if (!previous || range[0] > previous[1]) {
      merged.push(range.slice());
      return merged;
    }
    previous[1] = Math.max(previous[1], range[1]);
    return merged;
  }, []);
}

function splitHtmlByBlockedRanges(content) {
  const source = String(content || "");
  const ranges = mergeRanges(buildTagRanges(source).concat(buildProtectedRanges(source)));
  const segments = [];
  let cursor = 0;

  ranges.forEach(([start, end]) => {
    if (cursor < start) {
      segments.push({ text: source.slice(cursor, start), protected: false });
    }
    segments.push({ text: source.slice(start, end), protected: true });
    cursor = end;
  });

  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), protected: false });
  }

  return segments;
}

function collectMentionNames(content) {
  const names = new Set();

  splitHtmlByBlockedRanges(content).forEach((segment) => {
    if (segment.protected || !segment.text.includes("@") || names.size >= MAX_MENTIONS_PER_POST) {
      return;
    }

    const mentionRe = mentionRegex();
    let match;
    while ((match = mentionRe.exec(segment.text)) !== null && names.size < MAX_MENTIONS_PER_POST) {
      names.add(match[2]);
    }
  });

  return [...names];
}

async function getUserByMentionName(name) {
  const userslug = slugify(String(name || "").trim());
  if (!userslug || typeof user.getUidByUserslug !== "function") {
    return null;
  }

  const uid = await user.getUidByUserslug(userslug);
  const parsedUid = parseInt(uid, 10);
  if (!Number.isInteger(parsedUid) || parsedUid <= 0) {
    return null;
  }

  if (typeof user.getUserFields === "function") {
    const userData = await user.getUserFields(parsedUid, ["uid", "username", "userslug", "displayname"]);
    return userData && userData.userslug ? userData : null;
  }

  if (typeof user.getUserData === "function") {
    const userData = await user.getUserData(parsedUid);
    return userData && userData.userslug ? userData : null;
  }

  return { uid: parsedUid, userslug, username: name, displayname: name };
}

async function buildMentionMap(names) {
  const map = new Map();

  for (const name of names) {
    const userData = await getUserByMentionName(name);
    if (userData && userData.userslug) {
      map.set(name, userData);
    }
  }

  return map;
}

async function collectMentionUsers(content) {
  const mentionMap = await buildMentionMap(collectMentionNames(content));
  const seenUids = new Set();
  const users = [];

  mentionMap.forEach((userData, sourceName) => {
    const uid = parseInt(userData && userData.uid, 10);
    if (!Number.isInteger(uid) || uid <= 0 || seenUids.has(uid)) {
      return;
    }

    seenUids.add(uid);
    users.push({
      ...userData,
      uid,
      sourceName
    });
  });

  return users;
}

function renderUserMention(sourceName, userData) {
  const rel = nconf.get("relative_path") || "";
  const href = `${rel}/user/${userData.userslug}`;
  return `<a class="wiki-user-mention" href="${escapeAttribute(href)}">@${escapeHtml(sourceName)}</a>`;
}

function replaceMentionsInText(text, mentionMap) {
  return String(text || "").replace(mentionRegex(), (source, prefix, name) => {
    const userData = mentionMap.get(name);
    if (!userData) {
      return source;
    }
    return `${prefix}${renderUserMention(name, userData)}`;
  });
}

async function transformUserMentionsInHtml(content) {
  const source = String(content || "").replace(USER_ENTITY_RE, function (full, quote, attrs, inner) {
    const name = getHtmlAttribute(attrs, "data-wiki-username") || String(inner || "").replace(/<[^>]*>/g, "").replace(/^@/, "");
    return name ? `@${name.replace(/^@/, "")}` : inner;
  });
  if (!source.includes("@")) {
    return source;
  }

  const mentionMap = await buildMentionMap(collectMentionNames(source));
  if (!mentionMap.size) {
    return source;
  }

  return splitHtmlByBlockedRanges(source).map((segment) => (
    segment.protected ? segment.text : replaceMentionsInText(segment.text, mentionMap)
  )).join("");
}

async function transformWikiUserMentions(data) {
  if (!data || !data.postData || !data.postData.content || !String(data.postData.content).includes("@")) {
    return data;
  }

  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return data;
  }

  const categoryId = await wikiLinks.getPostCategoryId(data.postData, settings);
  if (!categoryId) {
    return data;
  }

  data.postData.content = await transformUserMentionsInHtml(data.postData.content);
  return data;
}

module.exports = {
  collectMentionUsers,
  transformWikiUserMentions,
  transformUserMentionsInHtml,
  collectMentionNames
};
