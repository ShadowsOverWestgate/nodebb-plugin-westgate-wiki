"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { installNodebbStubs, restoreNodebbStubs } = require("./helpers/nodebb-stub");

const root = path.resolve(__dirname, "..");

function clearProjectModule(relativePath) {
  const modulePath = path.join(root, relativePath);
  delete require.cache[require.resolve(modulePath)];
}

function patchProjectModule(relativePath, exports) {
  const modulePath = path.join(root, relativePath);
  const filename = require.resolve(modulePath);
  const previous = require.cache[filename];
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports
  };
  return () => {
    if (previous) {
      require.cache[filename] = previous;
    } else {
      delete require.cache[filename];
    }
  };
}

async function withNodebbStubs(stubs, fn) {
  installNodebbStubs(stubs);

  try {
    return await fn();
  } finally {
    restoreNodebbStubs();
  }
}

function createRuntimeNodebbStubs(state) {
  const uploadPath = state.uploadPath;
  return {
    "nconf": {
      get(key) {
        if (key === "upload_path") {
          return uploadPath;
        }
        if (key === "relative_path") {
          return "";
        }
        if (key === "upload_url") {
          return "/assets/uploads";
        }
        return "";
      }
    },
    "./src/categories": {
      create: async (payload) => {
        state.events.push(`category.create:${payload.name}:${payload.parentCid}:${payload.uid}`);
        return { cid: 88 };
      },
      getChildrenCids: async () => []
    },
    "./src/controllers/helpers": { formatApiResponse: () => {} },
    "./src/controllers/uploads": {
      uploadFile: async (uid, uploadedFile) => {
        state.events.push(`uploadFile:${uid}:${uploadedFile.name}:${uploadedFile.type}:${uploadedFile.size}`);
        assert.equal(await fs.readFile(uploadedFile.path, "utf8"), "asset-bytes");
        const destinationPath = path.join(uploadPath, "files", `stored-${uploadedFile.name}`);
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.copyFile(uploadedFile.path, destinationPath);
        return {
          url: `/assets/uploads/files/stored-${uploadedFile.name}`,
          name: uploadedFile.name,
          path: destinationPath
        };
      }
    },
    "./src/database": {},
    "./src/database": {
      getObject: async () => ({}),
      getSortedSetRange: async (key) => state.tidsBySet && state.tidsBySet[key] || []
    },
    "./src/groups": { getNonPrivilegeGroups: async () => state.groups || [] },
    "./src/meta": {
      settings: {
        set: async () => {},
        get: async () => ({
          categoryIds: "10",
          includeChildCategories: "0",
          homeTopicId: "",
          wikiNamespaceCreateGroups: ""
        }),
        setOnEmpty: async () => {}
      }
    },
    "./src/posts": {
      edit: async (payload) => {
        state.events.push(`post.edit:${payload.pid}:${payload.title}:${payload.uid}:${payload.content}`);
      },
      setPostFields: async (pid, fields) => {
        state.events.push(`post.fields:${pid}:${fields.content}`);
      },
      clearCachedPost: (pid) => {
        state.events.push(`post.clear:${pid}`);
      },
      uploads: {
        sync: async (pid) => {
          state.events.push(`uploads.sync:${pid}`);
        }
      }
    },
    "./src/privileges": { categories: {}, topics: {}, posts: {} },
    "./src/topics": {
      post: async (payload) => {
        state.events.push(`topic.post:${payload.cid}:${payload.title}:${payload.uid}:${payload.content}`);
        return {
          topicData: { tid: 101, cid: payload.cid, mainPid: 1001 },
          postData: { pid: 1001, tid: 101 }
        };
      },
      setTopicField: async (tid, field, value) => {
        state.events.push(`topic.field:${tid}:${field}:${value}`);
      },
      getTopicField: async (tid, field) => {
        state.events.push(`topic.getField:${tid}:${field}`);
        return tid === 77 ? "770" : "";
      },
      getTopicsFields: async (tids) => (Array.isArray(tids) ? tids : [])
        .map((tid) => state.topics && state.topics.get(parseInt(tid, 10)))
        .filter(Boolean),
      tools: {
        move: async (tid, payload) => {
          state.events.push(`topic.move:${tid}:${payload.cid}:${payload.uid}`);
        }
      }
    },
    "./src/user": { isAdministrator: async () => true },
    "./src/utils": { isNumber: () => true }
  };
}

test("runtime apply services provide page, asset, identity, and upload association adapters", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-uploads-"));
  await fs.mkdir(path.join(uploadPath, "files"), { recursive: true });
  await fs.writeFile(path.join(uploadPath, "files", "existing.txt"), "asset-bytes");
  const state = { uploadPath, events: [] };

  await withNodebbStubs(createRuntimeNodebbStubs(state), async () => {
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
    clearProjectModule("lib/content/wiki-article-css.js");
    clearProjectModule("lib/read/wiki-discussion-settings.js");
    const runtime = require("../lib/archive/wiki-archive-runtime");
    const services = runtime.createApplyServices();

    assert.equal(typeof services.assets.importAsset, "function");
    assert.equal(typeof services.assets.findBySha256, "function");
    assert.equal(typeof services.pages.createPage, "function");
    assert.equal(typeof services.revisions.ensureCreateRevision, "function");
    assert.equal(typeof services.identity.setPageArchiveId, "function");
    assert.equal(typeof services.uploadAssociations.syncPostUploads, "function");

    const crypto = require("node:crypto");
    const sha256 = crypto.createHash("sha256").update("asset-bytes").digest("hex");
    const reused = await services.assets.findBySha256(sha256);
    assert.deepEqual(reused, {
      path: "/assets/uploads/files/existing.txt",
      sha256
    });

    const imported = await services.assets.importAsset({
      asset: { path: "assets/sha256/abc123.png", contentType: "image/png" },
      buffer: Buffer.from("asset-bytes"),
      uid: 9
    });
    assert.equal(imported.path, "/assets/uploads/files/stored-abc123.png");

    assert.deepEqual(await services.pages.createPage({
      uid: 9,
      cid: 10,
      title: "Gond",
      content: "<p>Article</p>"
    }), { tid: 101, pid: 1001, mainPid: 1001, cid: 10 });

    await services.identity.setPageArchiveId(101, "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await services.uploadAssociations.syncPostUploads({ pid: 1001 });

    assert(state.events.includes("topic.field:101:westgateWikiArchivePageId:wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert(state.events.includes("uploads.sync:1001"));
  });
});

test("runtime revision service records one create revision for archive-created pages", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-create-revision-"));
  const state = { uploadPath, events: [] };
  let hasExistingRevision = false;

  const restoreRevisions = patchProjectModule("lib/pages/wiki-revisions.js", {
    hasRevisions: async (tid) => {
      state.events.push(`revision.has:${tid}`);
      return hasExistingRevision;
    },
    appendRevision: async (payload) => {
      state.events.push(`revision.append:${payload.action}:${payload.tid}:${payload.pid}:${payload.cid}:${payload.uid}:${payload.title}:${payload.canonicalPath}:${payload.oldSource}:${payload.newSource}`);
      return { revisionId: "rev-created" };
    }
  });

  try {
    await withNodebbStubs(createRuntimeNodebbStubs(state), async () => {
      clearProjectModule("lib/archive/wiki-archive-runtime.js");
      const runtime = require("../lib/archive/wiki-archive-runtime");
      const services = runtime.createApplyServices();

      assert.deepEqual(await services.revisions.ensureCreateRevision({
        uid: 9,
        tid: 77,
        pid: 770,
        cid: 11,
        title: "Gond",
        source: "<p>Article</p>",
        canonicalPath: "Lore/Deities/Gond"
      }), { revisionId: "rev-created" });
      assert.deepEqual(state.events, [
        "revision.has:77",
        "revision.append:create:77:770:11:9:Gond:Lore/Deities/Gond::<p>Article</p>"
      ]);

      state.events.length = 0;
      hasExistingRevision = true;
      assert.equal(await services.revisions.ensureCreateRevision({
        uid: 9,
        tid: 77,
        pid: 770,
        cid: 11,
        title: "Gond",
        source: "<p>Article</p>",
        canonicalPath: "Lore/Deities/Gond"
      }), null);
      assert.deepEqual(state.events, ["revision.has:77"]);
    });
  } finally {
    restoreRevisions();
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
  }
});

test("runtime updatePage routes updates through wiki page actions and an internal edit lock", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-update-page-"));
  const state = { uploadPath, events: [] };

  const restorePageActions = patchProjectModule("lib/pages/wiki-page-actions.js", {
    moveWikiPage: async (req, res) => {
      state.events.push(`action.move:${req.body.tid}:${req.body.cid}:${req.body.title}:${req.uid}`);
      res.statusCode = 200;
      res.payload = {
        tid: req.body.tid,
        cid: req.body.cid,
        title: req.body.title,
        wikiPath: "/wiki/Lore/Deities/Gond"
      };
      return res.payload;
    },
    saveWikiPage: async (req, res) => {
      state.events.push(`action.save:${req.body.tid}:${req.body.pid}:${req.body.title}:${req.uid}:${req.body.wikiEditLockToken}:${req.body.content}`);
      res.statusCode = 200;
      res.payload = {
        tid: req.body.tid,
        pid: req.body.pid,
        cid: 11,
        title: req.body.title,
        content: req.body.content,
        sourceContent: req.body.content
      };
      return res.payload;
    }
  });
  const restoreEditLocks = patchProjectModule("lib/pages/wiki-edit-locks.js", {
    acquireLock: async (tid, uid) => {
      state.events.push(`lock.acquire:${tid}:${uid}`);
      return { status: "ok", token: "runtime-lock-token" };
    },
    getStatusMessage: () => "lock failed",
    releaseLock: async (tid, uid, token) => {
      state.events.push(`lock.release:${tid}:${uid}:${token}`);
      return { status: "ok", released: true };
    }
  });

  try {
    await withNodebbStubs(createRuntimeNodebbStubs(state), async () => {
      clearProjectModule("lib/archive/wiki-archive-runtime.js");
      const runtime = require("../lib/archive/wiki-archive-runtime");
      const services = runtime.createApplyServices();

      assert.equal(typeof services.pages.updatePage, "function");
      assert.deepEqual(await services.pages.updatePage({
        uid: 9,
        tid: 77,
        pid: 770,
        previousCid: 10,
        cid: 11,
        title: "Gond",
        content: "<p>Article</p>",
        operation: {
          changes: {
            category: { from: 10, to: 11 },
            title: { from: "Old Gond", to: "Gond" }
          }
        }
      }), { tid: 77, pid: 770, mainPid: 770, cid: 11 });

      assert.deepEqual(state.events, [
        "action.move:77:11:Gond:9",
        "lock.acquire:77:9",
        "action.save:77:770:Gond:9:runtime-lock-token:<p>Article</p>",
        "lock.release:77:9:runtime-lock-token"
      ]);

      state.events.length = 0;
      assert.deepEqual(await services.pages.updatePage({
        uid: 9,
        tid: 78,
        pid: 780,
        previousCid: 11,
        cid: 11,
        title: "Gond",
        content: "<p>Updated</p>",
        operation: { changes: {} }
      }), { tid: 78, pid: 780, mainPid: 780, cid: 11 });

      assert.deepEqual(state.events, [
        "lock.acquire:78:9",
        "action.save:78:780:Gond:9:runtime-lock-token:<p>Updated</p>",
        "lock.release:78:9:runtime-lock-token"
      ]);
    });
  } finally {
    restorePageActions();
    restoreEditLocks();
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
  }
});

test("runtime apply settings preserves routeRootCid", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-settings-"));
  const state = { uploadPath, events: [] };

  await withNodebbStubs({
    ...createRuntimeNodebbStubs(state),
    "./src/meta": {
      settings: {
        set: async (key, value) => {
          state.events.push(`settings.set:${key}:${JSON.stringify(value)}`);
        },
        get: async () => ({
          categoryIds: "10",
          includeChildCategories: "0",
          homeTopicId: "",
          wikiNamespaceCreateGroups: "",
          routeRootCid: "10"
        }),
        setOnEmpty: async () => {}
      }
    }
  }, async () => {
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
    const runtime = require("../lib/archive/wiki-archive-runtime");
    const services = runtime.createApplyServices();

    await services.settings.applySettings({
      categoryRoots: [{ cid: 10 }],
      includeChildCategories: true,
      homepage: { tid: 90 },
      routeRootCid: 10,
      namespaceCreatorGroups: ["Wiki Curators"]
    });

    const settingsSet = state.events.find((event) => event.startsWith("settings.set:westgate-wiki:"));
    assert.match(settingsSet, /"routeRootCid":"10"/);
  });
});

test("collectDestination includes hashed upload assets from the default upload path", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-destination-assets-"));
  await fs.mkdir(path.join(uploadPath, "files"), { recursive: true });
  await fs.writeFile(path.join(uploadPath, "files", "gond.png"), "asset-bytes");
  const state = {
    uploadPath,
    events: [],
    tidsBySet: { "cid:10:tids": [77] },
    topics: new Map([[77, { tid: 77, cid: 10, title: "Gond", titleRaw: "Gond", mainPid: 770, deleted: 0, scheduled: 0 }]])
  };

  await withNodebbStubs({
    ...createRuntimeNodebbStubs(state),
    "./src/categories": {
      create: async () => ({ cid: 88 }),
      getCategoryData: async (cid) => ({ cid, name: "Lore", parentCid: 0, slug: "10/lore" }),
      getChildrenCids: async () => []
    },
    "./src/posts": {
      ...createRuntimeNodebbStubs(state)["./src/posts"],
      getPostFields: async () => ({ content: "<p>Gond</p>", sourceContent: "<p>Gond</p>" })
    }
  }, async () => {
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
    clearProjectModule("lib/tree/wiki-canonical-diagnostics.js");
    clearProjectModule("lib/tree/wiki-tree-index.js");
    const runtime = require("../lib/archive/wiki-archive-runtime");
    const crypto = require("node:crypto");
    const sha256 = crypto.createHash("sha256").update("asset-bytes").digest("hex");

    const destination = await runtime.collectDestination({ uid: 1 });
    assert(destination.destination.assets.some((asset) =>
      asset.path === "/assets/uploads/files/gond.png" &&
      asset.sha256 === sha256 &&
      asset.bytes === Buffer.byteLength("asset-bytes") &&
      asset.contentType === "image/png"));
  });
});

test("collectDestinationAssets hashes uploads with streams and can narrow by sha256", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-stream-assets-"));
  await fs.mkdir(path.join(uploadPath, "files"), { recursive: true });
  await fs.writeFile(path.join(uploadPath, "files", "wanted.png"), "wanted-bytes");
  await fs.writeFile(path.join(uploadPath, "files", "ignored.png"), "ignored-bytes");
  const wantedSha = crypto.createHash("sha256").update("wanted-bytes").digest("hex");
  const state = { uploadPath, events: [] };

  await withNodebbStubs(createRuntimeNodebbStubs(state), async () => {
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
    const runtime = require("../lib/archive/wiki-archive-runtime");
    const readFile = fs.readFile;
    fs.readFile = async () => {
      throw new Error("destination asset hashing must not use fs.promises.readFile");
    };
    try {
      const assets = await runtime.collectDestinationAssets({ assetSha256s: [wantedSha] });
      assert.deepEqual(assets.map((asset) => asset.path), ["/assets/uploads/files/wanted.png"]);
      assert.equal(assets[0].sha256, wantedSha);
      assert.equal(assets[0].bytes, Buffer.byteLength("wanted-bytes"));
    } finally {
      fs.readFile = readFile;
    }
  });
});

test("apply asset findBySha256 uses a cached destination asset index", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-cached-assets-"));
  await fs.mkdir(path.join(uploadPath, "files"), { recursive: true });
  const existingPath = path.join(uploadPath, "files", "existing.png");
  await fs.writeFile(existingPath, "cached-bytes");
  const sha256 = crypto.createHash("sha256").update("cached-bytes").digest("hex");
  const state = { uploadPath, events: [] };

  await withNodebbStubs(createRuntimeNodebbStubs(state), async () => {
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
    const runtime = require("../lib/archive/wiki-archive-runtime");
    const services = runtime.createApplyServices();
    const first = await services.assets.findBySha256(sha256);
    await fs.rm(existingPath);
    const second = await services.assets.findBySha256(sha256);

    assert.deepEqual(first, { path: "/assets/uploads/files/existing.png", sha256 });
    assert.deepEqual(second, { path: "/assets/uploads/files/existing.png", sha256 });
  });
});

test("apply asset findBySha256 uses seeded destination assets without scanning uploads", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-seeded-assets-"));
  const sha256 = "c".repeat(64);
  const state = { uploadPath, events: [] };

  await withNodebbStubs(createRuntimeNodebbStubs(state), async () => {
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
    const runtime = require("../lib/archive/wiki-archive-runtime");
    const readdir = fs.readdir;
    fs.readdir = async () => {
      throw new Error("seeded asset index should not scan upload files");
    };
    try {
      const services = runtime.createApplyServices({
        destinationAssets: [{ path: "/assets/uploads/files/seeded.png", sha256 }]
      });
      assert.deepEqual(await services.assets.findBySha256(sha256), {
        path: "/assets/uploads/files/seeded.png",
        sha256
      });
      assert.deepEqual(await services.assets.findBySha256(sha256), {
        path: "/assets/uploads/files/seeded.png",
        sha256
      });
    } finally {
      fs.readdir = readdir;
    }
  });
});

test("createUploadStore reads asset references from upload_path directly", async () => {
  const uploadPath = await fs.mkdtemp(path.join(os.tmpdir(), "wg-runtime-upload-store-"));
  await fs.mkdir(path.join(uploadPath, "files"), { recursive: true });
  await fs.writeFile(path.join(uploadPath, "files", "foo.png"), "image-bytes");
  const state = { uploadPath, events: [] };

  await withNodebbStubs(createRuntimeNodebbStubs(state), async () => {
    clearProjectModule("lib/archive/wiki-archive-runtime.js");
    const runtime = require("../lib/archive/wiki-archive-runtime");
    const upload = await runtime.createUploadStore().readLocalUpload("/assets/uploads/files/foo.png");

    assert.equal(upload.buffer.toString("utf8"), "image-bytes");
    assert.equal(upload.contentType, "image/png");
  });
});
