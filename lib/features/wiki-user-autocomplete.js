"use strict";

const helpers = require.main.require("./src/controllers/helpers");
const user = require.main.require("./src/user");
const privileges = require.main.require("./src/privileges");

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

function clampLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function normalizeQuery(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function normalizeUser(row, sourceName) {
  if (!row) {
    return null;
  }
  const username = row.username || row.displayname || sourceName || row.userslug;
  const userslug = row.userslug || sourceName || username;
  if (!username || !userslug) {
    return null;
  }
  return {
    uid: row.uid || "",
    username,
    userslug,
    displayName: row.displayname || username,
    insertText: `@${username}`
  };
}

function extractRows(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (!result || typeof result !== "object") {
    return [];
  }
  const candidates = [
    result.users,
    result.results,
    result.matches,
    result.data,
    result.response && result.response.users
  ];
  let firstArray = null;
  for (const rows of candidates) {
    if (Array.isArray(rows)) {
      firstArray = firstArray || rows;
      if (rows.length) {
        return rows;
      }
    }
  }
  return firstArray || [];
}

async function tryUserSearch(call) {
  try {
    return extractRows(await call());
  } catch (err) {
    return [];
  }
}

async function searchUsers(q, limit) {
  if (typeof user.search !== "function") {
    return [];
  }

  const attempts = [
    () => user.search(q, { paginate: false, limit }),
    () => user.search({ query: q, searchBy: "username", paginate: false, limit }),
    () => user.search({ term: q, searchBy: "username", paginate: false, limit }),
    () => user.search({ search: q, searchBy: "username", paginate: false, limit })
  ];

  for (const attempt of attempts) {
    const rows = await tryUserSearch(attempt);
    if (rows.length) {
      return rows;
    }
  }
  return [];
}

async function getUserBySlug(query) {
  if (!query || typeof user.getUidByUserslug !== "function") {
    return null;
  }
  const uid = await user.getUidByUserslug(query.toLowerCase());
  const parsedUid = parseInt(uid, 10);
  if (!Number.isInteger(parsedUid) || parsedUid <= 0) {
    return null;
  }
  if (typeof user.getUserFields === "function") {
    return normalizeUser(await user.getUserFields(parsedUid, ["uid", "username", "userslug", "displayname"]), query);
  }
  if (typeof user.getUserData === "function") {
    return normalizeUser(await user.getUserData(parsedUid), query);
  }
  return normalizeUser({ uid: parsedUid, username: query, userslug: query }, query);
}

async function search(options) {
  const q = normalizeQuery(options && options.q);
  const limit = clampLimit(options && options.limit);
  if (!q) {
    return [];
  }

  const rows = await searchUsers(q, limit);
  const results = rows.map((row) => normalizeUser(row, q)).filter(Boolean);
  const exact = await getUserBySlug(q);
  if (exact && !results.some((row) => parseInt(row.uid, 10) === parseInt(exact.uid, 10))) {
    results.unshift(exact);
  }
  return results.slice(0, limit);
}

async function apiSearch(req, res) {
  // Same gate NodeBB core puts on /api/users: without it, this endpoint leaks
  // the full username/userslug/uid list to anyone (guests included).
  const canSearch = await privileges.global.can("search:users", req.uid);
  if (!canSearch) {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }
  const results = await search({
    q: req.query && req.query.q,
    limit: req.query && req.query.limit
  });
  return helpers.formatApiResponse(200, res, { results });
}

module.exports = {
  apiSearch,
  search
};
