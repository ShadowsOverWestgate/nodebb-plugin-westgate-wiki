"use strict";

const helpers = require.main.require("./src/controllers/helpers");
const topics = require.main.require("./src/topics");

const ARTICLE_CSS_FIELD = "westgateWikiArticleCss";
const MAX_ARTICLE_CSS_BYTES = 32 * 1024;

const ALLOWED_PROPERTIES = new Set([
  "accent-color",
  "align-items",
  "background",
  "background-color",
  "border",
  "border-block",
  "border-block-end",
  "border-block-start",
  "border-bottom",
  "border-color",
  "border-inline",
  "border-inline-end",
  "border-inline-start",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "box-shadow",
  "clear",
  "color",
  "column-gap",
  "display",
  "filter",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-wrap",
  "float",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "gap",
  "height",
  "justify-content",
  "line-height",
  "list-style",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-block",
  "margin-block-end",
  "margin-block-start",
  "margin-bottom",
  "margin-inline",
  "margin-inline-end",
  "margin-inline-start",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "object-fit",
  "object-position",
  "opacity",
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow",
  "overflow-wrap",
  "padding",
  "padding-block",
  "padding-block-end",
  "padding-block-start",
  "padding-bottom",
  "padding-inline",
  "padding-inline-end",
  "padding-inline-start",
  "padding-left",
  "padding-right",
  "padding-top",
  "row-gap",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "text-transform",
  "vertical-align",
  "white-space",
  "width"
]);

const REJECTED_SELECTOR_START = /^(?:html|body|:root|\*|#content|\.container|\.container-lg|\.navbar|\.header|\.footer|\.composer|\.modal|\.dropdown|\.tooltip|\.popover|\.westgate-wiki(?:\b|[-_\s.#:[>+~]))/i;
const SAFE_AT_RULE_RE = /^@media\s+\((?:max|min)-width:\s*\d{1,4}px\)$/i;

function utf8ByteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function stripCssComments(css) {
  return String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function splitTopLevel(value, separator) {
  const source = String(value || "");
  const parts = [];
  let quote = "";
  let bracketDepth = 0;
  let parenDepth = 0;
  let start = 0;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
    } else if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (ch === separator && !bracketDepth && !parenDepth) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function normalizeSelector(selector) {
  const source = String(selector || "").trim().replace(/\s+/g, " ");
  if (
    !source ||
    source.length > 240 ||
    /[{}<>]/.test(source) ||
    /\b(?:script|iframe|object|embed)\b/i.test(source) ||
    REJECTED_SELECTOR_START.test(source)
  ) {
    return "";
  }
  return source;
}

function sanitizeSelectors(selectorText) {
  return splitTopLevel(selectorText, ",")
    .map(normalizeSelector)
    .filter(Boolean)
    .join(", ");
}

function normalizeDeclarationValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s*!important\s*$/i, "")
    .replace(/\s+/g, " ");
}

function isSafeDeclaration(property, value) {
  if (!ALLOWED_PROPERTIES.has(property)) {
    return false;
  }
  if (
    !value ||
    value.length > 320 ||
    /[{}<>]/.test(value) ||
    /(?:expression|javascript|vbscript|data:text\/html|behavior\s*:|@import|url\s*\()/i.test(value)
  ) {
    return false;
  }
  if (property === "display" && /^(?:none|contents)$/i.test(value)) {
    return false;
  }
  if (property === "filter" && /url\s*\(/i.test(value)) {
    return false;
  }
  return true;
}

function sanitizeDeclarations(body) {
  const declarations = [];
  splitTopLevel(body, ";").forEach((part) => {
    const match = String(part || "").match(/^\s*([a-z-]+)\s*:\s*([\s\S]+?)\s*$/i);
    if (!match) {
      return;
    }
    const property = match[1].toLowerCase();
    const value = normalizeDeclarationValue(match[2]);
    if (isSafeDeclaration(property, value)) {
      declarations.push(`${property}: ${value}`);
    }
  });
  return declarations.join("; ");
}

function parseBlocks(css, callback) {
  const source = String(css || "");
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("{", index);
    if (open === -1) {
      break;
    }

    const prelude = source.slice(index, open).trim();
    let depth = 1;
    let quote = "";
    let close = open + 1;
    for (; close < source.length; close += 1) {
      const ch = source[close];
      const prev = source[close - 1];
      if (quote) {
        if (ch === quote && prev !== "\\") {
          quote = "";
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (!depth) {
          break;
        }
      }
    }

    if (depth) {
      break;
    }

    callback(prelude, source.slice(open + 1, close));
    index = close + 1;
  }
}

function sanitizeArticleCss(css) {
  const source = stripCssComments(css);
  if (!source.trim()) {
    return "";
  }
  if (utf8ByteLength(source) > MAX_ARTICLE_CSS_BYTES) {
    throw new Error(`Article CSS is too large (max ${Math.round(MAX_ARTICLE_CSS_BYTES / 1024)} KiB UTF-8).`);
  }

  const rules = [];
  parseBlocks(source, (prelude, body) => {
    if (/^@/i.test(prelude)) {
      if (!SAFE_AT_RULE_RE.test(prelude)) {
        return;
      }
      const nested = sanitizeArticleCss(body);
      if (nested) {
        rules.push(`${prelude} {\n${nested}\n}`);
      }
      return;
    }

    const selectors = sanitizeSelectors(prelude);
    const declarations = sanitizeDeclarations(body);
    if (selectors && declarations) {
      rules.push(`${selectors} { ${declarations}; }`);
    }
  });

  return rules.join("\n").trim();
}

function scopeSelector(selector, scopeClass) {
  const source = String(selector || "").trim();
  if (!source) {
    return "";
  }
  if (source.startsWith(scopeClass)) {
    return source;
  }
  return `${scopeClass} ${source}`;
}

function scopeArticleCss(css, tid) {
  const scopeClass = `.wiki-article-custom-css-scope-${parseInt(tid, 10)}`;
  if (!/\d+$/.test(scopeClass)) {
    return "";
  }
  const scoped = [];
  parseBlocks(sanitizeArticleCss(css), (prelude, body) => {
    if (/^@/i.test(prelude)) {
      const nested = scopeArticleCss(body, tid);
      if (nested) {
        scoped.push(`${prelude} {\n${nested}\n}`);
      }
      return;
    }

    const selectors = splitTopLevel(prelude, ",")
      .map((selector) => scopeSelector(selector, scopeClass))
      .filter(Boolean)
      .join(", ");
    const declarations = sanitizeDeclarations(body);
    if (selectors && declarations) {
      scoped.push(`${selectors} { ${declarations}; }`);
    }
  });
  return scoped.join("\n").trim();
}

async function getArticleCss(tid) {
  const parsedTid = parseInt(tid, 10);
  if (!Number.isInteger(parsedTid) || parsedTid <= 0) {
    return "";
  }
  return String(await topics.getTopicField(parsedTid, ARTICLE_CSS_FIELD) || "").trim();
}

async function setArticleCss(tid, css) {
  const parsedTid = parseInt(tid, 10);
  if (!Number.isInteger(parsedTid) || parsedTid <= 0) {
    throw new Error("[[error:invalid-data]]");
  }
  const sanitized = sanitizeArticleCss(css);
  await topics.setTopicField(parsedTid, ARTICLE_CSS_FIELD, sanitized);
  return sanitized;
}

async function putArticleCss(req, res) {
  const tid = parseInt((req.body && req.body.tid) || (req.query && req.query.tid), 10);
  if (!Number.isInteger(tid) || tid <= 0) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  const topicService = require("../read/topic-service");
  const wikiPage = await topicService.getWikiPage(tid, req.uid);
  if (wikiPage.status === "forbidden") {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }
  if (wikiPage.status !== "ok") {
    return helpers.formatApiResponse(404, res, new Error("[[error:not-found]]"));
  }
  if (!wikiPage.canEditWikiPage) {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }

  try {
    const articleCss = await setArticleCss(tid, req.body && req.body.css);
    return helpers.formatApiResponse(200, res, {
      tid,
      articleCss,
      scopedArticleCss: scopeArticleCss(articleCss, tid)
    });
  } catch (err) {
    return helpers.formatApiResponse(400, res, err);
  }
}

module.exports = {
  ARTICLE_CSS_FIELD,
  MAX_ARTICLE_CSS_BYTES,
  getArticleCss,
  putArticleCss,
  sanitizeArticleCss,
  scopeArticleCss,
  setArticleCss
};
