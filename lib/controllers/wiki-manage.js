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
const wikiRevisionActions = require("../pages/wiki-revision-actions");
const wikiRevisionPermissions = require("../pages/wiki-revision-permissions");
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

function serializeRow(topic, slugLeafCounts, viewer, canHardPurge) {
  const slugLeaf = wikiPaths.getTopicSlugLeaf(topic);
  const deleted = !!parseInt(topic.deleted, 10);
  const scheduled = !!parseInt(topic.scheduled, 10);
  const tombstoned = wikiTombstones.isTombstonedTopic(topic);
  const collision = !!slugLeaf && !deleted && !scheduled && !tombstoned && slugLeafCounts.get(slugLeaf) > 1;
  // the wiki home topic can never be tombstoned (topic-service forces
  // canDeleteWikiPage=false for it), so do not offer a guaranteed 403
  const isHomeTopic = viewer.homeTopicId > 0 && toPositiveInt(topic.tid) === viewer.homeTopicId;
  // "staged for removal": what a purge of this namespace would take. The wiki
  // home page is excluded from tombstone, restore, and purge alike.
  const staged = tombstoned && !isHomeTopic;
  const canPurge = canHardPurge && staged;
  let purgeUnavailableReason = "";
  if (canHardPurge && !canPurge) {
    purgeUnavailableReason = isHomeTopic ?
      "The wiki home page cannot be purged." :
      "Tombstone this page before it can be purged.";
  }

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
    canTombstone: !tombstoned && !isHomeTopic,
    canRestore: tombstoned && !isHomeTopic,
    canPurge,
    tombstonedFlag: tombstoned ? "1" : "0",
    // The client re-derives "staged" as tombstoned && stageableFlag after each
    // click, so the counts stay live without a reload.
    stageableFlag: isHomeTopic ? "0" : "1",
    purgeUnavailableReason,
    // A row action button doubles as the explanation of why purge is not
    // offered yet; the home page has no button, so it says it in the row.
    actionTitle: purgeUnavailableReason || (tombstoned ?
      "Bring this page back into the wiki" :
      "Hide this page. Tombstoned pages can be purged in bulk."),
    showPurgeUnavailableReason: isHomeTopic && !!purgeUnavailableReason
  };
}

async function serializeNamespace(category, depth, viewer) {
  const cid = toPositiveInt(category.cid);
  const canHardPurge = await wikiRevisionPermissions.canHardPurge(cid, viewer.uid);
  const rawRows = await wikiDirectory.getRawTopicRows(cid);
  const liveRows = rawRows.filter((topic) => !wikiTombstones.isTombstonedTopic(topic));
  const slugLeafCounts = wikiPaths.getTopicSlugLeafCounts(liveRows);
  const rows = rawRows.map((topic) => serializeRow(topic, slugLeafCounts, viewer, canHardPurge));
  // Counted for every manager, not just those who may purge: a maintainer
  // still wants to see how much is staged.
  const tombstonedCount = rows.filter((row) => row.tombstoned && row.stageableFlag === "1").length;

  return {
    cid: category.cid,
    name: category.name || "",
    depth,
    indentRem: depth * 1.5,
    acpUrl: viewer.isAdmin ? `/admin/manage/categories/${cid}` : "",
    rows,
    hasRows: rows.length > 0,
    rowCount: rows.length,
    canHardPurge,
    tombstonedCount,
    hasTombstones: tombstonedCount > 0
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
  const viewer = { isAdmin: !!isAdmin, uid: req.uid, homeTopicId: toPositiveInt(settings.homeTopicId) };
  const namespaces = await Promise.all(
    orderParentFirst(categoryRows).map(({ category, depth }) => serializeNamespace(category, depth, viewer))
  );
  const tombstonedCount = namespaces.reduce((total, namespace) => total + namespace.tombstonedCount, 0);

  return res.render("wiki-manage", {
    title: "Wiki manager | Westgate Wiki",
    hasNamespaces: namespaces.length > 0,
    namespaces,
    canHardPurge: namespaces.some((namespace) => namespace.canHardPurge),
    tombstonedCount,
    hasTombstones: tombstonedCount > 0,
    purgeChunkSize: wikiRevisionActions.BULK_PURGE_MAX_CHUNK
  });
}

module.exports = {
  renderManage
};
