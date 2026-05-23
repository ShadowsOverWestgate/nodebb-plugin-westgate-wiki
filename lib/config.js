"use strict";

const categories = require.main.require("./src/categories");
const meta = require.main.require("./src/meta");

const SETTINGS_KEY = "westgate-wiki";
const SETTINGS_CACHE_TTL_MS = 30000;
const DEFAULT_SETTINGS = {
  categoryIds: "",
  includeChildCategories: "1",
  homeTopicId: "",
  wikiNamespaceCreateGroups: "",
  routeRootCid: "",
  canonicalPathMigrationVersion: ""
};

let settingsCache = null;
const cacheMetrics = {
  hits: 0,
  misses: 0,
  rebuilds: 0,
  invalidations: 0
};

function normalizeHomeTopicId(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const n = parseInt(String(rawValue), 10);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }

  return n;
}

function normalizeRouteRootCid(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const n = parseInt(String(rawValue), 10);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }

  return n;
}

function parseCategoryIds(rawValue) {
  if (!rawValue) {
    return [];
  }

  return [...new Set(String(rawValue)
    .split(/[\s,]+/)
    .map((value) => parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function parseWikiNamespaceCreateGroupNames(rawValue) {
  if (!rawValue) {
    return [];
  }

  return [...new Set(String(rawValue)
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean))];
}

function normalizeBoolean(rawValue, defaultValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultValue;
  }

  if (rawValue === true || rawValue === "true" || rawValue === "on" || rawValue === "1" || rawValue === 1) {
    return true;
  }

  if (rawValue === false || rawValue === "false" || rawValue === "off" || rawValue === "0" || rawValue === 0) {
    return false;
  }

  return defaultValue;
}

function normalizeSettings(settings = {}) {
  const categoryIds = parseCategoryIds(settings.categoryIds);
  const includeChildCategories = normalizeBoolean(settings.includeChildCategories, true);
  const homeTopicId = normalizeHomeTopicId(settings.homeTopicId);
  const homeTopicIdText = settings.homeTopicId === undefined || settings.homeTopicId === null || settings.homeTopicId === ""
    ? ""
    : String(settings.homeTopicId).trim();
  const wikiNamespaceCreateGroups = parseWikiNamespaceCreateGroupNames(settings.wikiNamespaceCreateGroups);
  const wikiNamespaceCreateGroupsText = settings.wikiNamespaceCreateGroups === undefined || settings.wikiNamespaceCreateGroups === null
    ? ""
    : String(settings.wikiNamespaceCreateGroups).trim();
  const routeRootCid = normalizeRouteRootCid(settings.routeRootCid);
  const routeRootCidText = settings.routeRootCid === undefined || settings.routeRootCid === null || settings.routeRootCid === ""
    ? ""
    : String(settings.routeRootCid).trim();
  const canonicalPathMigrationVersion = settings.canonicalPathMigrationVersion === undefined || settings.canonicalPathMigrationVersion === null
    ? ""
    : String(settings.canonicalPathMigrationVersion).trim();

  return {
    categoryIds,
    categoryIdsText: settings.categoryIds || "",
    includeChildCategories,
    homeTopicId,
    homeTopicIdText,
    wikiNamespaceCreateGroups,
    wikiNamespaceCreateGroupsText,
    routeRootCid,
    routeRootCidText,
    canonicalPathMigrationVersion,
    isConfigured: categoryIds.length > 0
  };
}

async function resolveEffectiveCategoryIds(settings) {
  const explicitCategoryIds = Array.isArray(settings.categoryIds) ? settings.categoryIds : [];

  if (!explicitCategoryIds.length || !settings.includeChildCategories) {
    return explicitCategoryIds;
  }

  const descendantIds = await Promise.all(
    explicitCategoryIds.map(async (cid) => {
      const children = await categories.getChildrenCids(cid);
      return children
        .map((value) => parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0);
    })
  );

  return [...new Set(explicitCategoryIds.concat(descendantIds.flat()))];
}

async function ensureDefaults() {
  await meta.settings.setOnEmpty(SETTINGS_KEY, DEFAULT_SETTINGS);
}

function invalidateSettingsCache(options = {}) {
  settingsCache = null;
  cacheMetrics.invalidations += 1;
  if (!options.skipNamespaceInvalidation) {
    try {
      const wikiPaths = require("./wiki-paths");
      if (wikiPaths && typeof wikiPaths.invalidateWikiTreeIndex === "function") {
        wikiPaths.invalidateWikiTreeIndex({ skipSettingsInvalidation: true, reason: "settings-invalidated" });
      } else if (wikiPaths && typeof wikiPaths.invalidateNamespaceIndexCache === "function") {
        wikiPaths.invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });
      }
    } catch (e) {
      // Avoid turning cache invalidation into a module-load failure during startup/tests.
    }
  }
}

function getCacheMetrics() {
  return {
    settings: { ...cacheMetrics }
  };
}

function resetCacheMetrics() {
  Object.keys(cacheMetrics).forEach((key) => {
    cacheMetrics[key] = 0;
  });
}

async function loadSettings() {
  const settings = await meta.settings.get(SETTINGS_KEY);
  const normalizedSettings = normalizeSettings(settings);
  const effectiveCategoryIds = await resolveEffectiveCategoryIds(normalizedSettings);

  const loaded = {
    ...normalizedSettings,
    effectiveCategoryIds
  };
  settingsCache = {
    expiry: Date.now() + SETTINGS_CACHE_TTL_MS,
    settings: loaded
  };
  cacheMetrics.rebuilds += 1;
  return loaded;
}

async function getSettings(options = {}) {
  const bustCache = !!(options && options.bustCache);
  const now = Date.now();
  if (!bustCache && settingsCache && settingsCache.expiry > now) {
    cacheMetrics.hits += 1;
    return settingsCache.settings;
  }

  cacheMetrics.misses += 1;
  return loadSettings();
}

async function setHomeTopicIdInSettings(tid) {
  const n = normalizeHomeTopicId(tid);
  if (!n) {
    throw new Error("invalid-tid");
  }
  const current = await meta.settings.get(SETTINGS_KEY) || {};
  await meta.settings.set(SETTINGS_KEY, {
    ...current,
    homeTopicId: String(n)
  });
  invalidateSettingsCache();
}

/**
 * Appends a category id to stored wiki namespace roots when the new category
 * would not already appear in effectiveCategoryIds (new root, or child when
 * descendant inheritance is off).
 */
async function mergeWikiCategoryIdIntoSettings(cid) {
  const n = parseInt(cid, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("invalid-cid");
  }

  const current = await meta.settings.get(SETTINGS_KEY) || {};
  const parsed = parseCategoryIds(current.categoryIds);
  if (parsed.includes(n)) {
    return;
  }

  const next = parsed.concat(n);
  await meta.settings.set(SETTINGS_KEY, {
    ...current,
    categoryIds: next.join(", ")
  });
  invalidateSettingsCache();
}

async function setCanonicalPathMigrationVersion(version) {
  const normalizedVersion = String(version || "").trim();
  if (!normalizedVersion) {
    throw new Error("invalid-canonical-path-migration-version");
  }
  const current = await meta.settings.get(SETTINGS_KEY) || {};
  await meta.settings.set(SETTINGS_KEY, {
    ...current,
    canonicalPathMigrationVersion: normalizedVersion
  });
  invalidateSettingsCache();
}

async function setRouteRootCidInSettings(cid) {
  const n = normalizeRouteRootCid(cid);
  if (!n) {
    throw new Error("invalid-route-root-cid");
  }
  const current = await meta.settings.get(SETTINGS_KEY) || {};
  await meta.settings.set(SETTINGS_KEY, {
    ...current,
    routeRootCid: String(n)
  });
  invalidateSettingsCache();
}

module.exports = {
  SETTINGS_KEY,
  SETTINGS_CACHE_TTL_MS,
  DEFAULT_SETTINGS,
  ensureDefaults,
  getSettings,
  invalidateSettingsCache,
  getCacheMetrics,
  resetCacheMetrics,
  setHomeTopicIdInSettings,
  mergeWikiCategoryIdIntoSettings,
  setCanonicalPathMigrationVersion,
  setRouteRootCidInSettings,
  normalizeSettings,
  normalizeHomeTopicId,
  normalizeRouteRootCid,
  parseWikiNamespaceCreateGroupNames,
  resolveEffectiveCategoryIds
};
