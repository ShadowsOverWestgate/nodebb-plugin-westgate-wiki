"use strict";

const db = require.main.require("./src/database");

/**
 * Every tid in a wiki category, pinned set included. NodeBB removes pinned
 * topics (and scheduled topics, which it auto-pins) from cid:{cid}:tids and
 * keeps them in cid:{cid}:tids:pinned; readers that want the full set must
 * merge both or a pinned wiki page silently drops out of the tree.
 */
async function getCategoryTids(cid) {
  const [pinned, regular] = await Promise.all([
    db.getSortedSetRange(`cid:${cid}:tids:pinned`, 0, -1),
    db.getSortedSetRange(`cid:${cid}:tids`, 0, -1)
  ]);
  return [
    ...(Array.isArray(pinned) ? pinned : []),
    ...(Array.isArray(regular) ? regular : [])
  ];
}

async function getCategoriesTids(cids) {
  const lists = await Promise.all((Array.isArray(cids) ? cids : []).map(getCategoryTids));
  return lists.flat();
}

module.exports = { getCategoryTids, getCategoriesTids };
