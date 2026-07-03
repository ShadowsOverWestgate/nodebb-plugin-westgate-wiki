<div class="wiki-manage-page container py-3">
  <h1 class="h3 mb-1">Wiki manager - raw browse</h1>
  <p class="text-muted">
    Diagnostic view of every wiki topic, read straight from category topic sets.
    Rows flagged here may be invisible in normal wiki navigation. Delete actions
    still require the usual topic privileges.
  </p>

  <!-- IF !hasNamespaces -->
  <div class="alert alert-info">No wiki namespaces are configured.</div>
  <!-- ENDIF !hasNamespaces -->

  <!-- BEGIN namespaces -->
  <section class="mb-4" style="margin-left: {./indentRem}rem;">
    <h2 class="h5 d-flex align-items-center gap-2 flex-wrap">
      <span>{./name}</span>
      <span class="text-muted small">cid {./cid} &middot; {./rowCount} topics</span>
      <!-- IF ./acpUrl -->
      <a class="small" href="{config.relative_path}{./acpUrl}">Manage category (ACP)</a>
      <!-- ENDIF ./acpUrl -->
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
          <tr>
            <td>{./tid}</td>
            <td><a href="{config.relative_path}{./topicUrl}">{./title}</a></td>
            <td><code>{./slugLeaf}</code></td>
            <td>
              <!-- IF ./collision --><span class="badge bg-danger">collision</span><!-- ENDIF ./collision -->
              <!-- IF ./tombstoned --><span class="badge bg-secondary">tombstoned</span><!-- ENDIF ./tombstoned -->
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
                data-wiki-tombstone-page="1"
                data-tid="{./tid}"
                data-redirect-href="{config.relative_path}/wiki/manage"
              >Tombstone</button>
              <!-- ENDIF ./canTombstone -->
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
</div>
