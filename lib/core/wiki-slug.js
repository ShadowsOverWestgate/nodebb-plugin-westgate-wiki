"use strict";

const { slugify } = require("transliteration");

const JOINER_PUNCTUATION = /['"`´‘’‚‛“”„‟‹›«»′″＇＂]/g;
const JOINER_PUNCTUATION_CHARS = new Set(Array.from("'\"`´‘’‚‛“”„‟‹›«»′″＇＂"));
const CANONICAL_TRANSLITERATIONS = {
  "æ": "ae",
  "œ": "oe",
  "ø": "o",
  "ß": "ss",
  "þ": "th",
  "ð": "d",
  "đ": "d",
  "ł": "l",
  "ħ": "h",
  "ı": "i",
  "ŋ": "n",
  "ŧ": "t"
};
const SLUG_OPTIONS = {
  allowedChars: "a-zA-Z0-9",
  lowercase: true,
  separator: "-",
  unknown: ""
};

function decodeHtmlEntities(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|sol);/gi, function (match, entity) {
    const key = String(entity || "").toLowerCase();
    if (key.charAt(0) === "#") {
      const isHex = key.charAt(1) === "x";
      const code = parseInt(isHex ? key.slice(2) : key.slice(1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
      nbsp: " ",
      sol: "/"
    }[key] || match;
  });
}

function slugifyWikiText(value, fallback) {
  const text = decodeHtmlEntities(value)
    .trim()
    .replace(JOINER_PUNCTUATION, "");
  const slug = slugify(text, SLUG_OPTIONS);
  return slug || fallback || "";
}

function isAsciiAlphaNumeric(char) {
  return /^[A-Za-z0-9]$/.test(char);
}

function isCombiningMark(char) {
  return /^\p{Mark}$/u.test(char);
}

function matchTransliterationCase(source, value) {
  const lower = source.toLocaleLowerCase("en-US");
  const upper = source.toLocaleUpperCase("en-US");
  if (lower !== upper && source === upper) {
    return value.length === 1 ? value.toLocaleUpperCase("en-US") : value.charAt(0).toLocaleUpperCase("en-US") + value.slice(1);
  }
  return value;
}

function normalizeCanonicalSegment(value) {
  const text = decodeHtmlEntities(value).trim();
  let canonical = "";
  let lastSeparator = false;

  Array.from(text.normalize("NFKD")).forEach((char) => {
    const transliterated = CANONICAL_TRANSLITERATIONS[char.toLocaleLowerCase("en-US")];
    if (isAsciiAlphaNumeric(char)) {
      canonical += char;
      lastSeparator = false;
    } else if (char === "_") {
      if (canonical && !lastSeparator) {
        canonical += "_";
        lastSeparator = true;
      }
    } else if (isCombiningMark(char)) {
      return;
    } else if (JOINER_PUNCTUATION_CHARS.has(char)) {
      return;
    } else if (transliterated) {
      canonical += matchTransliterationCase(char, transliterated);
      lastSeparator = false;
    } else if (canonical && !lastSeparator) {
      canonical += "_";
      lastSeparator = true;
    }
  });

  canonical = canonical.replace(/^_+|_+$/g, "");

  return {
    canonical,
    foldedKey: canonical.replace(/_/g, " ").toLocaleLowerCase("en-US"),
    error: canonical ? "" : "empty-segment"
  };
}

function getSlugLeaf(slug) {
  const parts = String(slug || "").split("/").map((segment) => segment.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

module.exports = {
  getSlugLeaf,
  decodeHtmlEntities,
  normalizeCanonicalSegment,
  slugifyWikiText
};
