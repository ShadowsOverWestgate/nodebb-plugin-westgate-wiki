<div class="acp-page-container">
  <!-- IMPORT admin/partials/settings/header.tpl -->

  <div class="row m-0">
    <div id="spy-container" class="col-12 col-md-8 px-0 mb-4" tabindex="0">
      <form role="form" class="westgate-wiki-settings">
        <!-- IF hasSetupErrors -->
        <div class="alert alert-warning" role="alert">
          <strong>Clean wiki path setup needs attention.</strong>
          <p class="mb-2">
            Resolve these namespace conflicts before relying on clean wiki URLs for affected pages.
          </p>
          <!-- IF hasNamespaceCollisions -->
          <div class="mb-2">
            <strong>Duplicate namespace paths</strong>
            <ul class="mb-0">
              <!-- BEGIN namespaceCollisions -->
              <li>
                <code>{namespaceCollisions.path}</code>
                <span class="text-muted">is shared by {namespaceCollisions.categoriesText}</span>
              </li>
              <!-- END namespaceCollisions -->
            </ul>
          </div>
          <!-- ENDIF hasNamespaceCollisions -->
          <!-- IF hasReservedNamespacePaths -->
          <div class="mb-0">
            <strong>Reserved namespace paths</strong>
            <ul class="mb-0">
              <!-- BEGIN reservedNamespacePaths -->
              <li>
                <code>{reservedNamespacePaths.path}</code>
                <span class="text-muted">
                  starts with reserved segment <code>{reservedNamespacePaths.reservedSegment}</code>
                  for #{reservedNamespacePaths.category.cid} {reservedNamespacePaths.category.name}
                </span>
              </li>
              <!-- END reservedNamespacePaths -->
            </ul>
          </div>
          <!-- ENDIF hasReservedNamespacePaths -->
        </div>
        <!-- ENDIF hasSetupErrors -->

        <div class="card mb-4" data-wiki-path-migration-panel>
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
              <div>
                <h5 class="card-title mb-1">Canonical path migration reports</h5>
                <p class="form-text mb-0">
                  Scan and Verify are read-only. Prepare previews the cutover data; Apply clears retired plugin-owned path overrides.
                </p>
              </div>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-outline-secondary btn-sm" data-wiki-path-migration-scan>
                  Scan
                </button>
                <button type="button" class="btn btn-primary btn-sm" data-wiki-path-migration-prepare>
                  Prepare
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-wiki-path-migration-verify>
                  Verify
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-wiki-path-migration-apply>
                  Apply
                </button>
              </div>
            </div>
            <div
              class="alert alert-secondary mb-3"
              role="status"
              data-wiki-path-migration-blocking-status
            >
              No migration report has been run in this browser session.
            </div>
            <pre
              class="form-control font-monospace mb-0"
              style="min-height: 12rem; white-space: pre-wrap;"
              data-wiki-path-migration-output
            ></pre>
          </div>
        </div>

        <div class="card mb-4" data-wiki-archive-panel>
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
              <div>
                <h5 class="card-title mb-1">Wiki archive</h5>
                <p class="form-text mb-0">
                  Export a private V1 archive ZIP, or upload one for a previewed merge. Apply only after reviewing reports, blockers, creates/updates/moves, asset rewrites, and optional settings mapping.
                </p>
              </div>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-primary btn-sm" data-wiki-archive-export-start>
                  Start export
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-wiki-archive-export-status disabled>
                  Refresh export
                </button>
                <a class="btn btn-outline-primary btn-sm disabled" href="#" data-wiki-archive-export-download>
                  Download ZIP
                </a>
              </div>
            </div>

            <div class="alert alert-secondary mb-3" role="status" data-wiki-archive-status>
              No archive job has been run in this browser session.
            </div>

            <p class="form-text mb-3">
              Archives carry wiki page article HTML, per-page CSS/discussion metadata, portable page IDs, settings snapshots, and validated local uploads. They do not carry replies, permission tables, edit locks, watches, notifications, caches, or search indexes. Destination category permissions remain authoritative.
            </p>

            <div class="mb-3">
              <label class="form-label" for="wikiArchiveImportFile">Import archive ZIP</label>
              <input
                id="wikiArchiveImportFile"
                type="file"
                class="form-control"
                accept=".zip,application/zip"
                data-wiki-archive-import-file
              />
            </div>

            <div class="d-flex flex-wrap align-items-center gap-3 mb-3">
              <button type="button" class="btn btn-outline-primary btn-sm" data-wiki-archive-import-preview>
                Preview import
              </button>
              <div class="form-check mb-0">
                <input
                  id="wikiArchiveIncludeSettings"
                  class="form-check-input"
                  type="checkbox"
                  data-wiki-archive-include-settings
                />
                <label class="form-check-label" for="wikiArchiveIncludeSettings">
                  Include mapped plugin settings from this preview
                </label>
              </div>
              <div class="form-check mb-0">
                <input
                  id="wikiArchiveApplyApproved"
                  class="form-check-input"
                  type="checkbox"
                  data-wiki-archive-apply-approved
                />
                <label class="form-check-label" for="wikiArchiveApplyApproved">
                  I reviewed the current preview and approve apply
                </label>
              </div>
              <button type="button" class="btn btn-danger btn-sm" data-wiki-archive-apply disabled>
                Apply import
              </button>
            </div>

            <pre
              class="form-control font-monospace mb-0"
              style="min-height: 12rem; white-space: pre-wrap;"
              data-wiki-archive-output
            ></pre>
            <p class="form-text mt-2 mb-0">
              Partial apply is journaled and rerunnable. Resolve failures, then run a fresh preview before applying again. Legacy slugs and topdata IDs are diagnostics only; canonical paths control placement.
            </p>
          </div>
        </div>

        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center gap-3 mb-2">
            <label class="form-label mb-0" for="categoryIds">Wiki Namespaces</label>
            <span class="text-muted small">
              <span data-selected-count>0</span> selected
            </span>
          </div>
          <div class="list-group">
            <!-- BEGIN categoryOptions -->
            <label class="list-group-item">
              <div class="form-check mb-0" style="margin-left: calc({categoryOptions.depth} * 1.25rem);">
                <input
                  class="form-check-input"
                  type="checkbox"
                  value="{categoryOptions.cid}"
                  data-wiki-category-toggle="1"
                  <!-- IF categoryOptions.isSelected -->checked<!-- ENDIF categoryOptions.isSelected -->
                />
                <span class="form-check-label">
                  <strong>{categoryOptions.name}</strong>
                  <span class="text-muted small ms-2">#{categoryOptions.cid}</span>
                  <span class="text-muted small ms-2">/{categoryOptions.slug}</span>
                </span>
              </div>
              <!-- IF categoryOptions.description -->
              <div class="form-text ms-4" style="margin-left: calc(({categoryOptions.depth} * 1.25rem) + 1.5rem) !important;">
                {categoryOptions.description}
              </div>
              <!-- ENDIF categoryOptions.description -->
            </label>
            <!-- END categoryOptions -->
          </div>
          <p class="form-text">
            Select the NodeBB categories that should behave as wiki namespaces. Category permissions
            remain managed by NodeBB itself, so group-based visibility and posting rules continue to apply.
          </p>
        </div>

        <div class="mb-4">
          <label class="form-label" for="categoryIds">Stored Wiki Category IDs</label>
          <textarea
            id="categoryIds"
            class="form-control"
            name="categoryIds"
            rows="3"
            placeholder="12, 13, 14"
          >{categoryIds}</textarea>
          <p class="form-text">
            This stays editable as a fallback, but the checkbox tree above should be the normal way to manage wiki namespaces.
          </p>
        </div>

        <div class="mb-4">
          <label class="form-label" for="homeTopicId">Wiki homepage (topic id)</label>
          <input
            id="homeTopicId"
            type="text"
            class="form-control"
            name="homeTopicId"
            inputmode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 42 (leave empty to clear)"
            value="{homeTopicId}"
          />
          <p class="form-text">
            The <code>/wiki</code> route shows this topic as the wiki home (same layout as other wiki pages). Create a topic
            in any configured wiki namespace, then enter its numeric topic id here. This page cannot be removed from the wiki
            &quot;Remove page&quot; action.
          </p>
        </div>

        <div class="mb-4">
          <label class="form-label" for="routeRootCid">Explicit route root (category id)</label>
          <input
            id="routeRootCid"
            type="text"
            class="form-control"
            name="routeRootCid"
            inputmode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 12 (leave empty for no route root)"
            value="{routeRootCid}"
          />
          <p class="form-text">
            When set, this category becomes the wiki route root and its own title segment is omitted from canonical public paths.
            Migration Apply fills this automatically when it finds one safe legacy <code>/wiki</code> root.
          </p>
        </div>

        <div class="mb-4 form-check">
          <input
            id="includeChildCategories"
            class="form-check-input"
            type="checkbox"
            name="includeChildCategories"
            <!-- IF includeChildCategories -->checked<!-- ENDIF includeChildCategories -->
          />
          <label class="form-check-label" for="includeChildCategories">
            Automatically include descendant categories as wiki namespaces
          </label>
          <p class="form-text">
            When enabled, selecting a parent namespace automatically exposes its subcategories and deeper descendants through the wiki hierarchy.
          </p>
        </div>

        <div class="mb-4">
          <label class="form-label mb-2" for="wikiNamespaceCreateGroups">Groups allowed to create wiki namespaces</label>
          <p class="form-text">
            <strong>Administrators</strong> can always create child namespaces from the wiki. Members of the groups selected below
            may also use <strong>Create child namespace</strong>. Leave all unchecked for administrators only.
          </p>
          <div class="list-group mb-2" style="max-height: 16rem; overflow: auto;">
            <!-- BEGIN groupOptions -->
            <label class="list-group-item">
              <div class="form-check mb-0">
                <input
                  class="form-check-input"
                  type="checkbox"
                  value="{groupOptions.name}"
                  data-wiki-namespace-creator-group="1"
                  <!-- IF groupOptions.isSelected -->checked<!-- ENDIF groupOptions.isSelected -->
                />
                <span class="form-check-label">
                  <strong>{groupOptions.displayName}</strong>
                  <span class="text-muted small ms-2">{groupOptions.name}</span>
                </span>
              </div>
            </label>
            <!-- END groupOptions -->
          </div>
          <label class="form-label" for="wikiNamespaceCreateGroups">Stored group names</label>
          <textarea
            id="wikiNamespaceCreateGroups"
            class="form-control font-monospace"
            name="wikiNamespaceCreateGroups"
            rows="2"
            placeholder="Global Moderators, Wiki Editor"
          >{wikiNamespaceCreateGroups}</textarea>
          <p class="form-text mb-0">
            Synced from the checkboxes above when you save. You may edit this list manually (comma or newline separated; spaces inside group names are preserved)
            if needed.
          </p>
        </div>

        <div class="alert alert-info">
          Wiki namespace enablement is plugin-specific, but read/post/edit access still comes from the
          underlying NodeBB category permissions.
        </div>
      </form>
    </div>

    <!-- IMPORT admin/partials/settings/toc.tpl -->
  </div>
</div>
