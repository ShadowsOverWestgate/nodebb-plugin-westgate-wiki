"use strict";

const topics = require.main.require("./src/topics");
const posts = require.main.require("./src/posts");
const categories = require.main.require("./src/categories");

const forumExclusion = require("./forum-exclusion-service");

function listWithoutWikiTids(list, wikiTidSet) {
  if (!Array.isArray(list) || !list.length || !wikiTidSet.size) {
    return Array.isArray(list) ? list : [];
  }

  return list.filter((tid) => !wikiTidSet.has(String(tid)));
}

function recomputeUnreadCounts(tidsByFilter) {
  const source = tidsByFilter || {};
  return {
    "": Array.isArray(source[""]) ? source[""].length : 0,
    new: Array.isArray(source.new) ? source.new.length : 0,
    watched: Array.isArray(source.watched) ? source.watched.length : 0,
    unreplied: Array.isArray(source.unreplied) ? source.unreplied.length : 0
  };
}

function hasWikiCid(row, wikiCidSet) {
  const candidates = [
    row && row.cid,
    row && row.topic && row.topic.cid,
    row && row.category && row.category.cid
  ];
  return candidates.some((cid) => {
    const n = parseInt(cid, 10);
    return Number.isInteger(n) && wikiCidSet.has(n);
  });
}

async function filterTopicsUpdateRecent(data) {
  if (!data || data.tid === undefined || data.tid === null) {
    return data;
  }

  const cid = await topics.getTopicField(data.tid, "cid");
  if (await forumExclusion.isWikiCid(cid)) {
    await forumExclusion.addWikiTids([data.tid]);
    await forumExclusion.removeTidsFromRecentSet([data.tid]);
    return {};
  }

  return data;
}

async function filterTopicsFilterSortedTids(data) {
  if (!data || !Array.isArray(data.tids) || !data.tids.length) {
    return data;
  }

  data.tids = await forumExclusion.filterNonWikiTids(data.tids);
  return data;
}

async function filterTopicsGetUnreadTids(data) {
  if (!data) {
    return data;
  }

  const candidateTids = new Set(Array.isArray(data.tids) ? data.tids.map(String) : []);
  if (data.tidsByFilter && typeof data.tidsByFilter === "object") {
    Object.keys(data.tidsByFilter).forEach((filterName) => {
      if (!Array.isArray(data.tidsByFilter[filterName])) {
        return;
      }
      data.tidsByFilter[filterName].forEach((tid) => candidateTids.add(String(tid)));
    });
  }

  if (!candidateTids.size) {
    return data;
  }

  const candidateTidList = [...candidateTids];
  const nonWikiCandidateTids = await forumExclusion.filterNonWikiTids(candidateTidList);
  const allowedTidSet = new Set(nonWikiCandidateTids.map(String));
  const originalTidSet = new Set(candidateTidList.map(String));
  const wikiTidSet = new Set(
    [...originalTidSet].filter((tid) => !allowedTidSet.has(tid))
  );

  if (!wikiTidSet.size) {
    return data;
  }

  data.tids = listWithoutWikiTids(data.tids, wikiTidSet);

  if (data.tidsByFilter && typeof data.tidsByFilter === "object") {
    Object.keys(data.tidsByFilter).forEach((filterName) => {
      data.tidsByFilter[filterName] = listWithoutWikiTids(data.tidsByFilter[filterName], wikiTidSet);
    });
    data.counts = recomputeUnreadCounts(data.tidsByFilter);
  } else if (data.counts && typeof data.counts === "object") {
    data.counts = {
      "": data.tids.length,
      new: data.counts.new || 0,
      watched: data.counts.watched || 0,
      unreplied: data.counts.unreplied || 0
    };
  }

  if (Array.isArray(data.unreadCids) && data.unreadCids.length) {
    const wikiCidSet = await forumExclusion.getWikiCidSet();
    data.unreadCids = data.unreadCids.filter((cid) => {
      const n = parseInt(cid, 10);
      return !(Number.isInteger(n) && wikiCidSet.has(n));
    });
  }

  return data;
}

async function filterTopicsGet(data) {
  if (!data || !Array.isArray(data.topics) || !data.topics.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  // Rows granted by the write-path hooks below survive: core hydrates the
  // just-created topic through this same hook (topics/create.js) and crashes
  // if the row is stripped.
  data.topics = data.topics.filter(
    (topic) => !hasWikiCid(topic, wikiCidSet) ||
      forumExclusion.isTidHydrationGranted(topic && topic.tid)
  );
  return data;
}

async function filterPostGetPostSummaryByPids(data) {
  if (!data || !Array.isArray(data.posts) || !data.posts.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  data.posts = data.posts.filter(
    (post) => !hasWikiCid(post, wikiCidSet) ||
      forumExclusion.isPidHydrationGranted(post && post.pid)
  );
  return data;
}

// Write-path grants: these fire before core re-hydrates the row it just wrote
// (topics/create.js, posts/edit.js via api/posts.js), which is the only signal
// available to tell create/edit hydration apart from feed hydration.
async function filterTopicCreate(payload) {
  const topic = payload && payload.topic;
  if (!topic) {
    return payload;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (hasWikiCid(topic, wikiCidSet)) {
    forumExclusion.grantTidHydration(topic.tid);
    await forumExclusion.addWikiTids([topic.tid]);
  }
  return payload;
}

async function filterPostCreate(payload) {
  const post = payload && payload.post;
  if (!post || post.tid === undefined || post.tid === null) {
    return payload;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return payload;
  }

  const cid = await topics.getTopicField(post.tid, "cid");
  if (hasWikiCid({ cid }, wikiCidSet)) {
    forumExclusion.grantPidHydration(post.pid);
  }
  return payload;
}

async function filterPostEdit(payload) {
  const pid = payload && payload.data && payload.data.pid;
  if (pid === undefined || pid === null) {
    return payload;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return payload;
  }

  const tid = await posts.getPostField(pid, "tid");
  const cid = await topics.getTopicField(tid, "cid");
  if (hasWikiCid({ cid }, wikiCidSet)) {
    forumExclusion.grantPidHydration(pid);
  }
  return payload;
}

async function filterWidgetRenderRecentTopics(payload) {
  if (!payload || !payload.data) {
    return payload;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return payload;
  }

  // The Recent Topics widget reads widget.data.cid first; only when empty does it
  // fall back to all readable cids (wiki included), then strips wiki post-fetch and
  // undercounts. Pin the cid list to non-wiki cids before the widget runs.
  const configured = String(payload.data.cid || "")
    .split(",")
    .map((cid) => parseInt(cid, 10))
    .filter(Boolean);
  const cids = configured.length
    ? configured
    : (await categories.getCidsByPrivilege("categories:cid", payload.uid, "topics:read"))
        .filter((cid) => parseInt(cid, 10) !== -1);

  const nonWiki = cids.filter((cid) => !wikiCidSet.has(parseInt(cid, 10)));

  // ponytail: degenerate all-wiki case → cid:-1 (empty set) so wiki never reappears;
  // real forums always keep at least one non-wiki category.
  payload.data = { ...payload.data, cid: nonWiki.length ? nonWiki.join(",") : "-1" };
  return payload;
}

module.exports = {
  filterPostCreate,
  filterPostEdit,
  filterPostGetPostSummaryByPids,
  filterTopicCreate,
  filterTopicsGet,
  filterWidgetRenderRecentTopics,
  filterTopicsFilterSortedTids,
  filterTopicsGetUnreadTids,
  filterTopicsUpdateRecent
};
