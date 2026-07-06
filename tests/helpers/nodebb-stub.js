"use strict";

/*
 * Shared NodeBB core stub for unit tests.
 *
 * Replaces the per-file `require.main.require` overrides that were duplicated
 * across ~46 test files. Provides an in-memory state (categories, topics,
 * settings) plus sensible default implementations of every core module the
 * plugin touches; individual tests override only what they assert on.
 *
 * Usage:
 *   const { state, installNodebbStubs, restoreNodebbStubs, setCategories, setTopics } =
 *     require("./helpers/nodebb-stub");
 *   installNodebbStubs({
 *     "./src/topics": { getTopicData: async () => ... }   // shallow-merged over defaults
 *   });
 *   ...require plugin modules AFTER installing stubs...
 *
 * Install BEFORE requiring any lib/ module (top-level core requires capture
 * whatever require.main.require returns at load time).
 */

const state = {
  settings: { categoryIds: "", includeChildCategories: "0" },
  categories: new Map(),
  topics: new Map(),
  tidsByCid: new Map(),
  calls: {
    sortedSetRange: 0,
    topicFields: 0,
    categoryData: 0
  }
};

const originalMainRequire = require.main.require.bind(require.main);
let installed = false;

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setCategories(rows) {
  state.categories = new Map((rows || []).map((row) => [parseInt(row.cid, 10), row]));
}

function setTopics(rows) {
  state.topics = new Map((rows || []).map((row) => [parseInt(row.tid, 10), row]));
  state.tidsByCid = new Map();
  (rows || []).forEach((row) => {
    const cid = parseInt(row.cid, 10);
    const list = state.tidsByCid.get(cid) || [];
    list.push(parseInt(row.tid, 10));
    state.tidsByCid.set(cid, list);
  });
}

function setSettings(settings) {
  state.settings = { includeChildCategories: "0", ...settings };
}

function resetState() {
  setSettings({ categoryIds: "" });
  setCategories([]);
  setTopics([]);
  Object.keys(state.calls).forEach((key) => {
    state.calls[key] = 0;
  });
}

function tidsForSetKey(key) {
  const cid = parseInt((String(key).match(/^cid:(\d+):tids$/) || [])[1], 10);
  return state.tidsByCid.get(cid) || [];
}

function pickFields(row, fields) {
  if (!Array.isArray(fields) || !fields.length) {
    return { ...row };
  }
  const out = { tid: row.tid };
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      out[field] = row[field];
    }
  });
  return out;
}

function buildDefaultStubs() {
  return {
    nconf: {
      get: (key) => (key === "relative_path" ? "" : undefined)
    },
    "./src/categories": {
      getCategoryData: async (cid) => {
        state.calls.categoryData += 1;
        return state.categories.get(parseInt(cid, 10)) || null;
      },
      getChildren: async () => [[]],
      getChildrenCids: async () => []
    },
    "./src/database": {
      getSortedSetRange: async (key) => {
        state.calls.sortedSetRange += 1;
        return tidsForSetKey(key);
      },
      getSortedSetRevRange: async (key) => tidsForSetKey(key),
      sortedSetCard: async (key) => tidsForSetKey(key).length,
      getObjectField: async () => null,
      getObject: async () => ({}),
      isSetMember: async () => false
    },
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicsData: async (tids) => (tids || []).map((tid) => state.topics.get(parseInt(tid, 10))).filter(Boolean),
      getTopicField: async (tid, field) => {
        state.calls.topicFields += 1;
        const row = state.topics.get(parseInt(tid, 10));
        return row && Object.prototype.hasOwnProperty.call(row, field) ? row[field] : null;
      },
      getTopicFields: async (tid, fields) => {
        state.calls.topicFields += 1;
        const row = state.topics.get(parseInt(tid, 10));
        return row ? pickFields(row, fields) : {};
      },
      getTopicsFields: async (tids, fields) => {
        state.calls.topicFields += 1;
        return (tids || [])
          .map((tid) => state.topics.get(parseInt(tid, 10)))
          .filter(Boolean)
          .map((row) => pickFields(row, fields));
      },
      getTopicsFromSet: async (setKey, uid, start, stop) => tidsForSetKey(setKey)
        .slice(start, stop + 1)
        .map((tid) => state.topics.get(tid))
        .filter(Boolean),
      setTopicField: async (tid, field, value) => {
        const row = state.topics.get(parseInt(tid, 10));
        if (row) {
          row[field] = value;
        }
      },
      setTopicFields: async (tid, data) => {
        const row = state.topics.get(parseInt(tid, 10));
        if (row) {
          Object.assign(row, data);
        }
      }
    },
    "./src/posts": {
      getPostFields: async () => ({}),
      getPostData: async () => null,
      getPostSummaryByPids: async () => [],
      clearCachedPost: () => {}
    },
    "./src/posts/cache": {
      reset: () => {},
      del: () => {}
    },
    "./src/privileges": {
      categories: {
        get: async () => ({ read: true, "topics:read": true, "topics:create": true }),
        can: async () => true
      },
      topics: {
        filterTids: async (privilege, tids) => (Array.isArray(tids) ? tids : []),
        get: async () => ({ "topics:read": true, "topics:delete": true })
      },
      posts: {
        canEdit: async () => ({ flag: true })
      }
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        set: async () => {},
        setOnEmpty: async () => {}
      }
    },
    "./src/user": {
      isAdministrator: async () => false,
      getUserFields: async () => ({})
    },
    "./src/groups": {
      isMemberOfAny: async () => false,
      getNonPrivilegeGroups: async () => []
    },
    "./src/controllers/helpers": {
      formatApiResponse: (status, res, payload) => {
        if (res) {
          res.statusCode = status;
          res.payload = payload;
        }
        return payload;
      }
    },
    "./src/utils": {
      isNumber: (val) => {
        if (typeof val === "number") {
          return Number.isFinite(val);
        }
        return typeof val === "string" && val.trim() !== "" && !Number.isNaN(parseFloat(val));
      }
    },
    "./src/slugify": slugify,
    "./src/notifications": {}
  };
}

/**
 * Install the stubbed require.main.require. `overrides` is a map of module id
 * -> object; each override is shallow-merged over the default stub (functions
 * replace defaults key-by-key). Unknown module ids fall through to the real
 * require.main.require.
 */
function installNodebbStubs(overrides = {}) {
  const defaults = buildDefaultStubs();
  const merged = { ...defaults };
  Object.keys(overrides).forEach((id) => {
    const base = defaults[id];
    merged[id] = base && typeof base === "object" && typeof overrides[id] === "object" && !Array.isArray(overrides[id]) ?
      { ...base, ...overrides[id] } :
      overrides[id];
  });

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(merged, id) ? merged[id] : originalMainRequire(id);
  };
  installed = true;
  return merged;
}

function restoreNodebbStubs() {
  if (installed) {
    require.main.require = originalMainRequire;
    installed = false;
  }
}

module.exports = {
  state,
  slugify,
  setCategories,
  setTopics,
  setSettings,
  resetState,
  installNodebbStubs,
  restoreNodebbStubs,
  originalMainRequire
};
