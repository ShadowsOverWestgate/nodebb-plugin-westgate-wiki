"use strict";

const serializer = require("../core/serializer");
const topicService = require("../read/topic-service");
const wikiBreadcrumbTrail = require("../tree/wiki-breadcrumb-trail");
const wikiRevisionPermissions = require("../pages/wiki-revision-permissions");
const wikiRevisions = require("../pages/wiki-revisions");
const wikiTombstones = require("../pages/wiki-tombstones");

function getNodebb() {
  return {
    helpers: require.main.require("./src/controllers/helpers")
  };
}

function toPositiveInt(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && Number.isSafeInteger(value) && value > 0 ? value : 0;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

function stripRawRevisionFields(revision) {
  if (!revision) {
    return null;
  }
  const { patch, checkpointSource, ...summary } = revision;
  return summary;
}

function decorateRevision(summary, index) {
  const timestamp = parseInt(summary && summary.timestamp, 10) || 0;
  return {
    ...summary,
    isLatest: index === 0,
    actionLabel: String(summary && summary.action || "edit").replace(/-/g, " "),
    timestampISO: timestamp ? new Date(timestamp).toISOString() : "",
    hasRestoreSourceRevisionId: !!(summary && summary.restoreSourceRevisionId)
  };
}

async function listRevisionSummaries(tid) {
  const rows = typeof wikiRevisions.listRevisionSummaries === "function" ?
    await wikiRevisions.listRevisionSummaries(tid) :
    await wikiRevisions.listRevisions(tid);

  return (Array.isArray(rows) ? rows : [])
    .map(stripRawRevisionFields)
    .filter(Boolean)
    .map(decorateRevision);
}

function getPageTitle(page) {
  // titlePath/titleRaw are unescaped and Benchpress does not escape {pageTitle},
  // so escape the raw-derived display; fall back to core-escaped topic.title as-is
  // (escaping it again would double-encode, e.g. `<b>` -> `&lt;b&gt;`)
  const display = serializer.getTitleDisplay(page.pageTitlePath, page.topic && page.topic.titleRaw);
  if (display) {
    return serializer.escapeTitleHTML(display);
  }
  return (page.topic && page.topic.title) || "Wiki Page";
}

function getReturnPath(page) {
  return String(
    page.topic && page.topic.wikiPath ||
    page.category && page.category.wikiPath ||
    "/wiki"
  );
}

async function renderHistory(req, res, next) {
  const { helpers } = getNodebb();
  const tid = toPositiveInt(req.params && req.params.tid);

  if (!tid) {
    return next();
  }

  try {
    const page = await topicService.getWikiPage(tid, req.uid, { includeTombstoned: true });
    if (page.status === "forbidden") {
      return helpers.notAllowed(req, res);
    }
    if (page.status !== "ok") {
      return next();
    }

    const cid = toPositiveInt(page.topic && page.topic.cid);
    if (!cid) {
      return next();
    }
    if (!(await wikiRevisionPermissions.canViewHistory(cid, req.uid))) {
      return helpers.notAllowed(req, res);
    }

    const canRestoreWikiRevision = await wikiRevisionPermissions.canRestore(cid, req.uid);
    const tombstone = wikiTombstones.getTombstoneFromFields(page.topic) || await wikiTombstones.getTombstone(tid);
    const isWikiTombstoned = !!tombstone;
    const canHardPurgeWikiTombstone = isWikiTombstoned && await wikiRevisionPermissions.canHardPurge(cid, req.uid);
    const revisions = await listRevisionSummaries(tid);
    const pageTitle = getPageTitle(page);
    const returnPath = getReturnPath(page);

    return res.render("wiki-history", {
      title: `History: ${pageTitle} | Westgate Wiki`,
      ...wikiBreadcrumbTrail.forArticleView(page),
      topic: page.topic,
      category: page.category,
      pageTitle,
      revisions,
      hasRevisions: revisions.length > 0,
      canRestoreWikiRevision: !!canRestoreWikiRevision,
      canHardPurgeWikiTombstone: !!canHardPurgeWikiTombstone,
      isWikiTombstoned,
      returnPath,
      wikiPath: String(page.topic && page.topic.wikiPath || returnPath),
      categoryWikiPath: String(page.category && page.category.wikiPath || "/wiki")
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  renderHistory
};
