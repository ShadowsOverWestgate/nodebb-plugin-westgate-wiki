"use strict";

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const archiveJobs = require("../wiki-archive-jobs");
const archiveExport = require("../wiki-archive-export");
const archiveImport = require("../wiki-archive-import");
const archiveApply = require("../wiki-archive-apply");
const archiveZip = require("../wiki-archive-zip");
const archiveRuntime = require("../wiki-archive-runtime");
const archiveConfig = require("../wiki-archive-config");

const DEFAULT_EXPORT_FILENAME = "westgate-wiki-archive.zip";

let defaultJobs;

function getHelpers() {
  return require.main.require("./src/controllers/helpers");
}

function getUser() {
  return require.main.require("./src/user");
}

function createDefaultJobs() {
  if (!defaultJobs) {
    defaultJobs = archiveJobs.createArchiveJobService({
      privateDir: path.join(os.tmpdir(), "nodebb-plugin-westgate-wiki-archive")
    });
  }
  return defaultJobs;
}

function makeError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

async function assertAdministrator(req, res) {
  if (await getUser().isAdministrator(req.uid)) {
    return true;
  }

  getHelpers().formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  return false;
}

function apiResponse(status, res, payload) {
  return getHelpers().formatApiResponse(status, res, payload);
}

function sanitizePrivatePaths(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizePrivatePaths);
  }
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) {
    return value;
  }
  const output = {};
  Object.keys(value).forEach((key) => {
    if (key === "artifactPath" || key === "privatePath" || key === "privatePayloadPath" || key === "privatePayloadPaths") {
      return;
    }
    output[key] = sanitizePrivatePaths(value[key]);
  });
  return output;
}

function normalizeReports(result = {}) {
  if (result.report) {
    return result.report;
  }
  const reports = result.manifest && Array.isArray(result.manifest.reports) ? result.manifest.reports : [];
  return {
    status: "completed",
    warnings: reports.filter((entry) => entry && entry.severity === "warning"),
    reports
  };
}

function formatErrorStatus(err, fallbackStatus) {
  if (err && Number.isInteger(err.statusCode)) {
    return err.statusCode;
  }
  if (err && (
    err.code === "archive-apply-preview-blocked" ||
    err.code === "archive-apply-preview-stale" ||
    err.message === "archive-apply-preview-blocked" ||
    err.message === "archive-apply-preview-stale"
  )) {
    return 409;
  }
  if (err && (
    err.code === "archive-approval-required" ||
    err.code === "archive-buffer-required" ||
    err.code === "archive-limit-exceeded" ||
    err.code === "archive-import-preview-not-applyable" ||
    err.message === "archive-approval-required" ||
    err.message === "archive-buffer-required" ||
    err.message === "archive-limit-exceeded" ||
    err.message === "archive-import-preview-not-applyable"
  )) {
    return 400;
  }
  if (err && err.message === "archive-artifact-not-found") {
    return 404;
  }
  return fallbackStatus || 500;
}

function assertArchiveSize(size, policy) {
  const maxArchiveBytes = policy && policy.limits && policy.limits.maxArchiveBytes;
  if (Number.isInteger(size) && Number.isInteger(maxArchiveBytes) && maxArchiveBytes > 0 && size > maxArchiveBytes) {
    throw makeError("archive-limit-exceeded", "archive-limit-exceeded: archiveBytes");
  }
}

function decodedBase64Size(value) {
  const clean = String(value || "").replace(/\s+/g, "");
  if (!clean) {
    return 0;
  }
  const padding = clean.endsWith("==") ? 2 : (clean.endsWith("=") ? 1 : 0);
  return Math.floor(clean.length * 3 / 4) - padding;
}

function firstUploadedFile(req = {}) {
  if (req.file) {
    return req.file;
  }
  if (Array.isArray(req.files) && req.files[0]) {
    return req.files[0];
  }
  if (req.files && typeof req.files === "object") {
    const firstKey = Object.keys(req.files)[0];
    const value = firstKey ? req.files[firstKey] : null;
    return Array.isArray(value) ? value[0] : value;
  }
  return null;
}

async function getArchiveBuffer(req = {}, policy) {
  const uploadedFile = firstUploadedFile(req);
  if (uploadedFile && Buffer.isBuffer(uploadedFile.buffer)) {
    assertArchiveSize(uploadedFile.size || uploadedFile.buffer.length, policy);
    return uploadedFile.buffer;
  }
  if (uploadedFile && uploadedFile.path) {
    const size = Number.isInteger(uploadedFile.size) ? uploadedFile.size : (await fs.stat(uploadedFile.path)).size;
    assertArchiveSize(size, policy);
    return fs.readFile(uploadedFile.path);
  }
  if (req.file && Buffer.isBuffer(req.file.buffer)) {
    return req.file.buffer;
  }
  if (Array.isArray(req.files) && req.files[0] && Buffer.isBuffer(req.files[0].buffer)) {
    return req.files[0].buffer;
  }
  if (req.body && Buffer.isBuffer(req.body.archiveBuffer)) {
    assertArchiveSize(req.body.archiveBuffer.length, policy);
    return req.body.archiveBuffer;
  }
  if (req.body && typeof req.body.archiveBuffer === "string") {
    assertArchiveSize(decodedBase64Size(req.body.archiveBuffer), policy);
    return Buffer.from(req.body.archiveBuffer, "base64");
  }
  if (req.body && typeof req.body.archiveBase64 === "string") {
    assertArchiveSize(decodedBase64Size(req.body.archiveBase64), policy);
    return Buffer.from(req.body.archiveBase64, "base64");
  }
  throw makeError("archive-buffer-required");
}

function fileEntries(files) {
  if (files instanceof Map) {
    return Array.from(files.entries());
  }
  if (files && typeof files === "object") {
    return Object.keys(files).map((key) => [key, files[key]]);
  }
  return [];
}

function serializeArchivePayload(manifest, files, preview) {
  return {
    manifest,
    files: fileEntries(files).map(([entryPath, content]) => ({
      path: entryPath,
      contentBase64: Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(String(content || "")).toString("base64")
    })),
    preview
  };
}

function deserializeArchivePayload(payload = {}) {
  return {
    manifest: payload.manifest,
    files: new Map((payload.files || []).map((entry) => [
      entry.path,
      Buffer.from(String(entry.contentBase64 || ""), "base64")
    ])),
    preview: payload.preview
  };
}

function previewFromJob(job, payload) {
  return job && job.report && job.report.preview || payload && payload.preview || null;
}

function hasFunction(root, dottedPath) {
  const value = dottedPath.split(".").reduce((current, key) => current && current[key], root);
  return typeof value === "function";
}

function addRequiredService(blockers, services, operationType, servicePath) {
  if (!hasFunction(services, servicePath)) {
    blockers.push({
      severity: "blocker",
      code: "archive-apply-service-unavailable",
      operationType,
      service: servicePath
    });
  }
}

function collectApplyPreflightBlockers(preview, services, options = {}) {
  const blockers = [];
  const operations = Array.isArray(preview && preview.operations) ? preview.operations : [];
  operations.forEach((operation) => {
    const type = operation && operation.type;
    if (type === "asset.import") {
      addRequiredService(blockers, services, type, "assets.importAsset");
    }
    if (type === "namespace.create") {
      addRequiredService(blockers, services, type, "namespaces.createNamespace");
      addRequiredService(blockers, services, type, "invalidation.invalidateNamespace");
      addRequiredService(blockers, services, type, "invalidation.invalidateListing");
      addRequiredService(blockers, services, type, "invalidation.invalidateWikiTreeIndex");
    }
    if (type === "page.create" || type === "page.update" || type === "page.adopt") {
      if (type === "page.create") {
        addRequiredService(blockers, services, type, "pages.createPage");
        addRequiredService(blockers, services, type, "revisions.ensureCreateRevision");
      } else if (!hasFunction(services, "pages.updatePage")) {
        addRequiredService(blockers, services, type, "posts.edit");
      }
      if (!hasFunction(services, "identity.setPageArchiveId")) {
        addRequiredService(blockers, services, type, "topics.setTopicField");
      }
      addRequiredService(blockers, services, type, "articleCss.setArticleCss");
      addRequiredService(blockers, services, type, "discussionSettings.setDiscussionDisabled");
      addRequiredService(blockers, services, type, "uploadAssociations.syncPostUploads");
      addRequiredService(blockers, services, type, "invalidation.invalidateNamespace");
      addRequiredService(blockers, services, type, "invalidation.invalidateContent");
      addRequiredService(blockers, services, type, "invalidation.invalidateSearch");
      addRequiredService(blockers, services, type, "invalidation.invalidateListing");
      addRequiredService(blockers, services, type, "invalidation.invalidateWikiTreeIndex");
    }
    if (type === "settings.preview" && options.includeSettings) {
      addRequiredService(blockers, services, type, "settings.applySettings");
      addRequiredService(blockers, services, type, "invalidation.invalidateWikiTreeIndex");
    }
  });
  return blockers;
}

function withApplyPreflight(preview, services, options = {}) {
  const blockers = collectApplyPreflightBlockers(preview, services, options);
  if (!blockers.length) {
    return preview;
  }
  return {
    ...(preview || {}),
    status: "blocked",
    blockers: (preview && Array.isArray(preview.blockers) ? preview.blockers : []).concat(blockers)
  };
}

function createArchiveAdminController(options = {}) {
  const jobs = options.jobs || createDefaultJobs();
  const exportService = options.exportService || archiveExport;
  const importService = options.importService || archiveImport;
  const applyService = options.applyService || archiveApply;
  const zipService = options.archiveZip || archiveZip;
  const runtime = options.runtime || archiveRuntime;
  const policy = archiveConfig.normalizeArchivePolicy(options.policy || {});
  const hasInjectedApplyServices = Object.prototype.hasOwnProperty.call(options, "applyServices");

  function getApplyServices(serviceOptions = {}) {
    if (hasInjectedApplyServices) {
      return options.applyServices || {};
    }
    if (runtime && typeof runtime.createApplyServices === "function") {
      try {
        return runtime.createApplyServices(serviceOptions) || {};
      } catch (err) {
        return {};
      }
    }
    return {};
  }

  async function collectDestinationContext(req, context = {}) {
    if (runtime && typeof runtime.collectDestination === "function") {
      return runtime.collectDestination({ uid: req.uid, req, assetSha256s: context.assetSha256s });
    }
    return {
      canonicalDiagnostics: { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 } },
      destination: { namespaces: [], pages: [], assets: [] },
      destinationGroups: []
    };
  }

  function getManifestAssetSha256s(manifest = {}) {
    return [...new Set((Array.isArray(manifest.assets) ? manifest.assets : [])
      .map((asset) => String(asset && asset.sha256 || "").trim().toLowerCase())
      .filter((sha256) => /^[0-9a-f]{64}$/.test(sha256)))]
      .sort();
  }

  async function startExportJob(req, res) {
    if (!await assertAdministrator(req, res)) {
      return;
    }

    let job;
    try {
      job = await jobs.createExportJob();
      await jobs.markRunning(job.jobId);
      const result = await exportService.createExportZip({
        uid: req.uid,
        requestBody: req.body || {},
        uploadStore: runtime && typeof runtime.createUploadStore === "function" ? runtime.createUploadStore() : undefined
      });
      const completed = await jobs.completeJob(job.jobId, {
        filename: DEFAULT_EXPORT_FILENAME,
        content: result.zip,
        contentType: "application/zip",
        report: normalizeReports(result)
      });
      return apiResponse(200, res, sanitizePrivatePaths(completed));
    } catch (err) {
      if (job && job.jobId) {
        try {
          await jobs.failJob(job.jobId, err);
        } catch (failErr) {
          // The original error is more useful to the operator.
        }
      }
      return apiResponse(formatErrorStatus(err), res, err);
    }
  }

  async function getArchiveJob(req, res) {
    if (!await assertAdministrator(req, res)) {
      return;
    }

    try {
      const job = await jobs.getJob(req.params && req.params.jobId);
      return apiResponse(200, res, sanitizePrivatePaths(job));
    } catch (err) {
      return apiResponse(formatErrorStatus(err, 404), res, err);
    }
  }

  async function downloadExportJob(req, res) {
    if (!await assertAdministrator(req, res)) {
      return;
    }

    try {
      const job = await jobs.getJob(req.params && req.params.jobId);
      if (job.type !== "export" || job.status !== "completed" || !job.hasArtifact) {
        throw makeError("archive-export-artifact-unavailable");
      }
      const artifact = await jobs.readArtifact(job.jobId);
      res.attachment(artifact.filename || DEFAULT_EXPORT_FILENAME);
      res.type(artifact.contentType || "application/zip");
      return res.send(artifact.content);
    } catch (err) {
      return apiResponse(formatErrorStatus(err, 404), res, err);
    }
  }

  async function startImportJob(req, res) {
    if (!await assertAdministrator(req, res)) {
      return;
    }

    let job;
    try {
      const buffer = await getArchiveBuffer(req, policy);
      job = await jobs.createImportJob({ phase: "preview" });
      await jobs.markRunning(job.jobId);
      const archive = await zipService.readArchiveZip(buffer, {
        uid: req.uid,
        requestBody: req.body || {},
        policy
      });
      const destinationContext = await collectDestinationContext(req, {
        assetSha256s: getManifestAssetSha256s(archive.manifest)
      });
      const includeSettings = req.body && (req.body.includeSettings === true || req.body.includeSettings === "true");
      const preview = await importService.previewArchive({
        manifest: archive.manifest,
        files: archive.files,
        includeSettings,
        canonicalDiagnostics: destinationContext.canonicalDiagnostics,
        destination: destinationContext.destination,
        destinationGroups: destinationContext.destinationGroups,
        destinationGroupResolver: destinationContext.destinationGroupResolver
      });
      const previewWithPreflight = withApplyPreflight(preview, getApplyServices(), { includeSettings });
      await jobs.storePrivatePayload(job.jobId, "archive", serializeArchivePayload(archive.manifest, archive.files, previewWithPreflight));
      const completed = await jobs.completeJob(job.jobId, {
        report: {
          status: "preview-ready",
          preview: previewWithPreflight
        }
      });
      return apiResponse(200, res, sanitizePrivatePaths({
        ...completed,
        preview: previewWithPreflight
      }));
    } catch (err) {
      if (job && job.jobId) {
        try {
          await jobs.failJob(job.jobId, err);
        } catch (failErr) {
          // Keep the route response focused on the preview failure.
        }
      }
      return apiResponse(formatErrorStatus(err, 400), res, err);
    }
  }

  async function applyImportJob(req, res) {
    if (!await assertAdministrator(req, res)) {
      return;
    }

    let applyJob;
    try {
      if (!(req.body && (req.body.approved === true || req.body.approved === "true"))) {
        throw makeError("archive-approval-required");
      }
      const job = await jobs.getJob(req.params && req.params.jobId);
      if (job.type !== "import") {
        throw makeError("archive-import-job-required");
      }
      const payload = deserializeArchivePayload(await jobs.readPrivatePayload(job.jobId, "archive"));
      const currentPreview = previewFromJob(job, payload);
      if (!currentPreview || currentPreview.status === "blocked" || (Array.isArray(currentPreview.blockers) && currentPreview.blockers.length)) {
        throw makeError("archive-apply-preview-blocked");
      }

      const includeSettings = req.body.includeSettings === true || req.body.includeSettings === "true";
      const assetSha256s = getManifestAssetSha256s(payload.manifest);
      const destinationContext = await collectDestinationContext(req, { assetSha256s });
      const applyServices = getApplyServices({
        destinationAssets: destinationContext.destination && destinationContext.destination.assets,
        assetSha256s
      });
      const approvedPreview = {
        ...currentPreview,
        approved: true
      };
      const preflightBlockers = collectApplyPreflightBlockers(approvedPreview, applyServices, { includeSettings });
      if (preflightBlockers.length) {
        const err = makeError("archive-apply-preview-blocked");
        err.blockers = preflightBlockers;
        throw err;
      }

      applyJob = await jobs.createImportJob({ phase: "apply" });
      await jobs.markRunning(applyJob.jobId);
      const applyReport = await applyService.applyArchive({
        manifest: payload.manifest,
        files: payload.files,
        preview: approvedPreview,
        uid: req.uid,
        includeSettings,
        canonicalDiagnostics: destinationContext.canonicalDiagnostics,
        destination: destinationContext.destination,
        destinationGroups: destinationContext.destinationGroups,
        destinationGroupResolver: destinationContext.destinationGroupResolver,
        services: applyServices
      });
      const completedApplyJob = await jobs.completeJob(applyJob.jobId, {
        report: {
          status: "applied",
          previewJobId: job.jobId,
          preview: currentPreview,
          applyReport
        }
      });
      return apiResponse(200, res, sanitizePrivatePaths({
        ...completedApplyJob,
        previewJobId: job.jobId,
        applyReport
      }));
    } catch (err) {
      if (applyJob && applyJob.jobId) {
        try {
          await jobs.failJob(applyJob.jobId, err);
        } catch (failErr) {
          // Keep the route response focused on the apply failure.
        }
      }
      return apiResponse(formatErrorStatus(err), res, err);
    }
  }

  return {
    applyImportJob,
    downloadExportJob,
    getArchiveJob,
    startExportJob,
    startImportJob
  };
}

const defaultController = createArchiveAdminController();

module.exports = {
  createArchiveAdminController,
  ...defaultController
};
