"use strict";

const nconf = require.main.require("nconf");
const api = require.main.require("./src/controllers/api");
const categories = require.main.require("./src/categories");
const helpers = require.main.require("./src/controllers/helpers");
const config = require("../core/config");
const wikiPaths = require("../tree/wiki-paths");
const wikiNamespaceCreators = require("../features/wiki-namespace-creators");
const wikiService = require("../read/wiki-service");
const wikiBreadcrumbTrail = require("../tree/wiki-breadcrumb-trail");

async function loadForumConfig(req, res) {
  return res.locals.config || await api.loadConfig(req);
}

async function assertCanCreate(uid, settings) {
  return wikiNamespaceCreators.isWikiNamespaceCreator(uid, settings.wikiNamespaceCreateGroups);
}

async function renderChild(req, res, next) {
  const parentCid = req.params.parent_cid;
  const wikiResult = await wikiService.getSection(parentCid, req.uid);

  if (wikiResult.status === "invalid" || wikiResult.status === "not-found" || wikiResult.status === "not-wiki") {
    return next();
  }

  if (wikiResult.status === "forbidden") {
    return helpers.notAllowed(req, res);
  }

  const settings = await config.getSettings();
  if (!(await assertCanCreate(req.uid, settings))) {
    return helpers.notAllowed(req, res);
  }

  const forumConfig = await loadForumConfig(req, res);
  const relativePath = forumConfig.relative_path != null ? forumConfig.relative_path : (nconf.get("relative_path") || "");
  const csrfToken = forumConfig.csrf_token ? String(forumConfig.csrf_token) : "";
  const section = wikiResult.section;
  const trail = wikiBreadcrumbTrail.forNamespaceCreate(section);

  res.render("wiki-namespace-create", {
    title: `Create namespace | ${section.name} | Westgate Wiki`,
    ...trail,
    parentCid: section.cid,
    parentName: section.name,
    wikiNamespaceApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/namespace`,
    csrfToken
  });
}

async function postNamespace(req, res) {
  const settings = await config.getSettings();
  if (!(await assertCanCreate(req.uid, settings))) {
    return await helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }

  const body = req.body || {};
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const parentCid = parseInt(body.parentCid, 10);

  if (!name) {
    return await helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  if (!Number.isInteger(parentCid) || parentCid <= 0) {
    return await helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  const wikiResult = await wikiService.getSection(parentCid, req.uid);
  if (wikiResult.status !== "ok") {
    return await helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  let created;
  try {
    created = await categories.create({
      name,
      description,
      parentCid,
      cloneFromCid: parentCid,
      uid: req.uid
    });
  } catch (err) {
    return await helpers.formatApiResponse(400, res, err);
  }

  const newCid = parseInt(created.cid, 10);
  if (!settings.includeChildCategories) {
    await config.mergeWikiCategoryIdIntoSettings(newCid);
  } else {
    config.invalidateSettingsCache();
  }

  const refreshed = await categories.getCategoryData(newCid);
  const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(refreshed);
  const wikiPath = namespaceInfo.wikiPath || "";

  return await helpers.formatApiResponse(200, res, {
    cid: newCid,
    slug: refreshed.slug,
    wikiPath
  });
}

module.exports = {
  renderChild,
  postNamespace
};
