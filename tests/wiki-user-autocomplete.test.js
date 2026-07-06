"use strict";

const assert = require("assert");

const state = {
  searchRows: [],
  searchImpl: null,
  searchCalls: [],
  usersBySlug: new Map()
};
const { installNodebbStubs } = require("./helpers/nodebb-stub");

function setUsers(rows) {
  state.usersBySlug = new Map(rows.map((row) => [row.userslug, row]));
}

installNodebbStubs({
    "./src/controllers/helpers": {
      formatApiResponse: (status, res, payload) => ({ status, payload, res })
    },
    "./src/user": {
      search: async (...args) => {
        state.searchCalls.push(args);
        if (typeof state.searchImpl === "function") {
          return state.searchImpl(...args);
        }
        return { users: state.searchRows };
      },
      getUidByUserslug: async (userslug) => {
        const row = state.usersBySlug.get(userslug);
        return row ? row.uid : null;
      },
      getUserFields: async (uid) => {
        for (const row of state.usersBySlug.values()) {
          if (parseInt(row.uid, 10) === parseInt(uid, 10)) {
            return row;
          }
        }
        return null;
      }
    }
});

const autocomplete = require("../lib/features/wiki-user-autocomplete");

(async () => {
  setUsers([
    { uid: 1, username: "xtul", userslug: "xtul", displayname: "xtul" }
  ]);

  state.searchRows = [];
  state.searchImpl = null;
  state.searchCalls = [];
  {
    const results = await autocomplete.search({ q: "xtul" });
    assert.strictEqual(results.length, 1, "exact userslug fallback should work when user.search returns no rows");
    assert.strictEqual(results[0].username, "xtul");
    assert.strictEqual(results[0].userslug, "xtul");
  }

  state.searchRows = [
    { uid: 2, username: "Vicky", userslug: "vicky", displayname: "Vicky" }
  ];
  state.searchImpl = null;
  state.searchCalls = [];
  {
    const results = await autocomplete.search({ q: "vic" });
    assert.strictEqual(results.length, 1, "search rows should still be returned when available");
    assert.strictEqual(results[0].userslug, "vicky");
  }

  state.searchRows = [];
  state.searchCalls = [];
  state.searchImpl = async (...args) => {
    const firstArg = args[0];
    if (firstArg && typeof firstArg === "object" && firstArg.query === "vic") {
      return {
        results: [
          { uid: 2, username: "Vicky", userslug: "vicky", displayname: "Vicky" }
        ]
      };
    }
    return { users: [] };
  };
  {
    const results = await autocomplete.search({ q: "vic" });
    assert.strictEqual(results.length, 1, "object-style NodeBB user.search should support partial username matches");
    assert.strictEqual(results[0].userslug, "vicky");
    assert(state.searchCalls.some((args) => args[0] && typeof args[0] === "object" && args[0].query === "vic"), "object-style user.search should be attempted");
  }

  console.log("wiki-user-autocomplete tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
