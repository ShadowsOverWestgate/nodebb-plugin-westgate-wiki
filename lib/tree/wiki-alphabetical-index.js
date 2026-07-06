"use strict";

function normalizeSortKey(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function letterBucket(sortKey) {
  if (!sortKey) {
    return "#";
  }
  const ch = sortKey.charAt(0);
  if (ch >= "a" && ch <= "z") {
    return ch.toUpperCase();
  }
  return "#";
}

function letterAnchor(letter) {
  return letter === "#" ? "sym" : letter.toLowerCase();
}

function compareLetters(a, b) {
  if (a === "#" && b !== "#") {
    return 1;
  }
  if (b === "#" && a !== "#") {
    return -1;
  }
  return a.localeCompare(b);
}

function buildPageLetterGroups(topics = []) {
  const items = topics.map((t) => {
    const sortKey = normalizeSortKey(t.titleLeaf || t.title);
    return {
      kind: "page",
      isNamespace: false,
      isPage: true,
      sortKey,
      displayTitle: t.titleLeaf || t.title,
      wikiPath: t.wikiPath,
      hasWikiPath: !!t.wikiPath,
      topicPath: t.topicPath,
      replyCount: t.replyCount,
      hasParentPath: t.hasParentPath,
      parentTitlePathText: t.parentTitlePathText,
      titleLeaf: t.titleLeaf,
      hasDescription: false,
      description: ""
    };
  });

  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }));

  const byLetter = new Map();
  for (const entry of items) {
    const letter = letterBucket(entry.sortKey);
    if (!byLetter.has(letter)) {
      byLetter.set(letter, []);
    }
    byLetter.get(letter).push(entry);
  }

  const letters = Array.from(byLetter.keys()).sort(compareLetters);

  return letters.map((letter) => ({
    letter,
    letterLabel: letter === "#" ? "#" : letter,
    letterAnchor: letterAnchor(letter),
    entries: byLetter.get(letter)
  }));
}

/**
 * Child namespaces: flat alphabetical list (no A–Z headings).
 * Wiki pages: alphabetical within A–Z (and #) letter groups.
 *
 * @param {Array<object>} childSections - links with articleCount
 * @param {Array<object>} topics - serialized topic summaries
 * @returns {{ namespaces: Array<object>, pageLetterGroups: Array<object> }}
 */
function buildSectionContentsIndex(childSections = [], topics = []) {
  const namespaces = childSections
    .map((ns) => {
      const sortKey = normalizeSortKey(ns.name);
      const articleCount = Math.max(0, parseInt(ns.articleCount, 10) || 0);
      return {
        sortKey,
        displayTitle: ns.name,
        wikiPath: ns.wikiPath,
        hasWikiPath: !!ns.wikiPath,
        hasDescription: !!(ns.description && String(ns.description).trim()),
        description: ns.description || "",
        articleCount,
        articleCountLabel: articleCount === 1 ? "1 article" : `${articleCount} articles`
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }));

  const pageLetterGroups = buildPageLetterGroups(topics);

  return {
    namespaces,
    pageLetterGroups
  };
}

module.exports = {
  buildSectionContentsIndex
};
