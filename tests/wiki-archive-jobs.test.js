"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const archiveJobs = require("../lib/archive/wiki-archive-jobs");

(async () => {
  {
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-archive-private-"));
    const jobs = archiveJobs.createArchiveJobService({
      privateDir,
      now: () => 1000,
      idFactory: () => "job_export_aaaaaaaa"
    });

    const job = await jobs.createExportJob();
    assert.equal(job.status, "queued");
    assert.equal(job.type, "export");
    assert.equal(job.artifactPath, undefined);
    assert.equal(job.hasArtifact, false);

    await jobs.markRunning(job.jobId);
    const artifact = await jobs.completeJob(job.jobId, {
      filename: "westgate-wiki-export.json",
      content: Buffer.from("artifact"),
      contentType: "application/zip"
    });

    assert.equal(artifact.status, "completed");
    assert.equal(artifact.artifactPath, undefined);
    assert.equal(artifact.hasArtifact, true);
    assert.deepEqual(artifact.artifact, {
      filename: "westgate-wiki-export.json",
      bytes: Buffer.byteLength("artifact"),
      contentType: "application/zip"
    });

    const storedArtifact = await jobs.readArtifact(job.jobId);
    assert.equal(storedArtifact.path.startsWith(privateDir), true);
    assert.equal(storedArtifact.path.includes("/public/"), false);
    assert.equal(storedArtifact.path.includes("/uploads/"), false);
    assert.equal(storedArtifact.filename, "westgate-wiki-export.json");
    assert.equal(storedArtifact.contentType, "application/zip");
    assert.equal(storedArtifact.content.toString("utf8"), "artifact");

    const fetched = await jobs.getJob(job.jobId);
    assert.equal(fetched.status, "completed");
    assert.equal(fetched.artifactPath, undefined);
    assert.equal(fetched.hasArtifact, true);
  }

  {
    assert.throws(
      () => archiveJobs.createArchiveJobService({ privateDir: "/tmp/public/uploads/wiki-archive" }),
      /archive-private-dir-must-not-be-public/
    );
    assert.throws(
      () => archiveJobs.createArchiveJobService({ privateDir: "relative/private" }),
      /archive-private-dir-must-be-absolute/
    );
  }

  {
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-archive-cleanup-"));
    const jobs = archiveJobs.createArchiveJobService({
      privateDir,
      now: () => 0,
      idFactory: () => "job_export_bbbbbbbb",
      policy: { retention: { completedJobTtlMs: 10 } }
    });

    const job = await jobs.createExportJob();
    await jobs.markRunning(job.jobId);
    await jobs.completeJob(job.jobId, { filename: "export.json", content: "old" });
    jobs.setNow(() => 11);

    const cleanup = await jobs.cleanupExpiredJobs();
    assert.deepEqual(cleanup.removedJobIds, [job.jobId]);
    await assert.rejects(() => fs.stat(path.join(privateDir, job.jobId, "export.json")), /ENOENT/);
  }

  {
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-archive-transitions-"));
    const jobs = archiveJobs.createArchiveJobService({
      privateDir,
      now: () => 100,
      idFactory: () => "job_export_cccccccc"
    });
    const job = await jobs.createExportJob();

    await assert.rejects(
      () => jobs.completeJob(job.jobId, { filename: "too-early.json", content: "no" }),
      /invalid-archive-job-transition/
    );
    await assert.rejects(
      () => jobs.failJob(job.jobId, new Error("too early")),
      /invalid-archive-job-transition/
    );

    await jobs.markRunning(job.jobId);
    await jobs.completeJob(job.jobId, { filename: "done.json", content: "done" });
    await assert.rejects(() => jobs.markRunning(job.jobId), /archive-job-terminal/);
    await assert.rejects(
      () => jobs.failJob(job.jobId, new Error("after complete")),
      /archive-job-terminal/
    );
    await assert.rejects(
      () => jobs.completeJob(job.jobId, { filename: "again.json", content: "again" }),
      /archive-job-terminal/
    );
    await assert.rejects(
      () => jobs.updateReport(job.jobId, { status: "mutated" }),
      /archive-job-terminal/
    );
    assert.equal(await fs.readFile(path.join(privateDir, job.jobId, "done.json"), "utf8"), "done");
    await assert.rejects(() => fs.stat(path.join(privateDir, job.jobId, "again.json")), /ENOENT/);
  }

  {
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-archive-failed-terminal-"));
    const jobs = archiveJobs.createArchiveJobService({
      privateDir,
      idFactory: () => "job_export_dddddddd"
    });
    const job = await jobs.createExportJob();

    await jobs.markRunning(job.jobId);
    await jobs.failJob(job.jobId, new Error("failed"));
    await assert.rejects(() => jobs.markRunning(job.jobId), /archive-job-terminal/);
    await assert.rejects(
      () => jobs.completeJob(job.jobId, { filename: "after-failed.json", content: "no" }),
      /archive-job-terminal/
    );
  }

  {
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-archive-import-"));
    const jobs = archiveJobs.createArchiveJobService({
      privateDir,
      now: () => 200,
      idFactory: () => "job_import_aaaaaaaa"
    });

    const job = await jobs.createImportJob();
    assert.equal(job.status, "queued");
    assert.equal(job.type, "import");
    assert.equal(job.artifactPath, undefined);
    assert.equal(job.hasArtifact, false);

    await jobs.markRunning(job.jobId);
    const payloadMeta = await jobs.storePrivatePayload(job.jobId, "preview", {
      status: "ok",
      operations: [{ type: "page.create", archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }]
    });

    assert.equal(payloadMeta.name, "preview");
    assert.equal(payloadMeta.path, undefined);
    assert.equal(payloadMeta.privatePath, undefined);
    assert.equal(payloadMeta.bytes > 0, true);

    const runningJob = await jobs.getJob(job.jobId);
    assert.equal(runningJob.payloads.preview.bytes, payloadMeta.bytes);
    assert.equal(runningJob.payloads.preview.path, undefined);
    assert.equal(runningJob.payloads.preview.privatePath, undefined);
    assert.deepEqual(await jobs.readPrivatePayload(job.jobId, "preview"), {
      status: "ok",
      operations: [{ type: "page.create", archivePageId: "wgap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }]
    });

    const completed = await jobs.completeJob(job.jobId, {
      report: { status: "preview-ready" }
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.type, "import");
    assert.equal(completed.artifactPath, undefined);
    assert.equal(completed.hasArtifact, false);
    await assert.rejects(
      () => jobs.storePrivatePayload(job.jobId, "apply-report", { status: "late" }),
      /archive-job-terminal/
    );
  }

  {
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-archive-import-default-id-"));
    const jobs = archiveJobs.createArchiveJobService({ privateDir });
    const job = await jobs.createImportJob();

    assert.match(job.jobId, /^job_import_[a-f0-9]{16}$/);
    assert.equal(job.type, "import");
  }

  {
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-archive-import-apply-"));
    const jobs = archiveJobs.createArchiveJobService({
      privateDir,
      idFactory: () => "job_import_bbbbbbbb"
    });
    const job = await jobs.createImportJob({ phase: "apply" });

    assert.equal(job.type, "import");
    assert.equal(job.phase, "apply");
    await jobs.markRunning(job.jobId);
    await jobs.failJob(job.jobId, new Error("blocked"));
    await assert.rejects(
      () => jobs.storePrivatePayload(job.jobId, "apply-report", { status: "blocked" }),
      /archive-job-terminal/
    );
  }
})();
