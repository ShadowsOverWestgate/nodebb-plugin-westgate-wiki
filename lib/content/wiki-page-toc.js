"use strict";

const wikiSlug = require("../core/wiki-slug");

const MAX_TOC_HEADINGS = 200;

function textToSlug(s) {
  return wikiSlug.slugifyWikiText(s, "");
}

function decodeHtmlEntities(value) {
  return wikiSlug.decodeHtmlEntities(value);
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getHtmlAttribute(source, name) {
  const attrName = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\s${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(source || "").match(re);
  return match ? decodeHtmlEntities(match[1] || match[2] || match[3] || "") : "";
}

function parseTagAttributes(source) {
  return {
    className: getHtmlAttribute(source, "class"),
    wikiNode: getHtmlAttribute(source, "data-wiki-node")
  };
}

function isInfoboxOpeningTag(tagSource) {
  const attrs = parseTagAttributes(tagSource);
  const classNames = String(attrs.className || "").split(/\s+/);
  return attrs.wikiNode === "infobox" || classNames.includes("wiki-infobox") || classNames.includes("infobox");
}

function buildInfoboxRanges(html) {
  const ranges = [];
  const stack = [];
  const tagRe = /<\/?([a-z0-9-]+)\b[^>]*>/gi;
  let match;

  while ((match = tagRe.exec(String(html || "")))) {
    const source = match[0];
    const tagName = String(match[1] || "").toLowerCase();
    const isClosing = /^<\//.test(source);
    const isSelfClosing = /\/>$/.test(source);

    if (isClosing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const entry = stack[index];
        stack.splice(index, stack.length - index);
        if (entry.tagName === tagName && entry.infoboxStart != null) {
          ranges.push({ start: entry.infoboxStart, end: tagRe.lastIndex });
          break;
        }
        if (entry.tagName === tagName) {
          break;
        }
      }
      continue;
    }

    if (!isSelfClosing) {
      stack.push({
        tagName,
        infoboxStart: tagName === "aside" && isInfoboxOpeningTag(source) ? match.index : null
      });
    }
  }

  return ranges;
}

function isIndexInsideRanges(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function extractHeadingToc(html) {
  const headings = [];
  const used = new Set();
  const pendingAutoIds = [];
  const infoboxRanges = buildInfoboxRanges(html);
  const re = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match;

  while ((match = re.exec(String(html || ""))) && headings.length < MAX_TOC_HEADINGS) {
    if (isIndexInsideRanges(match.index, infoboxRanges)) {
      continue;
    }

    const level = parseInt(match[1], 10);
    const attrs = match[2] || "";
    const text = stripTags(match[3]);
    if (!text) {
      continue;
    }
    const explicitId = getHtmlAttribute(attrs, "id").trim();
    const heading = {
      id: explicitId,
      text,
      level
    };
    headings.push(heading);
    if (explicitId) {
      used.add(explicitId);
    } else {
      pendingAutoIds.push(heading);
    }
  }

  pendingAutoIds.forEach((heading) => {
    const base = textToSlug(heading.text) || "section";
    let index = 0;
    let candidate;
    do {
      candidate = index === 0 ? base : `${base}-${index + 1}`;
      index += 1;
    } while (used.has(candidate) && index < 5000);
    heading.id = candidate;
    used.add(candidate);
  });

  return headings;
}

async function apiGetPageToc(req, res) {
  const helpers = require.main.require("./src/controllers/helpers");
  const posts = require.main.require("./src/posts");
  const utils = require.main.require("./src/utils");
  const topicService = require("../read/topic-service");
  const tid = req.query && req.query.tid;
  if (!utils.isNumber(tid)) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  const page = await topicService.getWikiPage(tid, req.uid);
  if (page.status === "invalid") {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }
  if (page.status === "forbidden") {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }
  if (page.status !== "ok") {
    return helpers.formatApiResponse(404, res, new Error("[[error:not-found]]"));
  }

  const content = await posts.getPostField(page.topic.mainPid, "content");
  return helpers.formatApiResponse(200, res, {
    headings: extractHeadingToc(content)
  });
}

module.exports = {
  apiGetPageToc,
  extractHeadingToc,
  textToSlug
};
