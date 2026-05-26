"use strict";

const assert = require("assert");
const test = require("node:test");

function loadPermissionsWithPrivilegesStub(can) {
  const originalMainRequire = require.main.require.bind(require.main);
  require.main.require = function requireNodebbStub(id) {
    if (id === "./src/privileges") {
      return {
        categories: {
          can
        }
      };
    }
    return originalMainRequire(id);
  };

  const modulePath = require.resolve("../lib/wiki-revision-permissions");
  delete require.cache[modulePath];
  const permissions = require(modulePath);

  return {
    permissions,
    restore: () => {
      require.main.require = originalMainRequire;
      delete require.cache[modulePath];
    }
  };
}

test("addCategoryPrivileges registers wiki revision category privileges", () => {
  const calls = [];
  const { permissions, restore } = loadPermissionsWithPrivilegesStub(async () => false);

  try {
    const payload = {
      privileges: {
        set: (key, value) => calls.push([key, value])
      }
    };

    assert.strictEqual(permissions.addCategoryPrivileges(payload), payload);
    assert.deepStrictEqual(calls, [
      ["wiki:history", { label: "Wiki: view revision history", type: "moderation" }],
      ["wiki:restore", { label: "Wiki: restore revisions", type: "moderation" }],
      ["wiki:hard-purge", { label: "Wiki: hard purge tombstones", type: "moderation" }]
    ]);
  } finally {
    restore();
  }
});

test("wiki revision permission checks delegate to category privileges", async () => {
  const calls = [];
  const { permissions, restore } = loadPermissionsWithPrivilegesStub(async (privilege, cid, uid) => {
    calls.push([privilege, cid, uid]);
    return privilege !== "wiki:restore";
  });

  try {
    assert.strictEqual(await permissions.canViewHistory(42, 7), true);
    assert.strictEqual(await permissions.canRestore(43, 8), false);
    assert.strictEqual(await permissions.canHardPurge(44, 9), true);
    assert.deepStrictEqual(calls, [
      ["wiki:history", 42, 7],
      ["wiki:restore", 43, 8],
      ["wiki:hard-purge", 44, 9]
    ]);
  } finally {
    restore();
  }
});
