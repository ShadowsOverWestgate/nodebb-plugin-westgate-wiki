"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { installNodebbStubs, restoreNodebbStubs } = require("./helpers/nodebb-stub");

const root = path.resolve(__dirname, "..");

function clearProjectModule(relativePath) {
  delete require.cache[require.resolve(path.join(root, relativePath))];
}

async function withTopicStub(topicApi, fn) {
  installNodebbStubs({ "./src/topics": topicApi });
  clearProjectModule("lib/archive/wiki-archive-identity.js");

  try {
    return await fn(require("../lib/archive/wiki-archive-identity"));
  } finally {
    restoreNodebbStubs();
    clearProjectModule("lib/archive/wiki-archive-identity.js");
  }
}

(async () => {
  {
    await withTopicStub({
      getTopicField: async () => "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      setTopicField: async () => {
        throw new Error("should not write when a valid portable id already exists");
      }
    }, async (identity) => {
      const id = await identity.getOrCreatePageArchiveId(77, {
        idFactory: () => "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      });
      assert.equal(id, "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      assert.equal(identity.PORTABLE_TOPIC_FIELD, "westgateWikiArchivePageId");
    });
  }

  {
    const writes = [];
    await withTopicStub({
      getTopicField: async () => "",
      setTopicField: async (tid, field, value) => {
        writes.push({ tid, field, value });
      }
    }, async (identity) => {
      const id = await identity.getOrCreatePageArchiveId(77, {
        idFactory: () => "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      });
      assert.equal(id, "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      assert.deepEqual(writes, [{
        tid: 77,
        field: "westgateWikiArchivePageId",
        value: "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }]);
    });
  }

  {
    await withTopicStub({
      getTopicField: async () => "77-gond",
      setTopicField: async () => {
        throw new Error("malformed portable id must not be rewritten silently");
      }
    }, async (identity) => {
      await assert.rejects(
        () => identity.getOrCreatePageArchiveId(77, {
          idFactory: () => "wgap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }),
        /invalid-archive-page-id/
      );
    });
  }

  {
    await withTopicStub({
      getTopicField: async () => "",
      setTopicField: async () => {}
    }, async (identity) => {
      assert.equal(identity.isValidPageArchiveId("wgap_0123456789abcdef0123456789abcdef"), true);
      assert.equal(identity.isValidPageArchiveId("Lore/Deities/Gond"), false);
      assert.equal(identity.isValidPageArchiveId("westgateWikiPageSlug"), false);
      assert.throws(() => identity.assertNotPublicPathAuthority("Lore/Deities/Gond"), /archive-id-not-public-path-authority/);
      assert.doesNotThrow(() => identity.assertNotPublicPathAuthority("wgap_0123456789abcdef0123456789abcdef"));
    });
  }

  {
    await withTopicStub({}, async (identity) => {
      const result = identity.matchDestinationPage({
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/Deities/Gond"
      }, [
        { tid: 77, canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { tid: 78, canonicalPath: "Lore/Deities/Tyr", westgateWikiArchivePageId: "" }
      ]);

      assert.equal(result.status, "matched-archive-id");
      assert.equal(result.tid, 77);
      assert.equal(result.match.archivePageId, "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    });
  }

  {
    await withTopicStub({}, async (identity) => {
      const result = identity.matchDestinationPage({
        canonicalPath: "Lore/Deities/Gond"
      }, [
        { tid: 77, canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "" }
      ]);

      assert.equal(result.status, "matched-canonical-path");
      assert.equal(result.tid, 77);
    });
  }

  {
    await withTopicStub({}, async (identity) => {
      const result = identity.matchDestinationPage({
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/Deities/Gond"
      }, [
        { tid: 77, canonicalPath: "Lore/Deities/Tyr", westgateWikiArchivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { tid: 78, canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "" }
      ]);

      assert.equal(result.status, "conflict-id-path-disagreement");
      assert.equal(result.archiveIdTid, 77);
      assert.equal(result.canonicalPathTid, 78);
    });
  }

  {
    await withTopicStub({}, async (identity) => {
      const result = identity.matchDestinationPage({
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/Deities/Gond"
      }, [
        { tid: 77, canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { tid: 78, canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      ]);

      assert.equal(result.status, "ambiguous-archive-id");
      assert.deepEqual(result.tids, [77, 78]);
    });
  }

  {
    await withTopicStub({}, async (identity) => {
      const result = identity.matchDestinationPage({
        canonicalPath: "Lore/Deities/Gond"
      }, [
        { tid: 78, canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "" },
        { tid: 77, canonicalPath: "Lore/Deities/Gond", westgateWikiArchivePageId: "" }
      ]);

      assert.equal(result.status, "ambiguous-canonical-path");
      assert.deepEqual(result.tids, [77, 78]);
    });
  }

  {
    await withTopicStub({}, async (identity) => {
      const result = identity.matchDestinationPage({
        archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        canonicalPath: "Lore/Deities/Gond"
      }, [
        { tid: 77, canonicalPath: "Lore/Deities/Tyr", westgateWikiArchivePageId: "" }
      ]);

      assert.equal(result.status, "not-found");
    });
  }
})();
