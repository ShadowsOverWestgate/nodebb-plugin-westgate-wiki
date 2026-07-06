"use strict";

const user = require.main.require("./src/user");
const groups = require.main.require("./src/groups");

const config = require("../core/config");

/**
 * @param {number} uid
 * @param {string[]} wikiNamespaceCreateGroupNames normalized canonical group names from plugin settings
 * @returns {Promise<boolean>}
 */
async function isWikiNamespaceCreator(uid, wikiNamespaceCreateGroupNames) {
  if (!uid || uid <= 0) {
    return false;
  }

  if (await user.isAdministrator(uid)) {
    return true;
  }

  if (!Array.isArray(wikiNamespaceCreateGroupNames) || wikiNamespaceCreateGroupNames.length === 0) {
    return false;
  }

  const membership = await groups.isMemberOfGroups(uid, wikiNamespaceCreateGroupNames);
  return membership.some(Boolean);
}

async function getCanCreateWikiNamespaces(uid) {
  const settings = await config.getSettings();
  return isWikiNamespaceCreator(uid, settings.wikiNamespaceCreateGroups);
}

module.exports = {
  getCanCreateWikiNamespaces,
  isWikiNamespaceCreator
};
