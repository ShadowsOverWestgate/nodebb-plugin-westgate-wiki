"use strict";

/**
 * Opaque cursors for wiki directory pagination (no NodeBB deps; unit-testable).
 */

function encodeCursor(sortKey, tid) {
  const payload = JSON.stringify({
    k: String(sortKey || ""),
    t: parseInt(tid, 10) || 0
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== "string") {
    return null;
  }
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const o = JSON.parse(raw);
    const t = parseInt(o.t, 10);
    if (!Number.isInteger(t) || t <= 0) {
      return null;
    }
    return { sortKey: String(o.k || ""), tid: t };
  } catch (e) {
    return null;
  }
}

module.exports = {
  decodeCursor,
  encodeCursor
};
