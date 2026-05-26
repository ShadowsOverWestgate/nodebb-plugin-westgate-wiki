"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");

const archiveIdentity = require("./wiki-archive-identity");
const { PORTABLE_TOPIC_FIELD } = require("./wiki-archive-schema");

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getContentType(filename) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".gif") {
    return "image/gif";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  if (ext === ".pdf") {
    return "application/pdf";
  }
  if (ext === ".txt") {
    return "text/plain";
  }
  return "application/octet-stream";
}

function getNodebbBaseDirs() {
  const dirs = [];
  try {
    const nconf = require.main.require("nconf");
    ["base_dir", "core:base_dir", "upload_path"].forEach((key) => {
      const value = nconf && typeof nconf.get === "function" ? nconf.get(key) : "";
      if (value) {
        dirs.push(String(value));
      }
    });
  } catch (err) {
    // Tests and non-NodeBB contexts can fall back to process.cwd().
  }
  dirs.push(process.cwd());
  return [...new Set(dirs.map((dir) => path.resolve(dir)))];
}

function uploadCandidateRoots() {
  return [getUploadPath()].concat(getNodebbBaseDirs().flatMap((baseDir) => [
    path.join(baseDir, "public", "uploads"),
    path.join(baseDir, "public", "assets", "uploads"),
    path.join(baseDir, "build", "public", "uploads"),
    path.join(baseDir, "build", "public", "assets", "uploads")
  ]));
}

function getUploadPath() {
  try {
    const nconf = require.main.require("nconf");
    const configured = nconf && typeof nconf.get === "function" ? nconf.get("upload_path") : "";
    if (configured) {
      return path.resolve(String(configured));
    }
  } catch (err) {
    // Non-NodeBB tests can fall back to a conventional local upload root.
  }
  return path.resolve(process.cwd(), "public", "uploads");
}

function normalizeUploadRelativePath(reference) {
  const pathname = String(reference || "").split(/[?#]/)[0];
  if (pathname.startsWith("/assets/uploads/")) {
    return pathname.slice("/assets/uploads/".length);
  }
  if (pathname.startsWith("/uploads/")) {
    return pathname.slice("/uploads/".length);
  }
  return "";
}

function resolveUnderRoot(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error("archive-upload-path-traversal");
  }
  return target;
}

function toPosixPath(value) {
  return String(value || "").split(path.sep).join(path.posix.sep);
}

function publicUploadPathFromStoredPath(storedPath) {
  const value = String(storedPath || "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("/assets/uploads/") || value.startsWith("/uploads/")) {
    return value;
  }

  const uploadPath = getUploadPath();
  const resolved = path.resolve(value);
  if (resolved === uploadPath || !resolved.startsWith(`${uploadPath}${path.sep}`)) {
    return value;
  }
  const relative = toPosixPath(path.relative(uploadPath, resolved));
  return `/assets/uploads/${relative}`;
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function listFilesRecursive(root, options = {}) {
  const maxFiles = Number.isInteger(options.maxFiles) && options.maxFiles > 0 ? options.maxFiles : 5000;
  const output = [];

  async function walk(dir) {
    if (output.length >= maxFiles) {
      return;
    }
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return;
      }
      throw err;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (output.length >= maxFiles) {
        return;
      }
      const nextPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
      } else if (entry.isFile()) {
        output.push(nextPath);
      }
    }
  }

  await walk(root);
  return output;
}

async function collectDestinationAssets(options = {}) {
  const filesRoot = path.join(getUploadPath(), "files");
  const wantedSha256s = Array.isArray(options.assetSha256s) && options.assetSha256s.length ?
    new Set(options.assetSha256s.map((sha256) => String(sha256 || "").trim().toLowerCase()).filter(Boolean)) :
    null;
  const files = await listFilesRecursive(filesRoot, options);
  const assets = [];
  for (const filePath of files) {
    const stat = await fsp.stat(filePath);
    const sha256 = await sha256File(filePath);
    if (wantedSha256s && !wantedSha256s.has(sha256)) {
      continue;
    }
    assets.push({
      path: publicUploadPathFromStoredPath(filePath),
      sha256,
      bytes: stat.size,
      contentType: getContentType(filePath)
    });
  }
  return assets.sort((a, b) => a.path.localeCompare(b.path) || a.sha256.localeCompare(b.sha256));
}

function createUploadStore() {
  return {
    async readLocalUpload(reference) {
      const relativePath = normalizeUploadRelativePath(reference);
      if (!relativePath) {
        return null;
      }
      for (const root of uploadCandidateRoots()) {
        const target = resolveUnderRoot(root, relativePath);
        try {
          return {
            buffer: await fsp.readFile(target),
            contentType: getContentType(target)
          };
        } catch (err) {
          if (err && err.code !== "ENOENT") {
            throw err;
          }
        }
      }
      return null;
    }
  };
}

async function collectDestination(options = {}) {
  const migration = require("./wiki-path-migration");
  const wikiTreeIndex = require("./wiki-tree-index");
  const topics = require.main.require("./src/topics");
  const groups = require.main.require("./src/groups");
  const runtimeInput = await migration.collectRuntimeInput();
  const canonicalDiagnostics = await migration.verify(runtimeInput);
  const tree = wikiTreeIndex.createWikiTreeIndex(runtimeInput);
  const state = tree.getState();
  const namespaces = Array.from(state.namespaceByCid.values())
    .map((namespace) => ({
      cid: asPositiveInt(namespace && namespace.cid),
      title: String(namespace && namespace.category && namespace.category.name || ""),
      canonicalPath: String(namespace && namespace.canonicalPath || "")
    }))
    .filter((namespace) => namespace.cid)
    .sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath) || a.cid - b.cid);
  const pages = [];

  for (const page of Array.from(state.pageByTid.values())) {
    const tid = asPositiveInt(page && page.tid);
    if (!tid || !page.canonicalPath) {
      continue;
    }
    const topic = page.topic || {};
    const mainPid = asPositiveInt(topic.mainPid || page.mainPid);
    const archivePageId = topics && typeof topics.getTopicField === "function" ?
      String(await topics.getTopicField(tid, PORTABLE_TOPIC_FIELD) || "") :
      String(topic[PORTABLE_TOPIC_FIELD] || topic.westgateWikiArchivePageId || "");
    pages.push({
      tid,
      cid: asPositiveInt(page.cid || topic.cid),
      mainPid,
      pid: mainPid,
      title: String(topic.titleRaw || topic.title || ""),
      canonicalPath: String(page.canonicalPath || ""),
      archivePageId,
      westgateWikiArchivePageId: archivePageId
    });
  }
  pages.sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath) || a.tid - b.tid);

  let destinationGroups = [];
  if (groups && typeof groups.getNonPrivilegeGroups === "function") {
    destinationGroups = (await groups.getNonPrivilegeGroups("groups:createtime", 0, -1, { ephemeral: false }) || [])
      .map((group) => group && (group.name || group.displayName))
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .sort();
  }

  return {
    canonicalDiagnostics,
    destination: {
      namespaces,
      pages,
      assets: options.assetIndex && typeof options.assetIndex.collectDestinationAssets === "function" ?
        await options.assetIndex.collectDestinationAssets({ assetSha256s: options.assetSha256s }) :
        await collectDestinationAssets({ assetSha256s: options.assetSha256s })
    },
    destinationGroups,
    destinationGroupResolver: async (name) => destinationGroups.includes(String(name || "").trim()) ? String(name || "").trim() : ""
  };
}

function createAssetIndex(options = {}) {
  let destinationAssetsPromise = null;

  async function loadDestinationAssets() {
    if (!destinationAssetsPromise) {
      destinationAssetsPromise = Promise.resolve(
        Array.isArray(options.destinationAssets) ?
          options.destinationAssets :
          collectDestinationAssets({ assetSha256s: options.assetSha256s })
      );
    }
    return destinationAssetsPromise;
  }

  return {
    async findBySha256(sha256) {
      const expected = String(sha256 || "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(expected)) {
        return null;
      }
      const assets = await loadDestinationAssets();
      const match = (Array.isArray(assets) ? assets : [])
        .filter((asset) => String(asset && asset.sha256 || "").trim().toLowerCase() === expected)
        .sort((a, b) => String(a && a.path || "").localeCompare(String(b && b.path || "")))[0];
      if (!match) {
        return null;
      }
      return {
        path: publicUploadPathFromStoredPath(match.path || match.destinationPath || ""),
        sha256: expected
      };
    }
  };
}

function makeRuntimeError(code, message, cause) {
  const err = new Error(message || code);
  err.code = code;
  if (cause) {
    err.cause = cause;
  }
  return err;
}

function apiRequest(uid, body) {
  return {
    uid: asPositiveInt(uid),
    body,
    query: {},
    method: "POST",
    loggedIn: true
  };
}

function apiResponse(req) {
  return {
    req,
    statusCode: 200,
    payload: null,
    set() {
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
    sendStatus(statusCode) {
      this.statusCode = statusCode;
      return statusCode;
    }
  };
}

function unwrapApiPayload(returned, res) {
  const payload = res.payload != null ? res.payload : returned;
  if (payload && payload.status && Object.prototype.hasOwnProperty.call(payload, "response")) {
    return payload.response || {};
  }
  return payload || {};
}

function apiErrorMessage(payload, fallback) {
  if (payload instanceof Error) {
    return payload.message || fallback;
  }
  if (payload && payload.status && payload.status.message) {
    return payload.status.message;
  }
  if (payload && payload.message) {
    return payload.message;
  }
  return fallback;
}

async function callWikiPageAction(action, req, code) {
  const res = apiResponse(req);
  let returned;
  try {
    returned = await action(req, res);
  } catch (err) {
    throw makeRuntimeError(code, err.message || code, err);
  }

  const statusCode = parseInt(res.statusCode, 10) || 200;
  if (statusCode < 200 || statusCode >= 300) {
    const payload = res.payload != null ? res.payload : returned;
    throw makeRuntimeError(code, apiErrorMessage(payload, code), payload instanceof Error ? payload : null);
  }

  return unwrapApiPayload(returned, res);
}

function updateNeedsMove(payload) {
  const changes = payload && payload.operation && payload.operation.changes || {};
  return !!(
    changes.title ||
    changes.category ||
    (asPositiveInt(payload && payload.previousCid) &&
      asPositiveInt(payload && payload.cid) &&
      asPositiveInt(payload.previousCid) !== asPositiveInt(payload.cid))
  );
}

function createApplyServices(options = {}) {
  const categories = require.main.require("./src/categories");
  const meta = require.main.require("./src/meta");
  const posts = require.main.require("./src/posts");
  const topics = require.main.require("./src/topics");
  const uploadsController = require.main.require("./src/controllers/uploads");
  const articleCss = require("./wiki-article-css");
  const discussionSettings = require("./wiki-discussion-settings");
  const cacheService = require("./cache-service");
  const config = require("./config");
  const wikiDirectory = require("./wiki-directory-service");
  const wikiPaths = require("./wiki-paths");

  const assetIndex = createAssetIndex(options);

  return {
    assets: {
      async findBySha256(sha256) {
        return assetIndex.findBySha256(sha256);
      },
      async importAsset({ asset, buffer, uid }) {
        if (!uploadsController || typeof uploadsController.uploadFile !== "function") {
          throw new Error("archive-apply-upload-service-unavailable");
        }
        const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
        const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-upload-"));
        const name = path.basename(String(asset && asset.path || "archive-asset.bin")) || "archive-asset.bin";
        const tempPath = path.join(tempDir, name);
        try {
        await fsp.writeFile(tempPath, content, { mode: 0o600 });
          const uploaded = await uploadsController.uploadFile(uid, {
            path: tempPath,
            name,
            type: String(asset && asset.contentType || "application/octet-stream"),
            size: content.length
          });
          const destinationPath = publicUploadPathFromStoredPath(uploaded && (uploaded.url || uploaded.path) || "");
          if (!destinationPath) {
            throw new Error("archive-apply-asset-path-missing");
          }
          return {
            path: destinationPath,
            url: destinationPath,
            name: uploaded && uploaded.name || name
          };
        } finally {
          await fsp.rm(tempDir, { recursive: true, force: true });
        }
      }
    },
    namespaces: categories && typeof categories.create === "function" ? {
      async createNamespace(payload) {
        const created = await categories.create({
          name: payload.name,
          parentCid: payload.parentCid,
          cloneFromCid: payload.parentCid,
          uid: payload.uid
        });
        return { cid: asPositiveInt(created && created.cid || created) };
      }
    } : {},
    pages: {
      async createPage(payload) {
        if (!topics || typeof topics.post !== "function") {
          throw new Error("archive-apply-page-create-service-unavailable");
        }
        const created = await topics.post({
          uid: payload.uid,
          cid: payload.cid,
          title: payload.title,
          content: payload.content,
          sourceContent: payload.sourceContent || payload.content,
          tags: []
        });
        const topicData = created && created.topicData || {};
        const postData = created && created.postData || {};
        const tid = asPositiveInt(topicData.tid || postData.tid || created && created.tid);
        const pid = asPositiveInt(postData.pid || topicData.mainPid || created && created.pid);
        const cid = asPositiveInt(topicData.cid || payload.cid);
        if (!tid || !pid) {
          throw new Error("archive-apply-page-result-invalid");
        }
        return { tid, pid, mainPid: pid, cid };
      },
      async updatePage(payload) {
        const tid = asPositiveInt(payload && payload.tid);
        const uid = asPositiveInt(payload && payload.uid);
        const cid = asPositiveInt(payload && payload.cid);
        const pid = asPositiveInt(payload && (payload.pid || payload.mainPid));
        const title = String(payload && payload.title || "").trim();
        const content = String(payload && (payload.sourceContent || payload.content) || "");
        if (!tid || !uid || !cid || !title || !content) {
          throw makeRuntimeError("archive-apply-page-update-invalid");
        }

        const wikiPageActions = require("./wiki-page-actions");
        const wikiEditLocks = require("./wiki-edit-locks");
        let moved = null;
        if (updateNeedsMove(payload)) {
          moved = await callWikiPageAction(
            wikiPageActions.moveWikiPage,
            apiRequest(uid, { tid, cid, title }),
            "archive-apply-page-move-failed"
          );
        }

        const lock = await wikiEditLocks.acquireLock(tid, uid);
        if (!lock || lock.status !== "ok" || !lock.token) {
          throw makeRuntimeError(
            "archive-apply-page-save-lock-failed",
            wikiEditLocks.getStatusMessage && wikiEditLocks.getStatusMessage(lock) || "archive-apply-page-save-lock-failed"
          );
        }

        let saveFailed = false;
        let saved = null;
        try {
          saved = await callWikiPageAction(
            wikiPageActions.saveWikiPage,
            apiRequest(uid, {
              tid,
              pid,
              title,
              content,
              wikiEditLockToken: lock.token
            }),
            "archive-apply-page-save-failed"
          );
        } catch (err) {
          saveFailed = true;
          throw err;
        } finally {
          try {
            await wikiEditLocks.releaseLock(tid, uid, lock.token);
          } catch (err) {
            if (!saveFailed) {
              throw makeRuntimeError("archive-apply-page-save-lock-release-failed", err.message, err);
            }
          }
        }

        const savedTid = asPositiveInt(saved && saved.tid) || tid;
        const savedPid = asPositiveInt(saved && (saved.pid || saved.mainPid)) || pid;
        const savedCid = asPositiveInt(saved && saved.cid) || asPositiveInt(moved && moved.cid) || cid;
        if (!savedTid || !savedPid || !savedCid) {
          throw makeRuntimeError("archive-apply-page-result-invalid");
        }
        return { tid: savedTid, pid: savedPid, mainPid: savedPid, cid: savedCid };
      }
    },
    identity: {
      async setPageArchiveId(tid, archivePageId) {
        return archiveIdentity.setPageArchiveId(tid, archivePageId, { topics });
      }
    },
    topics,
    posts,
    articleCss,
    discussionSettings,
    uploadAssociations: {
      async syncPostUploads(payload) {
        const pid = asPositiveInt(payload && payload.pid || payload);
        if (!pid) {
          throw new Error("archive-apply-upload-associations-pid-missing");
        }
        if (!posts || !posts.uploads || typeof posts.uploads.sync !== "function") {
          throw new Error("archive-apply-upload-associations-service-unavailable");
        }
        await posts.uploads.sync(pid);
      }
    },
    settings: {
      async applySettings(settings) {
        const categoryIds = (settings.categoryRoots || []).map((root) => root.cid).filter(Boolean);
        await meta.settings.set(config.SETTINGS_KEY, {
          categoryIds: categoryIds.join(", "),
          includeChildCategories: settings.includeChildCategories ? "1" : "0",
          homeTopicId: settings.homepage && settings.homepage.tid ? String(settings.homepage.tid) : "",
          routeRootCid: settings.routeRootCid ? String(settings.routeRootCid) : "",
          wikiNamespaceCreateGroups: (settings.namespaceCreatorGroups || []).join(", ")
        });
        config.invalidateSettingsCache();
      }
    },
    invalidation: {
      async invalidateNamespace(cid) {
        if (wikiDirectory && typeof wikiDirectory.invalidateNamespace === "function") {
          wikiDirectory.invalidateNamespace(cid);
        }
      },
      async invalidateContent(payload) {
        if (cacheService && typeof cacheService.clearWikiPostEditCache === "function") {
          cacheService.clearWikiPostEditCache(payload);
        }
      },
      async invalidateSearch() {},
      async invalidateListing() {
        if (wikiDirectory && typeof wikiDirectory.invalidateAllWikiCaches === "function") {
          wikiDirectory.invalidateAllWikiCaches();
        }
      },
      async invalidateWikiTreeIndex(payload) {
        if (wikiPaths && typeof wikiPaths.invalidateWikiTreeIndex === "function") {
          wikiPaths.invalidateWikiTreeIndex(payload);
        }
      }
    }
  };
}

module.exports = {
  collectDestinationAssets,
  collectDestination,
  createApplyServices,
  createUploadStore
};
