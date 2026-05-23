"use strict";

const categories = require.main.require("./src/categories");
const helpers = require.main.require("./src/controllers/helpers");
const groups = require.main.require("./src/groups");
const user = require.main.require("./src/user");

const config = require("../config");
const wikiPathMigration = require("../wiki-path-migration");
const wikiPaths = require("../wiki-paths");

const Controllers = {};

async function assertAdministrator(req, res) {
  if (await user.isAdministrator(req.uid)) {
    return true;
  }

  helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  return false;
}

async function sendMigrationReport(req, res, buildReport) {
  if (!await assertAdministrator(req, res)) {
    return;
  }

  try {
    const report = await buildReport();
    return helpers.formatApiResponse(200, res, report);
  } catch (err) {
    return helpers.formatApiResponse(500, res, err);
  }
}

Controllers.renderAdminPage = async function (req, res) {
  const settings = await config.getSettings();
  const setupDiagnostics = await wikiPaths.getNamespaceSetupDiagnostics();
  const categoryOptions = await categories.buildForSelectAll(["description", "slug", "depth"]);
  const groupList = await groups.getNonPrivilegeGroups("groups:createtime", 0, -1, { ephemeral: false });
  const selectedGroupNames = new Set(settings.wikiNamespaceCreateGroups);

  res.render("admin/plugins/westgate-wiki", {
    title: "Westgate Wiki",
    categoryIds: settings.categoryIdsText,
    homeTopicId: settings.homeTopicIdText,
    routeRootCid: settings.routeRootCidText,
    includeChildCategories: settings.includeChildCategories,
    hasSetupErrors: setupDiagnostics.hasSetupErrors,
    hasNamespaceCollisions: setupDiagnostics.namespaceCollisions.length > 0,
    namespaceCollisions: setupDiagnostics.namespaceCollisions.map((collision) => ({
      ...collision,
      categoriesText: collision.categories.map((category) => `#${category.cid} ${category.name}`).join(", ")
    })),
    hasReservedNamespacePaths: setupDiagnostics.reservedNamespacePaths.length > 0,
    reservedNamespacePaths: setupDiagnostics.reservedNamespacePaths,
    wikiNamespaceCreateGroups: settings.wikiNamespaceCreateGroupsText,
    categoryOptions: categoryOptions.map((category) => ({
      cid: category.cid,
      name: category.name,
      description: category.description,
      slug: category.slug,
      depth: category.depth || 0,
      isSelected: settings.categoryIds.includes(parseInt(category.cid, 10))
    })),
    groupOptions: (groupList || []).filter((g) => g && g.name).map((g) => ({
      name: g.name,
      displayName: g.displayName || g.name,
      isSelected: selectedGroupNames.has(g.name)
    }))
  });
};

Controllers.scanWikiPathMigrationReport = async function (req, res) {
  return sendMigrationReport(req, res, wikiPathMigration.scanRuntime);
};

Controllers.prepareWikiPathMigrationReport = async function (req, res) {
  return sendMigrationReport(req, res, wikiPathMigration.prepareRuntime);
};

Controllers.applyWikiPathMigration = async function (req, res) {
  return sendMigrationReport(req, res, wikiPathMigration.applyRuntime);
};

Controllers.verifyWikiPathMigration = async function (req, res) {
  return sendMigrationReport(req, res, wikiPathMigration.verifyRuntime);
};

module.exports = Controllers;
