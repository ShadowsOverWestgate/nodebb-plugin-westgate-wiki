"use strict";

const DEFAULT_ARCHIVE_POLICY = {
  limits: {
    maxNamespaces: 2000,
    maxPages: 10000,
    maxAssets: 20000,
    maxReports: 50000,
    maxChecksums: 50000,
    maxSubordinateFiles: 50000,
    maxManifestBytes: 10 * 1024 * 1024,
    maxSubordinateBytes: 1024 * 1024 * 1024,
    maxArchiveBytes: 2 * 1024 * 1024 * 1024
  },
  retention: {
    completedJobTtlMs: 7 * 24 * 60 * 60 * 1000,
    failedJobTtlMs: 14 * 24 * 60 * 60 * 1000
  },
  cleanup: {
    artifactSweepIntervalMs: 60 * 60 * 1000,
    orphanArtifactTtlMs: 24 * 60 * 60 * 1000
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeSection(defaults, overrides) {
  return {
    ...defaults,
    ...(overrides && typeof overrides === "object" ? overrides : {})
  };
}

function normalizePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeArchivePolicy(overrides = {}) {
  const policy = {
    limits: mergeSection(DEFAULT_ARCHIVE_POLICY.limits, overrides.limits),
    retention: mergeSection(DEFAULT_ARCHIVE_POLICY.retention, overrides.retention),
    cleanup: mergeSection(DEFAULT_ARCHIVE_POLICY.cleanup, overrides.cleanup)
  };

  Object.keys(policy.limits).forEach((key) => {
    policy.limits[key] = normalizePositiveInt(policy.limits[key], DEFAULT_ARCHIVE_POLICY.limits[key]);
  });
  Object.keys(policy.retention).forEach((key) => {
    policy.retention[key] = normalizePositiveInt(policy.retention[key], DEFAULT_ARCHIVE_POLICY.retention[key]);
  });
  Object.keys(policy.cleanup).forEach((key) => {
    policy.cleanup[key] = normalizePositiveInt(policy.cleanup[key], DEFAULT_ARCHIVE_POLICY.cleanup[key]);
  });

  return policy;
}

function getArchivePolicyDefaults() {
  return clone(DEFAULT_ARCHIVE_POLICY);
}

module.exports = {
  DEFAULT_ARCHIVE_POLICY,
  getArchivePolicyDefaults,
  normalizeArchivePolicy
};
