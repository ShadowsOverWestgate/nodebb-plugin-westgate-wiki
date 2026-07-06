"use strict";

const migration = require("../tree/wiki-canonical-diagnostics");

const ARCHIVE_FORMAT_ID = "westgate-wiki-archive";
const ARCHIVE_FORMAT_VERSION = 1;
const ARCHIVE_SCHEMA_ID = `${ARCHIVE_FORMAT_ID}/v${ARCHIVE_FORMAT_VERSION}`;
const CANONICAL_PATH_CONTRACT_VERSION = migration.CANONICAL_PATH_MIGRATION_VERSION;
const PORTABLE_TOPIC_FIELD = "westgateWikiArchivePageId";

const ARCHIVE_PAYLOAD_FIELD_OWNERS = {
  schemaId: "wiki-archive-schema",
  formatId: "wiki-archive-schema",
  version: "wiki-archive-schema",
  canonicalPathContractVersion: "wiki-canonical-diagnostics",
  exporter: "plugin-package",
  checksums: "wiki-archive-manifest",
  namespaces: {
    archiveNamespaceId: "wiki-archive-manifest",
    parentArchiveNamespaceId: "wiki-archive-manifest",
    canonicalPath: "wiki-tree-index",
    titlePath: "wiki-tree-index"
  },
  pages: {
    archivePageId: "wiki-archive-identity",
    archiveNamespaceId: "wiki-archive-manifest",
    canonicalPath: "wiki-tree-index",
    title: "topic-service",
    articleHtmlPath: "wiki-archive-manifest",
    articleCss: "wiki-article-css",
    discussionDisabled: "wiki-discussion-settings",
    topdata: "stored-article-html"
  },
  assets: {
    assetId: "wiki-archive-manifest",
    path: "wiki-archive-manifest",
    sha256: "wiki-archive-manifest",
    bytes: "nodebb-upload-storage",
    contentType: "nodebb-upload-storage",
    referencedByPageIds: "wiki-archive-manifest"
  },
  settingsSnapshot: {
    categoryRoots: "config",
    includeChildCategories: "config",
    homepage: "wiki-archive-schema",
    routeRoot: "config",
    namespaceCreatorGroups: "config"
  },
  reports: "wiki-archive-manifest"
};

const ARCHIVE_EXCLUDED_FIELDS = {
  discussionReplies: "Out of scope for V1; archives carry first-post article HTML only.",
  editLocks: "Transient authoring state; not portable content.",
  watches: "Per-user runtime state; not portable content.",
  notifications: "Transient runtime state; not portable content.",
  searchIndexes: "Derived cache/index data rebuilt by destination runtime.",
  directoryCaches: "Derived cache/listing data rebuilt by destination runtime.",
  softDeletedPages: "Out of scope for V1 live wiki export.",
  scheduledPages: "Out of scope for V1 live wiki export.",
  nodebbCategoryPrivileges: "Destination-owned permission policy; not imported by V1 archives.",
  rawNodebbRecords: "Archive format is portable content, not a raw NodeBB backup."
};

module.exports = {
  ARCHIVE_EXCLUDED_FIELDS,
  ARCHIVE_FORMAT_ID,
  ARCHIVE_FORMAT_VERSION,
  ARCHIVE_PAYLOAD_FIELD_OWNERS,
  ARCHIVE_SCHEMA_ID,
  CANONICAL_PATH_CONTRACT_VERSION,
  PORTABLE_TOPIC_FIELD
};
