"use strict";

const utils = require.main.require("./src/utils");
const helpers = require.main.require("./src/controllers/helpers");
const privileges = require.main.require("./src/privileges");

const config = require("../core/config");
const wikiLinkAutocomplete = require("../content/wiki-link-autocomplete");

function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function searchNamespaceTopics(req, res) {
  const cid = parseInt(req.params.cid, 10);
  const q = normalizeQuery(req.query && req.query.q);

  if (!utils.isNumber(cid) || cid <= 0) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  const settings = await config.getSettings();

  if (!settings.isConfigured || !settings.effectiveCategoryIds.includes(cid)) {
    return helpers.formatApiResponse(404, res, new Error("[[error:not-found]]"));
  }

  const canRead = await privileges.categories.can("topics:read", cid, req.uid);

  if (!canRead) {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }

  const matches = await wikiLinkAutocomplete.search({
    q,
    cid,
    context: "wiki",
    scope: "current-namespace",
    limit: 25,
    uid: req.uid
  });

  return helpers.formatApiResponse(200, res, {
    topics: matches.filter((result) => result.type === "page")
  });
}

module.exports = {
  searchNamespaceTopics
};
