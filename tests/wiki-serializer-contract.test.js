"use strict";

const assert = require("node:assert/strict");
const serializer = require("../lib/serializer");

const summary = serializer.serializeTopicSummary({
  tid: 10,
  cid: 2,
  title: "Guide",
  titleRaw: "Guides :: Guide",
  slug: "10/guide",
  postcount: 1,
  deleted: 0,
  scheduled: 0,
  lastposttime: 1000,
  timestamp: 900,
  updatetime: 950
});

assert.strictEqual(summary.tid, 10);
assert.deepStrictEqual(summary.titlePath, ["Guides", "Guide"]);
assert.strictEqual(summary.titleLeaf, "Guide");
assert.strictEqual(summary.parentTitlePathText, "Guides");
assert.deepStrictEqual(summary.parentTitlePathSegments, [{ text: "Guides", hasSeparatorBefore: false }]);
assert.strictEqual(serializer.getTitleDisplay(summary.titlePath), "Guides :: Guide");
assert.strictEqual(summary.wikiPath, "");
assert.strictEqual(summary.hasWikiPath, false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(summary, "cid"), false, "public topic summaries should not expose internal cid");
assert.strictEqual(Object.prototype.hasOwnProperty.call(summary, "deleted"), false, "public topic summaries should not expose deletion state");
assert.strictEqual(Object.prototype.hasOwnProperty.call(summary, "scheduled"), false, "public topic summaries should not expose scheduling state");
assert.strictEqual(Object.prototype.hasOwnProperty.call(summary, "lastposttime"), false, "public topic summaries should not expose search timestamps");
assert.strictEqual(Object.prototype.hasOwnProperty.call(summary, "timestamp"), false, "public topic summaries should not expose search timestamps");
assert.strictEqual(Object.prototype.hasOwnProperty.call(summary, "updatetime"), false, "public topic summaries should not expose search timestamps");

const encodedSlashSummary = serializer.serializeTopicSummary({
  tid: 11,
  cid: 2,
  title: "Clairaudience&#x2F;Clairvoyance",
  titleRaw: "Clairaudience&#x2F;Clairvoyance",
  slug: "11/clairaudience-clairvoyance",
  postcount: 1
});

assert.deepStrictEqual(encodedSlashSummary.titlePath, ["Clairaudience/Clairvoyance"]);
assert.strictEqual(encodedSlashSummary.titleLeaf, "Clairaudience/Clairvoyance");
assert.strictEqual(encodedSlashSummary.titleDepth, 0);
assert.strictEqual(encodedSlashSummary.hasParentPath, false);
assert.strictEqual(serializer.getTitleDisplay(encodedSlashSummary.titlePath), "Clairaudience/Clairvoyance");

const rawSlashSummary = serializer.serializeTopicSummary({
  tid: 12,
  cid: 2,
  title: "asdf/zxcv",
  titleRaw: "asdf/zxcv",
  slug: "12/asdf-zxcv",
  postcount: 1
});

assert.deepStrictEqual(rawSlashSummary.titlePath, ["asdf/zxcv"]);
assert.strictEqual(rawSlashSummary.titleLeaf, "asdf/zxcv");
assert.strictEqual(rawSlashSummary.hasParentPath, false);

const explicitSubpageSummary = serializer.serializeTopicSummary({
  tid: 13,
  cid: 2,
  title: "asdf :: zxcv",
  titleRaw: "asdf :: zxcv",
  slug: "13/asdf-zxcv",
  postcount: 1
});

assert.deepStrictEqual(explicitSubpageSummary.titlePath, ["asdf", "zxcv"]);
assert.strictEqual(explicitSubpageSummary.titleLeaf, "zxcv");
assert.strictEqual(explicitSubpageSummary.hasParentPath, true);
assert.strictEqual(explicitSubpageSummary.parentTitlePathText, "asdf");
assert.deepStrictEqual(explicitSubpageSummary.parentTitlePathSegments, [{ text: "asdf", hasSeparatorBefore: false }]);
assert.strictEqual(serializer.getTitleDisplay(explicitSubpageSummary.titlePath), "asdf :: zxcv");

const nestedSubpageSummary = serializer.serializeTopicSummary({
  tid: 14,
  cid: 2,
  title: "one :: two :: three",
  titleRaw: "one :: two :: three",
  slug: "14/one-two-three",
  postcount: 1
});

assert.deepStrictEqual(nestedSubpageSummary.parentTitlePathSegments, [
  { text: "one", hasSeparatorBefore: false },
  { text: "two", hasSeparatorBefore: true }
]);

console.log("wiki serializer contract tests passed");
