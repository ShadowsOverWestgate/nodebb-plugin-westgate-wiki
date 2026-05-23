"use strict";

const assert = require("assert");

const topdataBotPrivileges = require("../lib/wiki-topdata-bot-privileges");

(async () => {
  const originalMainRequire = require.main.require.bind(require.main);
  const managedContent = [
    "<!-- sow-topdata-wiki:page=feat:adamant_fortitude -->",
    '<!-- sow-topdata-wiki:managed:start hash="sha256:old" -->',
    "<h1>Adamant Fortitude</h1>",
    "<!-- sow-topdata-wiki:managed:end -->"
  ].join("\n");

  require.main.require = function requireNodebbStub(id) {
    const stubs = {
      "./src/posts": {
        getPostFields: async (pid, fields) => {
          assert.strictEqual(parseInt(pid, 10), 96);
          assert.deepStrictEqual(fields, ["pid", "tid", "content", "sourceContent"]);
          return { pid: 96, tid: 7, content: managedContent, sourceContent: managedContent };
        }
      },
      "./src/topics": {
        getTopicFields: async (tid, fields) => {
          assert.strictEqual(parseInt(tid, 10), 7);
          assert.deepStrictEqual(fields, ["tid", "cid", "mainPid"]);
          return { tid: 7, cid: 58, mainPid: 96 };
        }
      }
    };
    return stubs[id] || originalMainRequire(id);
  };

  const configPath = require.resolve("../lib/config");
  const previousConfig = require.cache[configPath];
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: {
      getSettings: async () => ({ effectiveCategoryIds: [58] })
    }
  };

  try {
    const granted = await topdataBotPrivileges.filterPostEditPrivilege({
      pid: 96,
      uid: 5,
      edit: true,
      isOwner: false,
      isEditor: false,
      isMod: false
    });

    assert.strictEqual(granted.isEditor, true, "managed topdata wiki main posts should grant editorship to users with posts:edit");

    const denied = await topdataBotPrivileges.filterPostEditPrivilege({
      pid: 96,
      uid: 5,
      edit: false,
      isOwner: false,
      isEditor: false,
      isMod: false
    });

    assert.strictEqual(denied.isEditor, false, "users without category posts:edit should not gain managed editorship");
  } finally {
    require.main.require = originalMainRequire;
    if (previousConfig) {
      require.cache[configPath] = previousConfig;
    } else {
      delete require.cache[configPath];
    }
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
