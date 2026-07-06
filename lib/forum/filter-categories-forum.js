"use strict";

const config = require("../core/config");
const helpers = require.main.require("./src/controllers/helpers");

function toWikiCidSet(effectiveCategoryIds) {
  const s = new Set();
  (effectiveCategoryIds || []).forEach((id) => {
    const n = parseInt(id, 10);
    if (Number.isInteger(n) && n > 0) {
      s.add(n);
    }
  });
  return s;
}

function isPositiveCid(cat) {
  if (!cat || cat.cid === undefined || cat.cid === null) {
    return false;
  }
  const cid = parseInt(cat.cid, 10);
  return Number.isInteger(cid) && cid > 0;
}

/**
 * Remove wiki namespace categories from the forum category tree (home and
 * `/categories`): no configured wiki cid appears as a row, and descendants
 * are stripped from any remaining parent's `children`. Wiki surfaces stay at
 * `/wiki` and `/wiki/category/...`.
 */
function stripChildrenArray(children, wikiCidSet) {
  if (!Array.isArray(children) || !children.length) {
    return children;
  }
  return children
    .filter((cat) => isPositiveCid(cat) && !wikiCidSet.has(parseInt(cat.cid, 10)))
    .map((cat) => {
      if (!Array.isArray(cat.children) || !cat.children.length) {
        return cat;
      }
      return { ...cat, children: stripChildrenArray(cat.children, wikiCidSet) };
    });
}

/**
 * Drop wiki roots from the tree and strip wiki cids from nested `children`.
 */
function stripWikiFromForumCategoryTree(categories, wikiCidSet) {
  if (!Array.isArray(categories) || !categories.length) {
    return categories;
  }
  return categories
    .filter((cat) => isPositiveCid(cat) && !wikiCidSet.has(parseInt(cat.cid, 10)))
    .map((cat) => {
      if (!cat) {
        return cat;
      }
      if (!Array.isArray(cat.children) || !cat.children.length) {
        return cat;
      }
      return { ...cat, children: stripChildrenArray(cat.children, wikiCidSet) };
    });
}

async function filterCategoriesBuild(data) {
  const { templateData } = data || {};
  if (!templateData || !Array.isArray(templateData.categories)) {
    return data;
  }

  const settings = await config.getSettings();
  if (!settings.effectiveCategoryIds || !settings.effectiveCategoryIds.length) {
    return data;
  }

  const wikiCidSet = toWikiCidSet(settings.effectiveCategoryIds);
  templateData.categories = stripWikiFromForumCategoryTree(templateData.categories, wikiCidSet);
  return data;
}

/**
 * NodeBB forum `/category/:id` uses template `category`; redirect wiki
 * namespaces to `/wiki` so the canonical surface is the wiki UI.
 */
async function filterCategoryBuild(data) {
  const { res, templateData } = data || {};
  if (!res || !templateData || templateData.cid === undefined || templateData.cid === null) {
    return data;
  }

  const settings = await config.getSettings();
  if (!settings.effectiveCategoryIds || !settings.effectiveCategoryIds.length) {
    return data;
  }

  const cid = parseInt(templateData.cid, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    return data;
  }

  const wikiCidSet = toWikiCidSet(settings.effectiveCategoryIds);
  if (!wikiCidSet.has(cid)) {
    return data;
  }

  helpers.redirect(res, "/wiki");
  return data;
}

module.exports = {
  filterCategoriesBuild,
  filterCategoryBuild
};
