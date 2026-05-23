"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const originalMainRequire = require.main.require.bind(require.main);

function clearProjectModule(relativePath) {
  const modulePath = path.join(root, relativePath);
  delete require.cache[require.resolve(modulePath)];
}

async function withNodebbStubs(stubs, fn) {
  const previousMainRequire = require.main.require;
  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    return await fn();
  } finally {
    require.main.require = previousMainRequire;
  }
}

function createNodebbStubs(overrides = {}) {
  return {
    "nconf": { get: () => "" },
    "./src/categories": {
      buildForSelectAll: async () => [],
      getCategoryData: async () => null,
      getChildrenCids: async () => []
    },
    "./src/controllers/api": {},
    "./src/controllers/helpers": {
      formatApiResponse(status, res, payload) {
        res.statusCode = status;
        res.payload = payload;
        return { status, payload };
      }
    },
    "./src/database": {
      getObject: async () => ({}),
      getObjectField: async () => null,
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => []
    },
    "./src/groups": { getNonPrivilegeGroups: async () => [] },
    "./src/meta": { settings: { get: async () => ({}), set: async () => {}, setOnEmpty: async () => {} } },
    "./src/middleware": { ensureLoggedIn: function ensureLoggedIn() {}, checkRequired: function checkRequired() {} },
    "./src/note": {},
    "./src/notifications": {},
    "./src/plugins": { hooks: { on: () => {} } },
    "./src/posts": {},
    "./src/privileges": { categories: {}, topics: {}, posts: {} },
    "./src/routes/helpers": {
      setupAdminPageRoute: () => {},
      setupApiRoute: () => {},
      setupPageRoute: () => {}
    },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": {},
    "./src/user": { isAdministrator: async (uid) => uid === 1 },
    "./src/utils": { isNumber: () => true },
    ...overrides
  };
}

function createResponse() {
  return {
    headers: {},
    attachmentName: "",
    body: null,
    set(field, value) {
      this.headers[field.toLowerCase()] = value;
      return this;
    },
    type(value) {
      this.headers["content-type"] = value;
      return this;
    },
    attachment(filename) {
      this.attachmentName = filename;
      this.headers["content-disposition"] = `attachment; filename="${filename}"`;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    }
  };
}

async function createController(options = {}) {
  clearProjectModule("lib/controllers/wiki-archive-admin.js");
  const archiveAdmin = require("../lib/controllers/wiki-archive-admin");
  return archiveAdmin.createArchiveAdminController(options);
}

test("registers all archive admin API routes with ensureLoggedIn middleware", async () => {
  const routes = [];
  const ensureLoggedIn = function ensureLoggedIn() {};
  const stubs = createNodebbStubs({
    "./src/routes/helpers": {
      setupAdminPageRoute: () => {},
      setupPageRoute: () => {},
      setupApiRoute(router, method, routePath, middleware, handler) {
        routes.push({ method, routePath, middleware, handler });
      }
    },
    "./src/middleware": { ensureLoggedIn, checkRequired: function checkRequired() {} }
  });

  await withNodebbStubs(stubs, async () => {
    clearProjectModule("library.js");
    clearProjectModule("lib/controllers/admin.js");
    clearProjectModule("lib/controllers/wiki-archive-admin.js");
    const plugin = require("../library");
    await plugin.registerApiRoutes({
      router: {},
      middleware: { ensureLoggedIn, checkRequired: function checkRequired() {} }
    });
  });

  const expected = [
    ["post", "/westgate-wiki/archive/export-jobs"],
    ["get", "/westgate-wiki/archive/jobs/:jobId"],
    ["get", "/westgate-wiki/archive/export-jobs/:jobId/download"],
    ["post", "/westgate-wiki/archive/import-jobs"],
    ["put", "/westgate-wiki/archive/import-jobs/:jobId/apply"]
  ];
  for (const [method, routePath] of expected) {
    const route = routes.find((row) => row.method === method && row.routePath === routePath);
    assert.ok(route, `${method.toUpperCase()} ${routePath} should be registered`);
    assert.deepEqual(route.middleware, [ensureLoggedIn]);
    assert.equal(typeof route.handler, "function");
  }
});

test("archive admin routes return 403 for non-administrators", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-auth-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({ privateDir, idFactory: (type) => `job_${type}_authaaaa` });
  const controller = await createController({ jobs });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const handlers = [
      ["startExportJob", { uid: 2, body: {} }],
      ["getArchiveJob", { uid: 2, params: { jobId: "job_export_authaaaa" } }],
      ["downloadExportJob", { uid: 2, params: { jobId: "job_export_authaaaa" } }],
      ["startImportJob", { uid: 2, body: {} }],
      ["applyImportJob", { uid: 2, params: { jobId: "job_import_authaaaa" }, body: { approved: true } }]
    ];

    for (const [handlerName, req] of handlers) {
      const res = createResponse();
      await controller[handlerName](req, res);
      assert.equal(res.statusCode, 403, `${handlerName} should reject non-admin users`);
    }
  });
});

test("export job creates a completed private zip artifact and download hides private paths", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-export-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: () => "job_export_exportaaaa"
  });
  const controller = await createController({
    jobs,
    exportService: {
      createExportZip: async (input) => {
        assert.equal(typeof input.uploadStore.readLocalUpload, "function");
        return {
          zip: Buffer.from("zip-content"),
          manifest: { formatId: "westgate-wiki-archive/v1" },
          report: { warnings: [{ code: "remote-asset" }] }
        };
      }
    },
    runtime: {
      createUploadStore: () => ({
        readLocalUpload: async () => Buffer.from("asset")
      })
    }
  });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const startRes = createResponse();
    await controller.startExportJob({ uid: 1, body: {} }, startRes);
    assert.equal(startRes.statusCode, 200);
    assert.equal(startRes.payload.jobId, "job_export_exportaaaa");
    assert.equal(startRes.payload.status, "completed");
    assert.equal(startRes.payload.hasArtifact, true);
    assert.equal(startRes.payload.artifact.filename, "westgate-wiki-archive.zip");
    assert.equal(startRes.payload.artifact.contentType, "application/zip");
    assert.equal(startRes.payload.artifactPath, undefined);
    assert.equal(JSON.stringify(startRes.payload).includes(privateDir), false);

    const artifactPath = path.join(privateDir, "job_export_exportaaaa", "westgate-wiki-archive.zip");
    assert.equal(fs.existsSync(artifactPath), true);

    const downloadRes = createResponse();
    await controller.downloadExportJob({ uid: 1, params: { jobId: "job_export_exportaaaa" } }, downloadRes);
    assert.equal(downloadRes.attachmentName, "westgate-wiki-archive.zip");
    assert.equal(downloadRes.headers["content-type"], "application/zip");
    assert.equal(downloadRes.body.toString("utf8"), "zip-content");
  });
});

test("job status returns sanitized export and import snapshots", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-status-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: (type) => `job_${type}_statusaaa`
  });
  const exportJob = await jobs.createExportJob();
  await jobs.markRunning(exportJob.jobId);
  await jobs.completeJob(exportJob.jobId, {
    filename: "westgate-wiki-archive.zip",
    content: "zip",
    contentType: "application/zip",
    report: { status: "ok" }
  });
  const controller = await createController({ jobs });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const res = createResponse();
    await controller.getArchiveJob({ uid: 1, params: { jobId: exportJob.jobId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.status, "completed");
    assert.equal(res.payload.artifactPath, undefined);
    assert.equal(JSON.stringify(res.payload).includes(privateDir), false);
  });
});

test("import preview reads uploaded archive zip and stores serializable private payload", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-import-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: () => "job_import_importaaaa"
  });
  let readZipInput;
  let previewInput;
  let destinationCalls = 0;
  const manifest = { pages: [{ archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }] };
  const files = new Map([["pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html", Buffer.from("<p>Archive</p>")]]);
  const controller = await createController({
    jobs,
    archiveZip: {
      readArchiveZip: async (buffer) => {
        readZipInput = buffer;
        return { manifest, files };
      }
    },
    importService: {
      previewArchive: async (input) => {
        previewInput = input;
        return {
          status: "ok",
          blockers: [],
          warnings: [{ code: "remote-asset" }],
          operations: [{ type: "namespace.match", archiveNamespaceId: "wgan_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", cid: 10 }]
        };
      }
    },
    runtime: {
      collectDestination: async (input) => {
        destinationCalls += 1;
        assert.equal(input.uid, 1);
        return {
          canonicalDiagnostics: { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 } },
          destination: {
            namespaces: [{ cid: 10, canonicalPath: "Lore" }],
            pages: [{
              tid: 77,
              cid: 10,
              mainPid: 770,
              pid: 770,
              title: "Gond",
              canonicalPath: "Lore/Gond",
              westgateWikiArchivePageId: "wgap_existingexistingexistingexistin"
            }],
            assets: [{ path: "/assets/uploads/existing.png", sha256: "abc" }]
          },
          destinationGroups: ["Wiki Editors"],
          destinationGroupResolver: async (name) => name
        };
      }
    }
  });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const res = createResponse();
    await controller.startImportJob({ uid: 1, file: { buffer: Buffer.from("zip") }, body: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(Buffer.isBuffer(readZipInput), true);
    assert.equal(readZipInput.toString("utf8"), "zip");
    assert.equal(previewInput.manifest, manifest);
    assert.equal(previewInput.files, files);
    assert.equal(destinationCalls, 1);
    assert.deepEqual(previewInput.canonicalDiagnostics, { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 } });
    assert.deepEqual(previewInput.destination.namespaces, [{ cid: 10, canonicalPath: "Lore" }]);
    assert.equal(previewInput.destination.pages[0].mainPid, 770);
    assert.equal(previewInput.destination.pages[0].westgateWikiArchivePageId, "wgap_existingexistingexistingexistin");
    assert.deepEqual(previewInput.destinationGroups, ["Wiki Editors"]);
    assert.equal(await previewInput.destinationGroupResolver("Wiki Editors"), "Wiki Editors");
    assert.equal(res.payload.jobId, "job_import_importaaaa");
    assert.equal(res.payload.preview.status, "ok");
    assert.equal(res.payload.privatePayloadPath, undefined);
    assert.equal(JSON.stringify(res.payload).includes(privateDir), false);

    const stored = await jobs.readPrivatePayload("job_import_importaaaa", "archive");
    assert.deepEqual(stored.manifest, manifest);
    assert.equal(stored.files[0].path, "pages/wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html");
    assert.equal(stored.files[0].contentBase64, Buffer.from("<p>Archive</p>").toString("base64"));
  });
});

test("import preview accepts multer disk files and rejects over-limit uploads before reading", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-disk-import-"));
  const uploadDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-disk-upload-"));
  const archivePath = path.join(uploadDir, "archive.zip");
  await fsp.writeFile(archivePath, "zip-on-disk");
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: () => "job_import_diskfile"
  });
  let readZipInput;
  const controller = await createController({
    jobs,
    policy: { limits: { maxArchiveBytes: 20 } },
    archiveZip: {
      readArchiveZip: async (buffer) => {
        readZipInput = buffer;
        return { manifest: { pages: [], assets: [] }, files: new Map() };
      }
    },
    importService: {
      previewArchive: async () => ({ status: "ok", blockers: [], warnings: [], operations: [] })
    },
    runtime: {
      collectDestination: async () => ({
        canonicalDiagnostics: { status: "ok" },
        destination: { namespaces: [], pages: [], assets: [] },
        destinationGroups: []
      })
    }
  });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const res = createResponse();
    await controller.startImportJob({
      uid: 1,
      files: [{ path: archivePath, size: Buffer.byteLength("zip-on-disk"), originalname: "archive.zip" }],
      body: {}
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(readZipInput.toString("utf8"), "zip-on-disk");
  });

  const oversizedPath = path.join(uploadDir, "oversized.zip");
  await fsp.writeFile(oversizedPath, "this file is too large");
  const blockedController = await createController({
    jobs,
    policy: { limits: { maxArchiveBytes: 4 } },
    archiveZip: {
      readArchiveZip: async () => {
        throw new Error("zip should not be read");
      }
    }
  });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const readFile = fsp.readFile;
    let readFileCalls = 0;
    fsp.readFile = async (...args) => {
      readFileCalls += 1;
      return readFile(...args);
    };
    try {
      const res = createResponse();
      await blockedController.startImportJob({
        uid: 1,
        files: [{ path: oversizedPath, size: Buffer.byteLength("this file is too large"), originalname: "oversized.zip" }],
        body: {}
      }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.payload.message, /archive-limit-exceeded/);
      assert.equal(readFileCalls, 0);
    } finally {
      fsp.readFile = readFile;
    }
  });
});

test("import preview passes archive asset hashes to destination collection", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-asset-filter-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: () => "job_import_filterhash"
  });
  const sha256 = "a".repeat(64);
  let collectInput;
  const controller = await createController({
    jobs,
    archiveZip: {
      readArchiveZip: async () => ({
        manifest: {
          pages: [],
          assets: [{ assetId: "asset_a", sha256, path: `assets/sha256/${sha256}.png`, bytes: 3, contentType: "image/png" }]
        },
        files: new Map()
      })
    },
    importService: {
      previewArchive: async (input) => {
        assert.deepEqual(input.destination.assets, [{ path: "/assets/uploads/files/reused.png", sha256 }]);
        return { status: "ok", blockers: [], warnings: [], operations: [] };
      }
    },
    runtime: {
      collectDestination: async (input) => {
        collectInput = input;
        return {
          canonicalDiagnostics: { status: "ok" },
          destination: { namespaces: [], pages: [], assets: [{ path: "/assets/uploads/files/reused.png", sha256 }] },
          destinationGroups: []
        };
      }
    }
  });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const res = createResponse();
    await controller.startImportJob({ uid: 1, file: { buffer: Buffer.from("zip") }, body: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(collectInput.assetSha256s, [sha256]);
  });
});

test("apply recollects archive asset hashes and seeds default apply services with destination assets", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-apply-assets-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: (type) => type === "import" ? `job_import_${jobs.nextId.shift()}` : "job_export_unused"
  });
  jobs.nextId = ["previewassets", "applyassets"];
  const sha256 = "b".repeat(64);
  const previewJob = await jobs.createImportJob({ phase: "preview" });
  await jobs.markRunning(previewJob.jobId);
  await jobs.storePrivatePayload(previewJob.jobId, "archive", {
    manifest: {
      pages: [],
      assets: [{ assetId: "asset_b", sha256, path: `assets/sha256/${sha256}.png`, bytes: 3, contentType: "image/png" }]
    },
    files: [],
    preview: { status: "ok", blockers: [], operations: [{ type: "asset.reuse", assetId: "asset_b", sha256, destinationPath: "/assets/uploads/files/reused.png" }] }
  });
  await jobs.completeJob(previewJob.jobId, {
    report: { status: "preview-ready", preview: { status: "ok", blockers: [], operations: [{ type: "asset.reuse", assetId: "asset_b", sha256, destinationPath: "/assets/uploads/files/reused.png" }] } }
  });
  let collectInput;
  let servicesInput;
  const controller = await createController({
    jobs,
    applyService: {
      applyArchive: async (input) => {
        assert.equal(await input.services.assets.findBySha256(sha256).then((asset) => asset.path), "/assets/uploads/files/reused.png");
        return { status: "completed" };
      }
    },
    runtime: {
      collectDestination: async (input) => {
        collectInput = input;
        return {
          canonicalDiagnostics: { status: "ok" },
          destination: { namespaces: [], pages: [], assets: [{ path: "/assets/uploads/files/reused.png", sha256 }] },
          destinationGroups: []
        };
      },
      createApplyServices: (input) => {
        servicesInput = input;
        const rows = input.destinationAssets || [];
        return {
          assets: {
            findBySha256: async (hash) => rows.find((asset) => asset.sha256 === hash) || null
          }
        };
      }
    }
  });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const res = createResponse();
    await controller.applyImportJob({
      uid: 1,
      params: { jobId: previewJob.jobId },
      body: { approved: true }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(collectInput.assetSha256s, [sha256]);
    assert.deepEqual(servicesInput.destinationAssets, [{ path: "/assets/uploads/files/reused.png", sha256 }]);
  });
});

test("apply refuses missing approval and blocked previews, then calls apply service when approved", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-apply-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: (type) => type === "import" ? `job_import_${jobs.nextId.shift()}` : "job_export_unused"
  });
  jobs.nextId = ["previewaa", "blockedaa", "applyaaaa"];
  const importJob = await jobs.createImportJob();
  await jobs.markRunning(importJob.jobId);
  await jobs.storePrivatePayload(importJob.jobId, "archive", {
    manifest: { pages: [] },
    files: [],
    preview: { status: "ok", blockers: [], operations: [{ type: "settings.preview" }] }
  });
  await jobs.completeJob(importJob.jobId, { report: { status: "preview-ready" } });
  const calls = [];
  let destinationCalls = 0;
  const controller = await createController({
    jobs,
    applyService: {
      applyArchive: async (input) => {
        calls.push(input);
        return { status: "completed", results: [{ type: "settings.preview", status: "skipped" }] };
      }
    },
    applyServices: {
      settings: { applySettings: async () => {} },
      invalidation: { invalidateWikiTreeIndex: async () => {} }
    },
    runtime: {
      collectDestination: async () => {
        destinationCalls += 1;
        return {
          canonicalDiagnostics: { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 } },
          destination: {
            namespaces: [{ cid: 10, canonicalPath: "Lore" }],
            pages: [{ tid: 77, cid: 10, mainPid: 770, pid: 770, title: "Gond", canonicalPath: "Lore/Gond", westgateWikiArchivePageId: "wgap_existingexistingexistingexistin" }],
            assets: []
          },
          destinationGroups: ["Wiki Editors"]
        };
      }
    }
  });

  await withNodebbStubs(createNodebbStubs(), async () => {
    const missingApprovalRes = createResponse();
    await controller.applyImportJob({
      uid: 1,
      params: { jobId: importJob.jobId },
      body: { includeSettings: true }
    }, missingApprovalRes);
    assert.equal(missingApprovalRes.statusCode, 400);
    assert.equal(calls.length, 0);

    const blockedJob = await jobs.createImportJob();
    await jobs.markRunning(blockedJob.jobId);
    await jobs.storePrivatePayload(blockedJob.jobId, "archive", {
      manifest: { pages: [] },
      files: [],
      preview: { status: "blocked", blockers: [{ code: "page-id-path-disagreement" }], operations: [] }
    });
    await jobs.completeJob(blockedJob.jobId, {
      report: { status: "preview-ready", preview: { status: "blocked", blockers: [{ code: "page-id-path-disagreement" }], operations: [] } }
    });
    const blockedRes = createResponse();
    await controller.applyImportJob({
      uid: 1,
      params: { jobId: blockedJob.jobId },
      body: { approved: true }
    }, blockedRes);
    assert.equal(blockedRes.statusCode, 409);
    assert.equal(calls.length, 0);

    const approvedRes = createResponse();
    await controller.applyImportJob({
      uid: 1,
      params: { jobId: importJob.jobId },
      body: { approved: true, includeSettings: true }
    }, approvedRes);
    assert.equal(approvedRes.statusCode, 200);
    assert.equal(approvedRes.payload.jobId, "job_import_applyaaaa");
    assert.equal(approvedRes.payload.previewJobId, importJob.jobId);
    assert.equal(calls.length, 1);
    assert.equal(destinationCalls, 1);
    assert.equal(calls[0].uid, 1);
    assert.equal(calls[0].includeSettings, true);
    assert.equal(calls[0].preview.approved, true);
    assert.deepEqual(calls[0].canonicalDiagnostics, { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 } });
    assert.equal(calls[0].destination.pages[0].mainPid, 770);
    assert.deepEqual(calls[0].destinationGroups, ["Wiki Editors"]);
    assert.deepEqual(approvedRes.payload.applyReport, { status: "completed", results: [{ type: "settings.preview", status: "skipped" }] });

    const previewJob = await jobs.getJob(importJob.jobId);
    assert.equal(previewJob.report.status, "preview-ready");
    const applyJob = await jobs.getJob("job_import_applyaaaa");
    assert.equal(applyJob.phase, "apply");
    assert.equal(applyJob.status, "completed");
    assert.equal(applyJob.report.status, "applied");
    assert.equal(applyJob.report.applyReport.status, "completed");
  });
});

test("default runtime apply services let approved page and asset imports reach apply", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-default-apply-"));
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: (type) => type === "import" ? `job_import_${jobs.nextId.shift()}` : "job_export_unused"
  });
  jobs.nextId = ["previewdefault", "applydefault"];
  let applyCalls = 0;
  const uploadPath = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-upload-"));
  const stubs = createNodebbStubs({
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
    "./src/controllers/uploads": {
      uploadFile: async () => ({ url: "/assets/uploads/files/imported.png" })
    },
    "./src/posts": {
      edit: async () => {},
      setPostFields: async () => {},
      clearCachedPost: () => {},
      uploads: { sync: async () => {} }
    },
    "./src/topics": {
      post: async () => ({ topicData: { tid: 100, cid: 10, mainPid: 1000 }, postData: { pid: 1000 } }),
      setTopicField: async () => {},
      getTopicField: async () => "",
      tools: { move: async () => {} }
    }
  });

  await withNodebbStubs(stubs, async () => {
    clearProjectModule("lib/wiki-archive-runtime.js");
    clearProjectModule("lib/controllers/wiki-archive-admin.js");
    const runtime = require("../lib/wiki-archive-runtime");
    const controller = await createController({
      jobs,
      archiveZip: {
        readArchiveZip: async () => ({
          manifest: { pages: [], assets: [] },
          files: new Map()
        })
      },
      importService: {
        previewArchive: async () => ({
          status: "ok",
          blockers: [],
          warnings: [],
          operations: [
            { type: "asset.import", assetId: "asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
            { type: "page.create", archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
          ]
        })
      },
      applyService: {
        applyArchive: async (input) => {
          applyCalls += 1;
          assert.equal(typeof input.services.assets.importAsset, "function");
          assert.equal(typeof input.services.pages.createPage, "function");
          assert.equal(typeof input.services.identity.setPageArchiveId, "function");
          assert.equal(typeof input.services.uploadAssociations.syncPostUploads, "function");
          return { status: "completed" };
        }
      },
      runtime: {
        collectDestination: async () => ({
          canonicalDiagnostics: { status: "ok" },
          destination: { namespaces: [], pages: [], assets: [] },
          destinationGroups: []
        }),
        createApplyServices: runtime.createApplyServices
      }
    });

    const previewRes = createResponse();
    await controller.startImportJob({ uid: 1, file: { buffer: Buffer.from("zip") }, body: {} }, previewRes);
    assert.equal(previewRes.statusCode, 200);
    assert.equal(previewRes.payload.preview.status, "ok");

    const applyRes = createResponse();
    await controller.applyImportJob({
      uid: 1,
      params: { jobId: previewRes.payload.jobId },
      body: { approved: true }
    }, applyRes);
    assert.equal(applyRes.statusCode, 200);
    assert.equal(applyCalls, 1);
  });
});

test("import preview sees default runtime destination upload assets", async () => {
  const privateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-destination-assets-"));
  const uploadPath = await fsp.mkdtemp(path.join(os.tmpdir(), "wg-archive-admin-upload-assets-"));
  await fsp.mkdir(path.join(uploadPath, "files"), { recursive: true });
  await fsp.writeFile(path.join(uploadPath, "files", "gond.png"), "asset-bytes");
  const archiveJobs = require("../lib/wiki-archive-jobs");
  const jobs = archiveJobs.createArchiveJobService({
    privateDir,
    idFactory: () => "job_import_assetpreview"
  });
  let previewInput;
  const stubs = createNodebbStubs({
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
      buildForSelectAll: async () => [],
      create: async () => ({ cid: 88 }),
      getCategoryData: async (cid) => ({ cid, name: "Lore", parentCid: 0, slug: "10/lore" }),
      getChildrenCids: async () => []
    },
    "./src/database": {
      getObject: async () => ({}),
      getObjectField: async () => null,
      getSortedSetRange: async (key) => key === "cid:10:tids" ? [77] : [],
      getSortedSetRevRange: async () => []
    },
    "./src/meta": {
      settings: {
        get: async () => ({ categoryIds: "10", includeChildCategories: "0" }),
        set: async () => {},
        setOnEmpty: async () => {}
      }
    },
    "./src/posts": {
      getPostFields: async () => ({ content: "<p>Gond</p>", sourceContent: "<p>Gond</p>" })
    },
    "./src/topics": {
      getTopicField: async () => "",
      getTopicsFields: async () => [{ tid: 77, cid: 10, title: "Gond", titleRaw: "Gond", mainPid: 770, deleted: 0, scheduled: 0 }]
    }
  });

  await withNodebbStubs(stubs, async () => {
    clearProjectModule("lib/wiki-archive-runtime.js");
    clearProjectModule("lib/controllers/wiki-archive-admin.js");
    clearProjectModule("lib/wiki-path-migration.js");
    clearProjectModule("lib/wiki-tree-index.js");
    const controller = await createController({
      jobs,
      archiveZip: {
        readArchiveZip: async () => ({ manifest: { pages: [], assets: [] }, files: new Map() })
      },
      importService: {
        previewArchive: async (input) => {
          previewInput = input;
          return { status: "ok", blockers: [], warnings: [], operations: [] };
        }
      }
    });

    const res = createResponse();
    await controller.startImportJob({ uid: 1, file: { buffer: Buffer.from("zip") }, body: {} }, res);
    assert.equal(res.statusCode, 200);
    assert(previewInput.destination.assets.some((asset) =>
      asset.path === "/assets/uploads/files/gond.png" &&
      asset.sha256 &&
      asset.bytes === Buffer.byteLength("asset-bytes") &&
      asset.contentType === "image/png"));
  });
});

test("ACP template and client expose archive controls and route paths", () => {
  const adminTemplate = fs.readFileSync(path.join(root, "templates/admin/plugins/westgate-wiki.tpl"), "utf8");
  const adminClient = fs.readFileSync(path.join(root, "public/admin.js"), "utf8");

  assert.match(adminTemplate, /data-wiki-archive-panel/);
  assert.match(adminTemplate, /data-wiki-archive-export-start/);
  assert.match(adminTemplate, /data-wiki-archive-export-download/);
  assert.match(adminTemplate, /data-wiki-archive-import-file/);
  assert.match(adminTemplate, /data-wiki-archive-import-preview/);
  assert.match(adminTemplate, /data-wiki-archive-include-settings/);
  assert.match(adminTemplate, /data-wiki-archive-apply-approved/);
  assert.match(adminTemplate, /data-wiki-archive-apply/);

  assert.match(adminClient, /archive\/export-jobs/);
  assert.match(adminClient, /archive\/jobs\//);
  assert.match(adminClient, /archive\/export-jobs\/.*\/download/);
  assert.match(adminClient, /archive\/import-jobs/);
  assert.match(adminClient, /archive\/import-jobs\/.*\/apply/);
  assert.doesNotMatch(adminClient, /arrayBufferToBase64/);
  assert.doesNotMatch(adminClient, /archiveBuffer/);
  assert.match(adminClient, /new FormData\(\)/);
  assert.match(adminClient, /\.append\("archive"/);
  assert.match(adminClient, /wikiArchiveApprovedJobId/);
  assert.match(adminClient, /resetArchiveApproval/);
});
