"use strict";

const PROTECTED_START_TAGS = new Set(["a", "code", "pre", "script", "style", "textarea", "template"]);
const NOTE_BODY_PROTECTED_TAGS = new Set(["a", "code", "pre", "script", "style", "textarea", "template"]);
const FOOTNOTE_ENTITY_RE = /<span\b(?=[^>]*\bdata-wiki-entity=(["'])footnote\1)([^>]*)>[\s\S]*?<\/span>/gi;

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

function decodeBase64Utf8(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  try {
    return Buffer.from(source, "base64").toString("utf8");
  } catch (err) {
    return "";
  }
}

function stripUnsafeInlineHtml(value) {
  return String(value || "")
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    // Strip event handlers whether the value is double-quoted, single-quoted, or
    // bare — the quoted-only form let `onerror=alert(1)` (no quotes) survive.
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();
}

function replaceFootnoteEntitiesWithMarkers(content) {
  return String(content || "").replace(FOOTNOTE_ENTITY_RE, function (source) {
    const body = stripUnsafeInlineHtml(
      decodeBase64Utf8(getHtmlAttribute(source, "data-wiki-footnote-b64")) ||
        getHtmlAttribute(source, "data-wiki-footnote")
    );
    return body ? `((${body}))` : "";
  });
}

function getTagName(tagSource) {
  const match = String(tagSource || "").match(/^<\/?\s*([a-zA-Z][\w:-]*)/);
  return match ? match[1].toLowerCase() : "";
}

function hasClass(tagSource, className) {
  const classMatch = String(tagSource || "").match(/\sclass\s*=\s*(["'])([\s\S]*?)\1/i);
  if (!classMatch) {
    return false;
  }
  return classMatch[2].split(/\s+/).includes(className);
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

function buildProtectedRanges(content, protectedTags) {
  const ranges = [];
  const openTagRe = /<([a-zA-Z][\w:-]*)(?:\s[^>]*)?>/g;
  let match;

  while ((match = openTagRe.exec(content)) !== null) {
    const tagSource = match[0];
    const tagName = String(match[1] || "").toLowerCase();
    const isSelfClosing = /\/\s*>$/.test(tagSource);

    if (isSelfClosing) {
      continue;
    }

    const protectsFootnotes = protectedTags.has(tagName) || hasClass(tagSource, "wiki-footnotes");
    if (!protectsFootnotes) {
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

function isInRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
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

function findTokenOutsideRanges(content, token, fromIndex, blockedRanges) {
  let index = String(content || "").indexOf(token, fromIndex);

  while (index !== -1) {
    if (!isInRanges(index, blockedRanges)) {
      return index;
    }
    index = content.indexOf(token, index + token.length);
  }

  return -1;
}

function findFootnoteClose(content, bodyStartIndex, blockedRanges) {
  let index = findTokenOutsideRanges(content, "))", bodyStartIndex, blockedRanges);

  while (index !== -1) {
    const beforeCandidate = content.slice(bodyStartIndex, index);
    /*
     * A Markdown link at the end of a note produces `...](url)))`: the first
     * `)` closes the link and the next two close the footnote. Skip that first
     * overlapping `))` so `[label](url)` survives inside `((...))`.
     */
    if (/\[[^\]\n]+\]\([^)\s]*$/.test(beforeCandidate)) {
      index = findTokenOutsideRanges(content, "))", index + 1, blockedRanges);
      continue;
    }
    return index;
  }

  return -1;
}

function isSafeHref(href) {
  const value = String(href || "").trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(value);
}

function renderMarkdownLinksInText(text) {
  return String(text || "").replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (source, label, href) => {
      const trimmedHref = String(href || "").trim();
      if (!isSafeHref(trimmedHref)) {
        return source;
      }
      return `<a href="${escapeAttribute(trimmedHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }
  );
}

function mergeRel(value) {
  const rel = new Set(
    String(value || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
  );
  rel.add("noopener");
  rel.add("noreferrer");
  return Array.from(rel).join(" ");
}

function renderFootnoteBodyLinks(html) {
  return String(html || "").replace(/<a\b([^>]*)>/gi, (source, attrs) => {
    const href = getHtmlAttribute(source, "href").trim();
    if (!isSafeHref(href)) {
      // ponytail: drop the tag entirely; passing it through let javascript: hrefs survive
      return "";
    }

    const existingRel = getHtmlAttribute(source, "rel");
    const rest = String(attrs || "")
      .replace(/\s(?:href|target|rel)\s*=\s*(["'])[\s\S]*?\1/gi, "")
      .trim();
    const prefix = rest ? ` ${rest}` : "";
    return `<a${prefix} href="${escapeAttribute(href)}" target="_blank" rel="${escapeAttribute(mergeRel(existingRel))}">`;
  });
}

function renderMarkdownLinksInHtml(html) {
  const source = String(html || "");
  const tagRanges = buildTagRanges(source);
  const protectedRanges = buildProtectedRanges(source, NOTE_BODY_PROTECTED_TAGS);
  const blockedRanges = mergeRanges(tagRanges.concat(protectedRanges));
  let output = "";
  let cursor = 0;

  blockedRanges.forEach(([start, end]) => {
    if (cursor < start) {
      output += renderMarkdownLinksInText(source.slice(cursor, start));
    }
    output += source.slice(start, end);
    cursor = end;
  });

  if (cursor < source.length) {
    output += renderMarkdownLinksInText(source.slice(cursor));
  }

  return renderFootnoteBodyLinks(output);
}

function extractExistingIds(content) {
  const ids = new Set();
  const idRe = /\sid\s*=\s*(["'])([\s\S]*?)\1/gi;
  let match;

  while ((match = idRe.exec(content)) !== null) {
    if (match[2]) {
      ids.add(match[2]);
    }
  }

  return ids;
}

function createUniqueIdFactory(existingIds) {
  const usedIds = new Set(existingIds || []);

  return function nextUniqueId(base) {
    let candidate = base;
    let suffix = 2;

    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(candidate);
    return candidate;
  };
}

function renderFootnoteRef(note, refId, templateId) {
  const label = `${note.number})`;
  return [
    `<sup id="${escapeAttribute(refId)}" class="wiki-footnote-ref" data-wiki-footnote-ref data-wiki-footnote-template="${escapeAttribute(templateId)}">`,
    `<a class="wiki-footnote-link" href="#${escapeAttribute(note.id)}" aria-describedby="${escapeAttribute(templateId)}">${escapeHtml(label)}</a>`,
    "</sup>",
    `<span id="${escapeAttribute(templateId)}" class="wiki-footnote-template" data-wiki-footnote-preview-source hidden aria-hidden="true">`,
    note.bodyHtml,
    "</span>"
  ].join("");
}

function renderFootnotesSection(notes) {
  if (!notes.length) {
    return "";
  }

  const items = notes.map((note) => {
    const backrefs = note.refs.map((refId, index) => {
      const suffix = note.refs.length > 1 ? ` ${index + 1}` : "";
      return [
        `<a class="wiki-footnote-backref" href="#${escapeAttribute(refId)}" aria-label="Back to footnote reference${escapeAttribute(suffix)}">`,
        '<span class="wiki-footnote-backref-icon" aria-hidden="true">↑</span>',
        '<span class="visually-hidden">Back to footnote reference</span>',
        "</a>"
      ].join("");
    }).join(" ");

    return [
      `<li id="${escapeAttribute(note.id)}" class="wiki-footnote-item">`,
      `<span class="wiki-footnote-body">${note.bodyHtml}</span>`,
      ` <span class="wiki-footnote-backrefs" aria-label="Backlinks">${backrefs}</span>`,
      "</li>"
    ].join("");
  }).join("");

  return [
    '<section class="wiki-footnotes" aria-label="Footnotes">',
    '<hr class="wiki-footnotes__separator" />',
    '<ol class="wiki-footnotes__list">',
    items,
    "</ol>",
    "</section>"
  ].join("");
}

function transformDokuWikiFootnotes(content) {
  const source = replaceFootnoteEntitiesWithMarkers(content);

  if (!source.includes("((")) {
    return source;
  }

  const existingIds = extractExistingIds(source);
  const nextUniqueId = createUniqueIdFactory(existingIds);
  const tagRanges = buildTagRanges(source);
  const protectedRanges = buildProtectedRanges(source, PROTECTED_START_TAGS);
  const blockedStartRanges = tagRanges.concat(protectedRanges);
  const blockedCloseRanges = tagRanges;
  const notesByBody = new Map();
  const notes = [];
  let output = "";
  let cursor = 0;

  while (cursor < source.length) {
    const openIndex = findTokenOutsideRanges(source, "((", cursor, blockedStartRanges);

    if (openIndex === -1) {
      output += source.slice(cursor);
      break;
    }

    const closeIndex = findFootnoteClose(source, openIndex + 2, blockedCloseRanges);

    if (closeIndex === -1) {
      output += source.slice(cursor);
      break;
    }

    const rawBody = source.slice(openIndex + 2, closeIndex);

    if (/<\/(?:p|div|section|article|li|ul|ol|table|blockquote|h[1-6])\b/i.test(rawBody)) {
      output += source.slice(cursor, openIndex + 2);
      cursor = openIndex + 2;
      continue;
    }

    const trimmedBody = rawBody.trim();

    if (!trimmedBody) {
      output += source.slice(cursor, closeIndex + 2);
      cursor = closeIndex + 2;
      continue;
    }

    let note = notesByBody.get(trimmedBody);

    if (!note) {
      note = {
        number: notes.length + 1,
        id: nextUniqueId(`fn__${notes.length + 1}`),
        // Runs at filter:parse.post AFTER core sanitize, so strip here — the b64
        // entity path already does; the literal ((...)) path did not.
        bodyHtml: renderMarkdownLinksInHtml(stripUnsafeInlineHtml(trimmedBody)),
        refs: []
      };
      notesByBody.set(trimmedBody, note);
      notes.push(note);
    }

    const refSuffix = note.refs.length ? `-${note.refs.length + 1}` : "";
    const refId = nextUniqueId(`fnt__${note.number}${refSuffix}`);
    const templateId = nextUniqueId(`${refId}-preview`);
    note.refs.push(refId);

    output += source.slice(cursor, openIndex);
    output += renderFootnoteRef(note, refId, templateId);
    cursor = closeIndex + 2;
  }

  return notes.length ? output + renderFootnotesSection(notes) : output;
}

function contentHasFootnoteMarkers(content) {
  const source = String(content || "");
  return source.includes("((") || /data-wiki-entity=(["'])footnote\1/i.test(source);
}

async function transformWikiFootnotes(data) {
  if (!data || !data.postData || !data.postData.content || !contentHasFootnoteMarkers(data.postData.content)) {
    return data;
  }

  const config = require("../core/config");
  const wikiLinks = require("./wiki-links");
  const settings = await config.getSettings();

  if (!settings.isConfigured) {
    return data;
  }

  const categoryId = await wikiLinks.getPostCategoryId(data.postData, settings);
  if (!categoryId) {
    return data;
  }

  data.postData.content = transformDokuWikiFootnotes(data.postData.content);
  return data;
}

module.exports = {
  transformWikiFootnotes,
  transformDokuWikiFootnotes,
  contentHasFootnoteMarkers,
  renderMarkdownLinksInHtml,
  replaceFootnoteEntitiesWithMarkers
};
