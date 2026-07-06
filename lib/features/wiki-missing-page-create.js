"use strict";

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

function titleCaseSlug(value) {
  return String(value || "")
    .split(" ")
    .map((word) => {
      if (!word) {
        return "";
      }
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function titleFromPageSlug(pageSlug) {
  const decoded = safeDecodeURIComponent(String(pageSlug || "").trim());
  const spaced = decoded
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) {
    return "";
  }

  return /[A-Z]/.test(spaced) ? spaced : titleCaseSlug(spaced);
}

module.exports = {
  titleFromPageSlug
};
