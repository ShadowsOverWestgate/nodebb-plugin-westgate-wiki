<div class="wiki-manage-page container py-3" data-wiki-manage="1" data-busy="0" data-purge-chunk="{purgeChunkSize}">
  <h1 class="h3 mb-1">Wiki manager - raw browse</h1>
  <p class="text-muted">
    Diagnostic view of every wiki topic, read straight from category topic sets.
    Rows flagged here may be invisible in normal wiki navigation. Delete actions
    still require the usual topic privileges.
  </p>
  <p class="text-muted small">
    <strong>Tombstone</strong> hides a page and can be undone at any time.
    <strong>Purge</strong> removes tombstoned pages for good and cannot be undone.
  </p>

  <!-- IF !hasNamespaces -->
  <div class="alert alert-info">No wiki namespaces are configured.</div>
  <!-- ENDIF !hasNamespaces -->

  <!-- BEGIN namespaces -->
  <section class="mb-4" style="margin-left: {./indentRem}rem;" data-wiki-manage-namespace="{./cid}">
    <h2 class="h5 d-flex align-items-center gap-2 flex-wrap">
      <span>{./name}</span>
      <span class="text-muted small">cid {./cid} &middot; {./rowCount} topics &middot; <span data-wiki-manage-staged-count>{./tombstonedCount}</span> tombstoned</span>
      <!-- IF ./acpUrl -->
      <a class="small" href="{config.relative_path}{./acpUrl}">Manage category (ACP)</a>
      <!-- ENDIF ./acpUrl -->
      <!-- IF ./canHardPurge -->
      <button
        type="button"
        class="btn btn-sm btn-danger"
        data-wiki-manage-purge="{./cid}"
        data-name="{./name}"
      >Purge tombstoned (<span data-wiki-manage-purge-count>{./tombstonedCount}</span>)</button>
      <!-- ENDIF ./canHardPurge -->
    </h2>
    <!-- IF ./hasRows -->
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead>
          <tr>
            <th>tid</th>
            <th>Title</th>
            <th>Slug leaf</th>
            <th>Flags</th>
            <th>Posts</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <!-- BEGIN ./rows -->
          <tr
            data-wiki-manage-row="{./tid}"
            data-title="{./title}"
            data-tombstoned="{./tombstonedFlag}"
            data-purgeable="{./stageableFlag}"
          >
            <td>{./tid}</td>
            <td><a href="{config.relative_path}{./topicUrl}">{./title}</a></td>
            <td><code>{./slugLeaf}</code></td>
            <td data-wiki-manage-flags>
              <!-- IF ./collision --><span class="badge bg-danger">collision</span><!-- ENDIF ./collision -->
              <!-- IF ./tombstoned --><span class="badge bg-secondary" data-wiki-manage-tombstone-badge="1">tombstoned</span><!-- ENDIF ./tombstoned -->
              <!-- IF ./deleted --><span class="badge bg-warning text-dark">deleted</span><!-- ENDIF ./deleted -->
              <!-- IF ./scheduled --><span class="badge bg-info text-dark">scheduled</span><!-- ENDIF ./scheduled -->
            </td>
            <td>{./postcount}</td>
            <td><span class="timeago" title="{./timestampISO}"></span></td>
            <td class="text-nowrap">
              <a class="btn btn-sm btn-outline-secondary" href="{config.relative_path}{./historyUrl}">History</a>
              <!-- IF ./canTombstone -->
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-wiki-manage-tombstone="1"
                data-tid="{./tid}"
                title="{./actionTitle}"
              >Tombstone</button>
              <!-- ENDIF ./canTombstone -->
              <!-- IF ./canRestore -->
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                data-wiki-manage-restore="1"
                data-tid="{./tid}"
                title="{./actionTitle}"
              >Restore</button>
              <!-- ENDIF ./canRestore -->
              <!-- IF ./showPurgeUnavailableReason -->
              <span class="text-muted small">{./purgeUnavailableReason}</span>
              <!-- ENDIF ./showPurgeUnavailableReason -->
            </td>
          </tr>
          <!-- END ./rows -->
        </tbody>
      </table>
    </div>
    <!-- ELSE -->
    <p class="text-muted small">No topics.</p>
    <!-- ENDIF ./hasRows -->
  </section>
  <!-- END namespaces -->

  <div class="wiki-manage-purge-bar d-flex align-items-center gap-2 flex-wrap">
    <span class="flex-grow-1 small" data-wiki-manage-status role="status" aria-live="polite"></span>
    <!-- IF canHardPurge -->
    <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-manage-cancel="1" hidden>Cancel</button>
    <button
      type="button"
      class="btn btn-sm btn-danger"
      data-wiki-manage-purge="0"
      data-name="the whole wiki"
    >Purge all tombstoned pages (<span data-wiki-manage-purge-count>{tombstonedCount}</span>)</button>
    <!-- ENDIF canHardPurge -->
  </div>
</div>
