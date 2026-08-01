"use strict";

const fs = require("node:fs");
const path = require("node:path");

const confirmScript = fs.readFileSync(path.resolve(__dirname, "..", "..", "public", "wiki-confirm.js"), "utf8");

/*
 * Loads the wiki confirm helper into a jsdom window plus a stub of the forum's
 * bootbox modal, so client tests can drive destructive-action confirmations
 * without a live forum. Returns a controller: set `typed` to what the user
 * types into a typed confirmation (null cancels), and `confirmed` for plain
 * confirmations. `calls` records the dialogs that were opened.
 */
function installConfirmStub(dom, options = {}) {
  const state = {
    typed: Object.hasOwn(options, "typed") ? options.typed : null,
    confirmed: options.confirmed !== false,
    calls: []
  };

  dom.window.bootbox = {
    confirm(dialog) {
      state.calls.push(dialog);
      dialog.callback(state.confirmed);
    },
    prompt(dialog) {
      state.calls.push(dialog);
      dialog.callback(state.typed);
    }
  };
  dom.window.eval(confirmScript);
  return state;
}

module.exports = { confirmScript, installConfirmStub };
