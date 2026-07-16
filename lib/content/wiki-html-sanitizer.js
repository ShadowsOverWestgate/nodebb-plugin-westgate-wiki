"use strict";

const highlightJs = require("highlight.js/lib/common");
const powershell = require("highlight.js/lib/languages/powershell");
const sanitizeHtml = require("sanitize-html");

const SANITIZER_CONFIG = require("../../shared/wiki-html-sanitizer-config.json");

const TOPDATA_COMMENT_REGEX = /<!--\s*sow-topdata-wiki:[\s\S]*?-->/g;
const TOPDATA_COMMENT_TOKEN_PREFIX = "WESTGATE_TOPDATA_COMMENT_";
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

if (!highlightJs.getLanguage("powershell")) {
  highlightJs.registerLanguage("powershell", powershell);
}

function compileAllowedStylesMap(configMap) {
  return Object.fromEntries(
    Object.entries(configMap || {}).map(([tagName, properties]) => [
      tagName,
      Object.fromEntries(
        Object.entries(properties || {}).map(([propertyName, patterns]) => [
          propertyName,
          (patterns || []).map((pattern) => new RegExp(pattern))
        ])
      )
    ])
  );
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripUnsafeInlineHtml(value) {
  return decodeHtmlAttribute(value)
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .trim();
}

function sanitizeWikiEntitySpan(tagName, attribs) {
  const entityType = attribs["data-wiki-entity"];
  if (!entityType) {
    return { tagName, attribs };
  }

  const allowed = new Set(["page", "namespace", "user", "footnote"]);
  if (!allowed.has(entityType)) {
    const next = { ...attribs };
    delete next["data-wiki-entity"];
    return { tagName, attribs: next };
  }

  const next = { ...attribs };
  if (entityType === "footnote" && next["data-wiki-footnote"]) {
    next["data-wiki-footnote"] = stripUnsafeInlineHtml(next["data-wiki-footnote"]);
  }
  return { tagName, attribs: next };
}

const SANITIZE_OPTIONS = {
  allowedTags: SANITIZER_CONFIG.allowedTags,
  allowedAttributes: SANITIZER_CONFIG.allowedAttributes,
  allowedStyles: compileAllowedStylesMap(SANITIZER_CONFIG.allowedStyles),
  allowedSchemes: SANITIZER_CONFIG.allowedSchemes,
  allowedSchemesByTag: SANITIZER_CONFIG.allowedSchemesByTag,
  disallowedTagsMode: "discard",
  parseStyleAttributes: true,
  transformTags: {
    a: function transformAnchor(tagName, attribs) {
      const next = { ...attribs };
      if (next.href && !next.rel) {
        next.rel = "noopener noreferrer";
      }
      return {
        tagName,
        attribs: next
      };
    },
    span: sanitizeWikiEntitySpan
  }
};

function isSafeLinkHref(href) {
  const value = String(href || "").trim();
  if (!value) {
    return false;
  }
  if (/^[\u0000-\u001f\s]*javascript:/i.test(value.replace(/[\u0000-\u001f\s]+/g, ""))) {
    return false;
  }
  const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) {
    return !/^[\u0000-\u001f\s]*javascript:/i.test(value);
  }
  return ["http", "https", "mailto"].includes(schemeMatch[1].toLowerCase());
}

function isExternalLinkHref(href) {
  const value = String(href || "").trim();
  return /^(?:https?:)?\/\//i.test(value);
}

function mergeClassName(existingClassName, className) {
  const classes = String(existingClassName || "")
    .split(/\s+/)
    .filter(Boolean);
  if (!classes.includes(className)) {
    classes.push(className);
  }
  return classes.join(" ");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeCodeHtml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_source, hex) {
      return String.fromCodePoint(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, function (_source, code) {
      return String.fromCodePoint(parseInt(code, 10));
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function getHtmlAttribute(attrs, name) {
  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  const match = String(attrs || "").match(pattern);
  return match ? match[2] : "";
}

function setHtmlAttribute(attrs, name, value) {
  const source = String(attrs || "");
  const pattern = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  const attribute = ` ${name}="${escapeHtmlAttribute(value)}"`;
  if (pattern.test(source)) {
    return source.replace(pattern, attribute);
  }
  return `${source}${attribute}`;
}

function getCodeBlockHighlightLanguage(attrs) {
  const className = decodeHtmlAttribute(getHtmlAttribute(attrs, "class"));
  const match = className.match(/(?:^|\s)language-([a-z0-9_+#.-]+)(?=\s|$)/i);
  const language = match ? match[1].toLowerCase() : "";
  return language && highlightJs.getLanguage(language) ? language : "";
}

function highlightReadOnlyCodeBlocks(html) {
  return String(html || "").replace(
    /<pre([^>]*)>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    function (source, preAttrs, codeAttrs, encodedCode) {
      const language = getCodeBlockHighlightLanguage(codeAttrs);
      if (!language) {
        return source;
      }

      const className = mergeClassName(decodeHtmlAttribute(getHtmlAttribute(codeAttrs, "class")), "hljs");
      const nextCodeAttrs = setHtmlAttribute(
        setHtmlAttribute(codeAttrs, "class", className),
        "data-wiki-code-highlighted",
        "1"
      );
      const highlighted = highlightJs.highlight(decodeCodeHtml(encodedCode), {
        language,
        ignoreIllegals: true
      }).value;
      return `<pre${preAttrs}><code${nextCodeAttrs}>${highlighted}</code></pre>`;
    }
  );
}

function withReadOnlyLinkAttributes(attribs) {
  const next = { ...attribs };
  if (next.href && !next.rel) {
    next.rel = "noopener noreferrer";
  }
  if (isExternalLinkHref(next.href)) {
    next.class = mergeClassName(next.class, "wiki-external-link");
  }
  return next;
}

function protectTopdataComments(html) {
  const comments = [];
  const protectedHtml = String(html || "").replace(TOPDATA_COMMENT_REGEX, function (comment) {
    const token = `${TOPDATA_COMMENT_TOKEN_PREFIX}${comments.length}__`;
    comments.push(comment);
    return token;
  });
  return { protectedHtml, comments };
}

function restoreTopdataComments(html, comments) {
  let restored = String(html || "");
  comments.forEach(function (comment, index) {
    restored = restored.replace(`${TOPDATA_COMMENT_TOKEN_PREFIX}${index}__`, comment);
  });
  return restored;
}

function sanitizeWithTopdataComments(html, options) {
  const protectedContent = protectTopdataComments(html);
  return restoreTopdataComments(sanitizeHtml(protectedContent.protectedHtml, options).trim(), protectedContent.comments);
}

function isInfoboxOpeningTag(tagName, source) {
  const classMatch = String(source || "").match(/\bclass\s*=\s*(["'])([^"']*)\1/i);
  const hasInfoboxClass = !!(classMatch && classMatch[2].split(/\s+/).includes("wiki-infobox"));
  return tagName === "aside" && (
    /\bdata-wiki-node\s*=\s*(["'])infobox\1/i.test(source) ||
    hasInfoboxClass
  );
}

function isTableOpeningTag(tagName) {
  return tagName === "table";
}

function getTopLevelSegments(html) {
  const source = String(html || "");
  const tagRe = /<!--[\s\S]*?-->|<\/?\s*([a-zA-Z][\w:-]*)([^>]*)>/g;
  const segments = [];
  const stack = [];
  let cursor = 0;
  let current = null;
  let match;

  while ((match = tagRe.exec(source))) {
    const fullTag = match[0];
    const tagName = match[1] ? match[1].toLowerCase() : "";
    if (!tagName) {
      continue;
    }

    const closing = /^<\//.test(fullTag);
    const selfClosing = /\/\s*>$/.test(fullTag) || VOID_TAGS.has(tagName);

    if (!closing) {
      if (!stack.length) {
        if (match.index > cursor) {
          segments.push({ html: source.slice(cursor, match.index), infobox: false, table: false });
        }
        current = {
          start: match.index,
          infobox: isInfoboxOpeningTag(tagName, fullTag),
          table: isTableOpeningTag(tagName)
        };
      }
      if (!selfClosing) {
        stack.push(tagName);
      } else if (!stack.length && current) {
        segments.push({
          html: source.slice(current.start, tagRe.lastIndex),
          infobox: current.infobox,
          table: current.table
        });
        cursor = tagRe.lastIndex;
        current = null;
      }
      continue;
    }

    const stackIndex = stack.lastIndexOf(tagName);
    if (stackIndex !== -1) {
      stack.splice(stackIndex);
    }
    if (!stack.length && current) {
      segments.push({
        html: source.slice(current.start, tagRe.lastIndex),
        infobox: current.infobox,
        table: current.table
      });
      cursor = tagRe.lastIndex;
      current = null;
    }
  }

  if (cursor < source.length) {
    segments.push({ html: source.slice(cursor), infobox: false, table: false });
  }
  return segments;
}

function isIgnorableTopLevelSegment(segment) {
  return !String(segment.html || "").replace(/<!--[\s\S]*?-->/g, "").trim();
}

function hoistTopLevelInfoboxes(html) {
  const source = String(html || "");
  if (!/<aside\b/i.test(source) || !/wiki-infobox|data-wiki-node\s*=\s*(["'])infobox\1/i.test(source)) {
    return source;
  }

  const segments = getTopLevelSegments(source);
  if (!segments.some((segment) => segment.infobox)) {
    return source;
  }

  const leading = [];
  const restStart = segments.findIndex((segment) => {
    if (segment.infobox) {
      return true;
    }
    if (isIgnorableTopLevelSegment(segment)) {
      leading.push(segment);
      return false;
    }
    return true;
  });
  const rest = segments.slice(restStart === -1 ? segments.length : restStart);
  const infoboxes = rest.filter((segment) => segment.infobox);
  const nonInfoboxes = rest.filter((segment) => !segment.infobox);
  return leading.concat(infoboxes, nonInfoboxes).map((segment) => segment.html).join("").trim();
}

function wrapTopLevelTables(html) {
  const source = String(html || "");
  if (!/<table\b/i.test(source)) {
    return source;
  }

  return getTopLevelSegments(source).map((segment) => {
    if (!segment.table) {
      return segment.html;
    }
    return `<div class="tableWrapper">${segment.html}</div>`;
  }).join("").trim();
}

function transformReadOnlyInertLink(tagName, attribs) {
  if (attribs["data-wiki-entity"]) {
    return sanitizeWikiEntitySpan(tagName, attribs);
  }

  const href = attribs["data-wiki-link-href"];
  if (!href) {
    return {
      tagName,
      attribs
    };
  }

  if (!isSafeLinkHref(href)) {
    const next = { ...attribs };
    delete next["data-wiki-link-href"];
    delete next["data-wiki-link-target"];
    delete next["data-wiki-link-rel"];
    return {
      tagName,
      attribs: next
    };
  }

  const next = {
    href
  };
  if (attribs["data-wiki-link-target"]) {
    next.target = attribs["data-wiki-link-target"];
  }
  next.rel = attribs["data-wiki-link-rel"] || "noopener noreferrer";
  if (attribs.title) {
    next.title = attribs.title;
  }

  return {
    tagName: "a",
    attribs: withReadOnlyLinkAttributes(next)
  };
}

const READ_ONLY_RENDER_OPTIONS = {
  ...SANITIZE_OPTIONS,
  exclusiveFilter: function removeEmptySpans(frame) {
    return frame.tag === "span" && !String(frame.text || "").trim();
  },
  transformTags: {
    ...SANITIZE_OPTIONS.transformTags,
    a: function transformReadOnlyAnchor(tagName, attribs) {
      return {
        tagName,
        attribs: withReadOnlyLinkAttributes(attribs)
      };
    },
    span: transformReadOnlyInertLink,
    input: function transformReadOnlyInput(tagName, attribs) {
      const next = { ...attribs };
      if (String(next.type || "").toLowerCase() === "checkbox") {
        next.disabled = "disabled";
      }
      return {
        tagName,
        attribs: next
      };
    }
  }
};

function sanitizeWikiHtml(html) {
  return hoistTopLevelInfoboxes(sanitizeWithTopdataComments(html, SANITIZE_OPTIONS));
}

function normalizeMigratedHtmlEntities(html) {
  return String(html || "").replace(/&amp;amp;/gi, "&amp;");
}

function renderReadOnlyWikiHtml(html) {
  const normalized = normalizeMigratedHtmlEntities(html);
  return highlightReadOnlyCodeBlocks(wrapTopLevelTables(hoistTopLevelInfoboxes(sanitizeWithTopdataComments(normalized, READ_ONLY_RENDER_OPTIONS))));
}

function hasMeaningfulWikiHtml(html) {
  const normalized = String(html || "").trim();
  if (!normalized) {
    return false;
  }

  const textOnly = sanitizeHtml(normalized, {
    allowedTags: [],
    allowedAttributes: {}
  })
    .replace(/\u00a0/g, " ")
    .trim();

  if (textOnly) {
    return true;
  }

  return /<(?:img|hr|table|ul|ol|blockquote|pre|input)\b/i.test(normalized);
}

module.exports = {
  sanitizeWikiHtml,
  renderReadOnlyWikiHtml,
  hasMeaningfulWikiHtml
};
