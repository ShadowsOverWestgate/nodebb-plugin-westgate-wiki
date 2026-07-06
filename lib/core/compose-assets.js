"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "..", "public");

const FILES = {
  "article-body.css": {
    rel: "wiki-article-body.css",
    type: "text/css; charset=utf-8"
  },
  "editor.css": {
    rel: path.join("vendor", "tiptap", "wiki-tiptap.css"),
    type: "text/css; charset=utf-8"
  },
  "editor.js": {
    rel: path.join("vendor", "tiptap", "wiki-tiptap.bundle.js"),
    type: "application/javascript; charset=utf-8"
  },
  "vendor.css": {
    rel: path.join("vendor", "tiptap", "wiki-tiptap.css"),
    type: "text/css; charset=utf-8"
  },
  "vendor.js": {
    rel: path.join("vendor", "tiptap", "wiki-tiptap.bundle.js"),
    type: "application/javascript; charset=utf-8"
  },
  "page.js": {
    rel: "wiki-compose-page.js",
    type: "application/javascript; charset=utf-8"
  }
};

const VERSIONED_ASSET_KEYS = [
  "article-body.css",
  "editor.css",
  "editor.js",
  "page.js"
];

let cachedAssetVersion = "";
let cachedAssetSignature = "";

function getAssetPath(slug) {
  return path.join(publicDir, FILES[slug].rel);
}

function getAssetSignature() {
  return VERSIONED_ASSET_KEYS.map((slug) => {
    const stat = fs.statSync(getAssetPath(slug));
    return `${slug}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
  }).join("|");
}

function getAssetVersion() {
  const signature = getAssetSignature();
  if (cachedAssetVersion && cachedAssetSignature === signature) {
    return cachedAssetVersion;
  }

  const hash = crypto.createHash("sha256");
  VERSIONED_ASSET_KEYS.forEach((slug) => {
    hash.update(slug);
    hash.update("\0");
    hash.update(fs.readFileSync(getAssetPath(slug)));
    hash.update("\0");
  });
  cachedAssetSignature = signature;
  cachedAssetVersion = hash.digest("hex").slice(0, 12);
  return cachedAssetVersion;
}

/**
 * Serves wiki compose JS/CSS from a URL namespace outside /assets/plugins/… so
 * NodeBB’s default service worker (cache-first for GETs) is less likely to
 * return a stale or bad match for plugin static paths after rebuilds.
 */
function register(router) {
  const base = "/westgate-wiki/compose";

  Object.entries(FILES).forEach(([slug, meta]) => {
    const absPath = getAssetPath(slug);

    router.get(`${base}/${slug}`, function (req, res, next) {
      res.type(meta.type);
      res.set("Cache-Control", "public, max-age=604800");
      res.sendFile(absPath, (err) => {
        if (err) {
          next(err);
        }
      });
    });
  });
}

module.exports = {
  getAssetVersion,
  register
};
