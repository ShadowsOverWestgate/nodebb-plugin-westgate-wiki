<div id="westgate-wiki-compose" class="westgate-wiki westgate-wiki-compose">
  <header class="wiki-page-header mb-3">
    <!-- IMPORT partials/wiki/breadcrumb-trail.tpl -->
    <div class="wiki-page-heading">
      <h1 class="wiki-page-heading__title">{pageHeading}</h1>
    </div>
  </header>
  <!-- IF showSetHomeBanner -->
  <div class="alert alert-info mb-3" role="status">
    This page will be published and set as the public wiki homepage at <code class="px-1">/wiki</code> (you can change
    that later in <strong>Admin &rarr; Plugins &rarr; Westgate Wiki</strong>).
  </div>
  <!-- ENDIF showSetHomeBanner -->

  <!-- IF editLockBlocked -->
  <div class="alert alert-warning mb-3" role="alert">
    {editLockMessage}
  </div>
  <p>
    <a class="btn btn-outline-secondary" href="{config.relative_path}{composeCancelHref}">Return to article</a>
  </p>
  <!-- ELSE -->
  <div id="westgate-wiki-compose-data" class="d-none" data-payload-b64="{composePayloadB64}"></div>

  <div class="wiki-compose-form card card-body mb-3">
    <div class="mb-3">
      <label class="form-label" for="wiki-compose-title">Title</label>
      <input id="wiki-compose-title" class="form-control" type="text" value="{defaultTitle}" maxlength="255" />
    </div>

    <!-- IF showDiscussionToggle -->
    <div class="form-check mb-3">
      <input id="wiki-compose-discussion-disabled" class="form-check-input" type="checkbox"<!-- IF discussionDisabled --> checked<!-- ENDIF discussionDisabled --> />
      <label class="form-check-label" for="wiki-compose-discussion-disabled">Disable forum discussion for this article</label>
      <p class="small text-muted mb-0">The forum topic will still link back to the wiki article, but new replies will be blocked.</p>
    </div>
    <!-- ENDIF showDiscussionToggle -->

    <div class="wiki-compose-css-tools mb-2">
      <button type="button" class="btn btn-outline-secondary btn-sm" id="wiki-compose-css-btn">
        <i class="fa fa-code" aria-hidden="true"></i>
        Article CSS
      </button>
    </div>

    <div class="mb-2">
      <div id="wiki-compose-editor" class="wiki-compose-editor wiki-article-prose"></div>
    </div>

    <dialog id="wiki-compose-css-dialog" class="wiki-compose-css-dialog">
      <form method="dialog" class="wiki-compose-css-dialog__panel">
        <header class="wiki-compose-css-dialog__header">
          <h2 class="wiki-compose-css-dialog__title">Article CSS</h2>
          <button type="submit" class="btn btn-outline-secondary btn-sm" id="wiki-compose-css-close" aria-label="Close article CSS editor">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </header>
        <div class="wiki-compose-css-editor">
          <pre class="wiki-compose-css-lines" id="wiki-compose-css-lines" aria-hidden="true">1</pre>
          <pre class="wiki-compose-css-highlight" id="wiki-compose-css-highlight" aria-hidden="true"></pre>
          <textarea id="wiki-compose-css-input" class="wiki-compose-css-input" spellcheck="false" aria-label="Article CSS"></textarea>
        </div>
        <footer class="wiki-compose-css-dialog__footer">
          <p class="small text-muted mb-0">CSS is sanitized and scoped to this wiki article when saved.</p>
          <button type="submit" class="btn btn-primary btn-sm" id="wiki-compose-css-done">Done</button>
        </footer>
      </form>
    </dialog>

    <div class="mb-3">
      <label class="form-label" for="wiki-compose-import-md">Import Markdown (optional)</label>
      <textarea id="wiki-compose-import-md" class="form-control font-monospace" rows="6" placeholder="Paste Markdown here, then click &quot;Load into editor&quot;"></textarea>
      <button type="button" class="btn btn-outline-secondary btn-sm mt-2" id="wiki-compose-import-btn">Load into editor</button>
    </div>

    <div class="wiki-compose-actions wiki-compose-actions--floating d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-primary" id="wiki-compose-submit">{submitLabel}</button>
      <a class="btn btn-outline-secondary" id="wiki-compose-return" href="{config.relative_path}{composeCancelHref}">Return</a>
      <p class="small text-muted mt-2 mb-0 w-100" id="wiki-compose-status" aria-live="polite"></p>
    </div>
  </div>
  <!-- ENDIF editLockBlocked -->
</div>

<!-- IF composeAssetVersion -->
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/editor.css?v={composeAssetVersion}" />
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/article-body.css?v={composeAssetVersion}" />
<script defer src="{config.relative_path}/westgate-wiki/compose/editor.js?v={composeAssetVersion}"></script>
<script defer src="{config.relative_path}/westgate-wiki/compose/page.js?v={composeAssetVersion}"></script>
<!-- ELSE -->
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/editor.css" />
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/article-body.css" />
<script defer src="{config.relative_path}/westgate-wiki/compose/editor.js"></script>
<script defer src="{config.relative_path}/westgate-wiki/compose/page.js"></script>
<!-- ENDIF composeAssetVersion -->
