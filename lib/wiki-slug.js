"use strict";

const { slugify } = require("transliteration");

const JOINER_PUNCTUATION = /['"`´‘’‚‛“”„‟‹›«»′″＇＂]/g;
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

module.exports = {
  decodeHtmlEntities,
  slugifyWikiText
};
