"use strict";

const nconf = require.main.require("nconf");
const api = require.main.require("./src/controllers/api");
const helpers = require.main.require("./src/controllers/helpers");
const posts = require.main.require("./src/posts");
const privileges = require.main.require("./src/privileges");
const user = require.main.require("./src/user");
const utils = require.main.require("./src/utils");
const config = require("../core/config");
const topicService = require("../read/topic-service");
const wikiEditLocks = require("../pages/wiki-edit-locks");
const wikiService = require("../read/wiki-service");
const wikiBreadcrumbTrail = require("../tree/wiki-breadcrumb-trail");
const wikiArticleCss = require("../content/wiki-article-css");
const composeAssets = require("../core/compose-assets");
const wikiDiscussionSettings = require("../read/wiki-discussion-settings");

function encodePayloadB64(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

async function renderCompose(req, res, next) {
  const cidParam = req.params.cid;
  const wikiResult = await wikiService.getSection(cidParam, req.uid);

  if (wikiResult.status === "invalid" || wikiResult.status === "not-found" || wikiResult.status === "not-wiki") {
    return next();
  }

  if (wikiResult.status === "forbidden") {
    return helpers.notAllowed(req, res);
  }

  if (!wikiResult.section.privileges.canCreatePage) {
    return helpers.notAllowed(req, res);
  }

  const settings = await config.getSettings();
  const setHomeParam = String((req.query && req.query.setHome) || "").toLowerCase();
  const wantSetHome = setHomeParam === "1" || setHomeParam === "true" || setHomeParam === "yes";
  const [isAdmin, isGmod, isCatMod] = await Promise.all([
    user.isAdministrator(req.uid),
    user.isGlobalModerator(req.uid),
    privileges.categories.isAdminOrMod(wikiResult.section.cid, req.uid)
  ]);
  let setAsWikiHome = false;
  if (wantSetHome) {
    if (!settings.homeTopicId) {
      setAsWikiHome = true;
    } else if (isAdmin || isGmod || isCatMod) {
      setAsWikiHome = true;
    }
  }

  let defaultTitle = String((req.query && req.query.title) || "").trim();
  if (!defaultTitle && setAsWikiHome) {
    defaultTitle = "Westgate Wiki";
  }
  const section = wikiResult.section;
  const actionLabel = setAsWikiHome ? "Create wiki homepage" : "Create page";
  const trail = wikiBreadcrumbTrail.forComposeCreate(section, actionLabel);

  // `/api/wiki/compose/...` is registered without buildHeader, so `res.locals.config` may be missing.
  const forumConfig = res.locals.config || await api.loadConfig(req);
  const relativePath = forumConfig.relative_path != null ? forumConfig.relative_path : (nconf.get("relative_path") || "");
  const csrfToken = forumConfig.csrf_token ? String(forumConfig.csrf_token) : "";
  const cacheBuster = forumConfig["cache-buster"] ? String(forumConfig["cache-buster"]) : "";

  const composePayload = {
    mode: "create",
    cid: section.cid,
    defaultTitle,
    setAsWikiHome: !!setAsWikiHome,
    sectionName: section.name,
    sectionWikiPath: section.wikiPath,
    composeCancelHref: section.wikiPath,
    relativePath,
    csrfToken,
    cacheBuster,
    topicsApiUrl: `${relativePath}/api/v3/topics`,
    wikiHomepageApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/homepage`,
    discussionSettingsApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/discussion`,
    articleCssApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/article-css`,
    initialArticleCss: "",
    showDiscussionToggle: false,
    discussionDisabled: false,
    pageTitleCheckUrl: `${relativePath}/api/v3/plugins/westgate-wiki/page-title/check`,
    linkAutocompleteUrl: `${relativePath}/api/v3/plugins/westgate-wiki/link-autocomplete`,
    pageTocUrl: `${relativePath}/api/v3/plugins/westgate-wiki/page-toc`,
    namespaceSearchUrl: `${relativePath}/api/v3/plugins/westgate-wiki/namespace/${section.cid}/search`
  };

  res.render("wiki-compose", {
    title: setAsWikiHome
      ? `Create wiki homepage | ${section.name} | Westgate Wiki`
      : `Create page | ${section.name} | Westgate Wiki`,
    ...trail,
    section,
    defaultTitle,
    composeMode: "create",
    pageHeading: setAsWikiHome ? "Create wiki homepage" : "Create wiki page",
    submitLabel: setAsWikiHome ? "Publish & set as /wiki" : "Publish page",
    showSetHomeBanner: !!setAsWikiHome,
    showDiscussionToggle: false,
    discussionDisabled: false,
    composeAssetVersion: composeAssets.getAssetVersion(),
    composeCancelHref: section.wikiPath,
    composePayloadB64: encodePayloadB64(composePayload)
  });
}

async function renderEdit(req, res, next) {
  const tidParam = req.params.tid;

  if (!utils.isNumber(tidParam)) {
    return next();
  }

  const wikiPage = await topicService.getWikiPage(tidParam, req.uid);

  if (wikiPage.status === "invalid" || wikiPage.status === "not-found" || wikiPage.status === "not-wiki") {
    return next();
  }

  if (wikiPage.status === "forbidden") {
    return helpers.notAllowed(req, res);
  }

  if (!wikiPage.canEditWikiPage) {
    return helpers.notAllowed(req, res);
  }

  const topic = wikiPage.topic;
  const sectionResult = await wikiService.getSection(topic.cid, req.uid);

  if (sectionResult.status !== "ok") {
    return next();
  }

  const section = sectionResult.section;
  const defaultTitle = topic.titleRaw || topic.title;
  const trail = wikiBreadcrumbTrail.forComposeEdit(section, topic);
  const editLock = await wikiEditLocks.acquireLock(topic.tid, req.uid);

  if (editLock.status === "locked") {
    return res.render("wiki-compose", {
      title: `Edit | ${defaultTitle} | Westgate Wiki`,
      ...trail,
      section,
      defaultTitle,
      composeMode: "edit",
      pageHeading: "Edit wiki page",
      editLockBlocked: true,
      editLockMessage: wikiEditLocks.getStatusMessage(editLock),
      composeAssetVersion: composeAssets.getAssetVersion(),
      composeCancelHref: topic.wikiPath || section.wikiPath,
      composePayloadB64: ""
    });
  }

  if (editLock.status !== "ok") {
    return helpers.notAllowed(req, res);
  }

  const initialPostContent = await posts.getPostFields(topic.mainPid, ["content", "sourceContent"]) || {};
  const [discussionDisabled, articleCss] = await Promise.all([
    wikiDiscussionSettings.getDiscussionDisabled(topic.tid),
    wikiArticleCss.getArticleCss(topic.tid)
  ]);

  const forumConfig = res.locals.config || await api.loadConfig(req);
  const relativePath = forumConfig.relative_path != null ? forumConfig.relative_path : (nconf.get("relative_path") || "");
  const csrfToken = forumConfig.csrf_token ? String(forumConfig.csrf_token) : "";
  const cacheBuster = forumConfig["cache-buster"] ? String(forumConfig["cache-buster"]) : "";

  const composePayload = {
    mode: "edit",
    cid: section.cid,
    tid: parseInt(topic.tid, 10),
    mainPid: parseInt(topic.mainPid, 10),
    defaultTitle,
    setAsWikiHome: false,
    initialContent: initialPostContent.sourceContent || initialPostContent.content || "",
    sectionName: section.name,
    sectionWikiPath: section.wikiPath,
    composeCancelHref: topic.wikiPath || section.wikiPath,
    relativePath,
    csrfToken,
    cacheBuster,
    topicsApiUrl: `${relativePath}/api/v3/topics`,
    postEditUrl: `${relativePath}/api/v3/posts/${parseInt(topic.mainPid, 10)}`,
    wikiPageSaveApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/page/save`,
    editLockUrl: `${relativePath}/api/v3/plugins/westgate-wiki/edit-lock`,
    editLockToken: editLock.token,
    editLockTtlMs: editLock.ttlMs,
    wikiHomepageApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/homepage`,
    discussionSettingsApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/discussion`,
    articleCssApiUrl: `${relativePath}/api/v3/plugins/westgate-wiki/article-css`,
    initialArticleCss: articleCss,
    showDiscussionToggle: true,
    discussionDisabled,
    pageTitleCheckUrl: `${relativePath}/api/v3/plugins/westgate-wiki/page-title/check`,
    linkAutocompleteUrl: `${relativePath}/api/v3/plugins/westgate-wiki/link-autocomplete`,
    pageTocUrl: `${relativePath}/api/v3/plugins/westgate-wiki/page-toc`,
    namespaceSearchUrl: `${relativePath}/api/v3/plugins/westgate-wiki/namespace/${section.cid}/search`
  };

  res.render("wiki-compose", {
    title: `Edit | ${defaultTitle} | Westgate Wiki`,
    ...trail,
    section,
    defaultTitle,
    composeMode: "edit",
    pageHeading: "Edit wiki page",
    submitLabel: "Save",
    showSetHomeBanner: false,
    editLockBlocked: false,
    showDiscussionToggle: true,
    discussionDisabled,
    composeAssetVersion: composeAssets.getAssetVersion(),
    composeCancelHref: topic.wikiPath || section.wikiPath,
    composePayloadB64: encodePayloadB64(composePayload)
  });
}

module.exports = {
  renderCompose,
  renderEdit
};
