"use strict";

const assert = require("assert");
const { decodeCursor, encodeCursor } = require("../lib/tree/wiki-directory-cursor");

assert.deepStrictEqual(decodeCursor(null), null);
assert.deepStrictEqual(decodeCursor(""), null);
assert.deepStrictEqual(decodeCursor("not-valid-base64url!!!"), null);

const c = encodeCursor("alpha", 9001);
const d = decodeCursor(c);
assert.deepStrictEqual(d, { sortKey: "alpha", tid: 9001 });

const c2 = encodeCursor("", 1);
assert.deepStrictEqual(decodeCursor(c2), { sortKey: "", tid: 1 });

console.log("wiki-directory-cursor tests passed");
