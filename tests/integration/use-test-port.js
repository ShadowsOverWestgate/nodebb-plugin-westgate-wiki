"use strict";

// Rebinds the integration NodeBB instance to its own port so the suite can run
// alongside a dev server on 4567. Require AFTER test/mocks/databasemock (which
// sets url/port from config.json at load time) and BEFORE the webserver
// listens (databasemock's before() hook).

const path = require("path");
const nconf = require(path.join(process.cwd(), "node_modules/nconf"));

const TEST_PORT = process.env.WIKI_TEST_PORT || "45670";
const url = `http://127.0.0.1:${TEST_PORT}`;

nconf.set("port", TEST_PORT);
nconf.set("url", url);
nconf.set("base_url", url);
nconf.set("use_port", true);

module.exports = { TEST_PORT, url };
