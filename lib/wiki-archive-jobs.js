"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const archiveConfig = require("./wiki-archive-config");

const JOB_STATUSES = new Set(["queued", "running", "completed", "failed"]);

function createJobId(type = "export") {
  return `job_${type}_${crypto.randomBytes(8).toString("hex")}`;
}

function assertPrivateDir(privateDir) {
  const normalized = path.resolve(String(privateDir || ""));
  if (!path.isAbsolute(String(privateDir || ""))) {
    throw new Error("archive-private-dir-must-be-absolute");
  }

  const segments = normalized.split(path.sep).filter(Boolean).map((segment) => segment.toLowerCase());
  if (segments.includes("public") || segments.includes("uploads")) {
    throw new Error("archive-private-dir-must-not-be-public");
  }
  return normalized;
}

function assertSafeFilename(filename) {
  const value = String(filename || "").trim();
  if (!value || value !== path.basename(value) || value.includes("\\") || value === "." || value === "..") {
    throw new Error("unsafe-artifact-filename");
  }
  return value;
}

function assertSafePayloadName(name) {
  const value = String(name || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === "." || value === "..") {
    throw new Error("unsafe-private-payload-name");
  }
  return value;
}

function cloneJob(job) {
  return job ? {
    jobId: job.jobId,
    type: job.type,
    phase: job.phase,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    hasArtifact: !!job.artifactPath,
    artifact: job.artifact ? { ...job.artifact } : null,
    payloads: job.payloads ? JSON.parse(JSON.stringify(job.payloads)) : {},
    report: job.report ? JSON.parse(JSON.stringify(job.report)) : job.report,
    error: job.error
  } : null;
}

function isTerminalStatus(status) {
  return status === "completed" || status === "failed";
}

function createArchiveJobService(options = {}) {
  const privateDir = assertPrivateDir(options.privateDir);
  const policy = archiveConfig.normalizeArchivePolicy(options.policy || {});
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : createJobId;
  let now = typeof options.now === "function" ? options.now : Date.now;
  const jobs = new Map();

  function setNow(nextNow) {
    now = typeof nextNow === "function" ? nextNow : now;
  }

  async function createJob(type, input = {}) {
    const jobId = String(idFactory(type));
    if (!new RegExp(`^job_${type}_[A-Za-z0-9_-]+$`).test(jobId) || jobs.has(jobId)) {
      throw new Error("invalid-archive-job-id");
    }

    const job = {
      jobId,
      type,
      phase: type === "import" ? String(input.phase || "preview") : undefined,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      completedAt: null,
      failedAt: null,
      artifactPath: null,
      artifact: null,
      payloads: {},
      privatePayloadPaths: {},
      report: null,
      error: null
    };
    jobs.set(jobId, job);
    return cloneJob(job);
  }

  async function createExportJob() {
    return createJob("export");
  }

  async function createImportJob(input = {}) {
    return createJob("import", input);
  }

  function getMutableJob(jobId) {
    const job = jobs.get(String(jobId || ""));
    if (!job) {
      throw new Error("archive-job-not-found");
    }
    return job;
  }

  async function getJob(jobId) {
    return cloneJob(getMutableJob(jobId));
  }

  async function updateReport(jobId, report) {
    const job = getMutableJob(jobId);
    if (isTerminalStatus(job.status)) {
      throw new Error("archive-job-terminal");
    }
    job.report = report || null;
    job.updatedAt = now();
    return cloneJob(job);
  }

  async function setStatus(jobId, status) {
    if (!JOB_STATUSES.has(status)) {
      throw new Error("invalid-archive-job-status");
    }
    const job = getMutableJob(jobId);
    if (isTerminalStatus(job.status)) {
      throw new Error("archive-job-terminal");
    }
    if (!(job.status === "queued" && status === "running")) {
      throw new Error("invalid-archive-job-transition");
    }
    job.status = status;
    job.updatedAt = now();
    return cloneJob(job);
  }

  async function markRunning(jobId) {
    return setStatus(jobId, "running");
  }

  async function failJob(jobId, error) {
    const job = getMutableJob(jobId);
    if (isTerminalStatus(job.status)) {
      throw new Error("archive-job-terminal");
    }
    if (job.status !== "running") {
      throw new Error("invalid-archive-job-transition");
    }
    job.status = "failed";
    job.failedAt = now();
    job.updatedAt = job.failedAt;
    job.error = String(error && error.message || error || "archive job failed");
    return cloneJob(job);
  }

  async function completeJob(jobId, artifact = {}) {
    const job = getMutableJob(jobId);
    if (isTerminalStatus(job.status)) {
      throw new Error("archive-job-terminal");
    }
    if (job.status !== "running") {
      throw new Error("invalid-archive-job-transition");
    }
    const shouldWriteArtifact = Object.prototype.hasOwnProperty.call(artifact, "content") ||
      Object.prototype.hasOwnProperty.call(artifact, "filename");
    if (shouldWriteArtifact) {
      const filename = assertSafeFilename(artifact.filename || "westgate-wiki-export.zip");
      const content = Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(String(artifact.content || ""));
      const jobDir = path.join(privateDir, job.jobId);
      const artifactPath = path.join(jobDir, filename);
      if (!artifactPath.startsWith(`${privateDir}${path.sep}`)) {
        throw new Error("archive-artifact-path-escaped-private-dir");
      }

      await fs.mkdir(jobDir, { recursive: true, mode: 0o700 });
      await fs.writeFile(artifactPath, content);
      job.artifactPath = artifactPath;
      job.artifact = {
        filename,
        bytes: content.length,
        contentType: String(artifact.contentType || "application/octet-stream")
      };
    }

    job.status = "completed";
    job.completedAt = now();
    job.updatedAt = job.completedAt;
    job.report = artifact.report || null;
    return cloneJob(job);
  }

  async function storePrivatePayload(jobId, name, payload) {
    const job = getMutableJob(jobId);
    if (isTerminalStatus(job.status)) {
      throw new Error("archive-job-terminal");
    }
    if (job.status !== "running") {
      throw new Error("invalid-archive-job-transition");
    }

    const safeName = assertSafePayloadName(name);
    const jobDir = path.join(privateDir, job.jobId);
    const payloadPath = path.join(jobDir, `${safeName}.json`);
    if (!payloadPath.startsWith(`${privateDir}${path.sep}`)) {
      throw new Error("archive-artifact-path-escaped-private-dir");
    }
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    await fs.mkdir(jobDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(payloadPath, content, { mode: 0o600 });

    const meta = {
      name: safeName,
      bytes: Buffer.byteLength(content),
      contentType: "application/json",
      updatedAt: now()
    };
    job.privatePayloadPaths[safeName] = payloadPath;
    job.payloads[safeName] = meta;
    job.updatedAt = meta.updatedAt;
    return { ...meta };
  }

  async function readPrivatePayload(jobId, name) {
    const job = getMutableJob(jobId);
    const safeName = assertSafePayloadName(name);
    const payloadPath = job.privatePayloadPaths && job.privatePayloadPaths[safeName];
    if (!payloadPath) {
      throw new Error("archive-private-payload-not-found");
    }
    return JSON.parse(await fs.readFile(payloadPath, "utf8"));
  }

  async function getArtifact(jobId) {
    const job = getMutableJob(jobId);
    if (!job.artifactPath || !job.artifact) {
      throw new Error("archive-artifact-not-found");
    }
    return {
      path: job.artifactPath,
      ...job.artifact
    };
  }

  async function readArtifact(jobId) {
    const artifact = await getArtifact(jobId);
    return {
      ...artifact,
      content: await fs.readFile(artifact.path)
    };
  }

  async function cleanupExpiredJobs() {
    const removedJobIds = [];
    const currentTime = now();
    for (const job of Array.from(jobs.values())) {
      const ttl = job.status === "failed" ? policy.retention.failedJobTtlMs : policy.retention.completedJobTtlMs;
      const finishedAt = job.status === "failed" ? job.failedAt : job.completedAt;
      if (finishedAt === null || finishedAt === undefined ||
        (job.status !== "completed" && job.status !== "failed") ||
        currentTime - finishedAt < ttl) {
        continue;
      }

      await fs.rm(path.join(privateDir, job.jobId), { recursive: true, force: true });
      jobs.delete(job.jobId);
      removedJobIds.push(job.jobId);
    }
    removedJobIds.sort();
    return { removedJobIds };
  }

  return {
    cleanupExpiredJobs,
    completeJob,
    createExportJob,
    createImportJob,
    failJob,
    getJob,
    markRunning,
    getArtifact,
    readArtifact,
    readPrivatePayload,
    storePrivatePayload,
    updateReport,
    setNow
  };
}

module.exports = {
  createArchiveJobService
};
