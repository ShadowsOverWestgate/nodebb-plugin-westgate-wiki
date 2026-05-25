"use strict";

const privileges = require.main.require("./src/privileges");

const WIKI_HISTORY = "wiki:history";
const WIKI_RESTORE = "wiki:restore";
const WIKI_HARD_PURGE = "wiki:hard-purge";

function addCategoryPrivileges(payload) {
  const map = payload && payload.privileges;
  if (!map || typeof map.set !== "function") {
    return payload;
  }

  map.set(WIKI_HISTORY, { label: "Wiki: view revision history", type: "moderation" });
  map.set(WIKI_RESTORE, { label: "Wiki: restore revisions", type: "moderation" });
  map.set(WIKI_HARD_PURGE, { label: "Wiki: hard purge tombstones", type: "moderation" });
  return payload;
}

async function can(privilege, cid, uid) {
  return !!(await privileges.categories.can(privilege, cid, uid));
}

module.exports = {
  WIKI_HISTORY,
  WIKI_RESTORE,
  WIKI_HARD_PURGE,
  addCategoryPrivileges,
  canViewHistory: (cid, uid) => can(WIKI_HISTORY, cid, uid),
  canRestore: (cid, uid) => can(WIKI_RESTORE, cid, uid),
  canHardPurge: (cid, uid) => can(WIKI_HARD_PURGE, cid, uid)
};
