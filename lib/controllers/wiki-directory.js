"use strict";

const helpers = require.main.require("./src/controllers/helpers");

const wikiDirectory = require("../wiki-directory-service");

async function getNamespacePages(req, res) {
  const cid = parseInt(req.params.cid, 10);
  const result = await wikiDirectory.getDirectoryWindow(cid, req.uid, {
    limit: req.query && req.query.limit,
    after: req.query && req.query.after,
    q: req.query && req.query.q,
    letter: req.query && req.query.letter,
    aroundTid: req.query && req.query.aroundTid,
    pinHomeTopic: req.query && (req.query.nav === "1" || req.query.nav === "true")
  });

  if (result.status === "forbidden") {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }
  if (result.status === "not-wiki" || result.status === "invalid") {
    return helpers.formatApiResponse(404, res, new Error("[[error:not-found]]"));
  }

  return helpers.formatApiResponse(200, res, {
    cid: result.cid,
    namespacePath: result.namespacePath,
    pages: result.pages,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
    total: result.total,
    totalInNamespace: result.totalInNamespace
  });
}

module.exports = {
  getNamespacePages
};
