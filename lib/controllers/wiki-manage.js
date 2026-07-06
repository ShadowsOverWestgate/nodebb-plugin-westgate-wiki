"use strict";

const categories = require.main.require("./src/categories");
const helpers = require.main.require("./src/controllers/helpers");
const privileges = require.main.require("./src/privileges");
const user = require.main.require("./src/user");
const utils = require.main.require("./src/utils");

const config = require("../core/config");
const wikiDirectory = require("../tree/wiki-directory-service");
const wikiNamespaceCreators = require("../features/wiki-namespace-creators");
const wikiPaths = require("../tree/wiki-paths");
const wikiTombstones = require("../pages/wiki-tombstones");

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function orderParentFirst(categoryRows) {
  const effectiveCids = new Set(categoryRows.map((category) => toPositiveInt(category.cid)).filter(Boolean));
  const byParent = new Map();
  categoryRows.forEach((category) => {
    const parentCid = toPositiveInt(category.parentCid);
    const rows = byParent.get(parentCid) || [];
    rows.push(category);
    byParent.set(parentCid, rows);
  });

  const ordered = [];
  const seen = new Set();
  const visit = (category, depth) => {
    const cid = toPositiveInt(category && category.cid);
    if (!cid || seen.has(cid)) {
      return;
    }
    seen.add(cid);
    ordered.push({ category, depth });
    (byParent.get(cid) || []).forEach((child) => visit(child, depth + 1));
  };

  categoryRows
    .filter((category) => !effectiveCids.has(toPositiveInt(category.parentCid)))
    .forEach((category) => visit(category, 0));
  categoryRows.forEach((category) => visit(category, 0));

  return ordered;
}

function serializeRow(topic, slugLeafCounts, viewer) {
  const slugLeaf = wikiPaths.getTopicSlugLeaf(topic);
  const deleted = !!parseInt(topic.deleted, 10);
  const scheduled = !!parseInt(topic.scheduled, 10);
  const tombstoned = wikiTombstones.isTombstonedTopic(topic);
  const collision = !!slugLeaf && !deleted && !scheduled && !tombstoned && slugLeafCounts.get(slugLeaf) > 1;
  // the wiki home topic can never be tombstoned (topic-service forces
  // canDeleteWikiPage=false for it), so do not offer a guaranteed 403
  const isHomeTopic = viewer.homeTopicId > 0 && toPositiveInt(topic.tid) === viewer.homeTopicId;

  return {
    tid: topic.tid,
    title: topic.title || "",
    slugLeaf,
    topicUrl: topic.slug ? `/topic/${topic.slug}` : `/topic/${topic.tid}`,
    historyUrl: topic.tid ? `/wiki/history/${topic.tid}` : "",
    postcount: topic.postcount,
    timestampISO: topic.timestamp ? utils.toISOString(topic.timestamp) : "",
    deleted,
    scheduled,
    tombstoned,
    collision,
    canTombstone: !tombstoned && !isHomeTopic
  };
}

async function serializeNamespace(category, depth, viewer) {
  const cid = toPositiveInt(category.cid);
  const rawRows = await wikiDirectory.getRawTopicRows(cid);
  const liveRows = rawRows.filter((topic) => !wikiTombstones.isTombstonedTopic(topic));
  const slugLeafCounts = wikiPaths.getTopicSlugLeafCounts(liveRows);
  const rows = rawRows.map((topic) => serializeRow(topic, slugLeafCounts, viewer));

  return {
    cid: category.cid,
    name: category.name || "",
    depth,
    indentRem: depth * 1.5,
    acpUrl: viewer.isAdmin ? `/admin/manage/categories/${cid}` : "",
    rows,
    hasRows: rows.length > 0,
    rowCount: rows.length
  };
}

async function renderManage(req, res) {
  const [settings, isAdmin] = await Promise.all([
    config.getSettings(),
    user.isAdministrator(req.uid)
  ]);
  const isManager = isAdmin ||
    await wikiNamespaceCreators.isWikiNamespaceCreator(req.uid, settings.wikiNamespaceCreateGroups);
  if (!isManager) {
    return helpers.notAllowed(req, res);
  }

  const categoryRows = (await Promise.all(
    (settings.effectiveCategoryIds || []).map(async (cid) => {
      const category = await categories.getCategoryData(cid);
      if (!category) {
        return null;
      }
      if (!isAdmin) {
        const catPriv = await privileges.categories.get(toPositiveInt(cid), req.uid);
        if (!catPriv || !catPriv.read || !catPriv["topics:read"]) {
          return null;
        }
      }
      return category;
    })
  )).filter(Boolean);
  const viewer = { isAdmin: !!isAdmin, homeTopicId: toPositiveInt(settings.homeTopicId) };
  const namespaces = await Promise.all(
    orderParentFirst(categoryRows).map(({ category, depth }) => serializeNamespace(category, depth, viewer))
  );

  return res.render("wiki-manage", {
    title: "Wiki manager | Westgate Wiki",
    hasNamespaces: namespaces.length > 0,
    namespaces
  });
}

module.exports = {
  renderManage
};
