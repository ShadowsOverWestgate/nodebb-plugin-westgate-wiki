<div
  class="westgate-wiki wiki-history-page"
  data-wiki-history
  data-tid="{topic.tid}"
  data-can-restore="<!-- IF canRestoreWikiRevision -->1<!-- ELSE -->0<!-- ENDIF canRestoreWikiRevision -->"
  data-page-title="{pageTitle}"
  data-hard-purge-redirect="{categoryWikiPath}"
>
  <header class="wiki-page-header wiki-history-header mb-4">
    <!-- IMPORT partials/wiki/breadcrumb-trail.tpl -->
    <!-- IMPORT partials/wiki/search-chrome.tpl -->
    <div class="wiki-page-heading">
      <h1 class="wiki-page-heading__title">History: {pageTitle}</h1>
      <div class="wiki-page-heading__meta">
        <a class="wiki-card-link-secondary" href="{config.relative_path}{returnPath}">
          <i class="fa fa-fw fa-arrow-left" aria-hidden="true"></i>
          Back to page
        </a>
      </div>
    </div>
  </header>

  <section class="wiki-history-layout" aria-label="Wiki revision history">
    <aside class="wiki-history-timeline card" aria-labelledby="wiki-history-timeline-title">
      <div class="wiki-history-panel-heading">
        <h2 id="wiki-history-timeline-title">Revisions</h2>
      </div>

      <!-- IF hasRevisions -->
      <ol class="wiki-history-timeline__list" data-wiki-history-timeline>
        <!-- BEGIN revisions -->
        <li class="wiki-history-timeline__item">
          <button
            type="button"
            class="wiki-history-revision"
            data-wiki-history-revision
            data-revision-id="{./revisionId}"
            data-parent-revision-id="{./parentRevisionId}"
            aria-pressed="false"
          >
            <span class="wiki-history-revision__main">
              <span class="wiki-history-revision__action">{./actionLabel}</span>
              <!-- IF ./isLatest -->
              <span class="wiki-history-revision__badge">Latest</span>
              <!-- ENDIF ./isLatest -->
            </span>
            <span class="wiki-history-revision__meta">
              <!-- IF ./timestampISO -->
              <time class="timeago" datetime="{./timestampISO}" title="{./timestampISO}"></time>
              <!-- ENDIF ./timestampISO -->
              <!-- IF ./uid -->
              <span>uid {./uid}</span>
              <!-- ENDIF ./uid -->
            </span>
          </button>
        </li>
        <!-- END revisions -->
      </ol>
      <!-- ELSE -->
      <div class="wiki-history-empty" data-wiki-history-timeline>
        No revisions have been recorded for this page yet.
      </div>
      <!-- ENDIF hasRevisions -->
    </aside>

    <article class="wiki-history-workspace card" aria-labelledby="wiki-history-workspace-title">
      <div class="wiki-history-toolbar">
        <div>
          <h2 id="wiki-history-workspace-title">Selected Revision</h2>
          <p class="wiki-history-status" data-wiki-history-status>Select a revision to inspect its diff and preview.</p>
        </div>

        <!-- IF canRestoreWikiRevision -->
        <button type="button" class="btn btn-primary wiki-history-restore" data-wiki-history-restore disabled>
          <i class="fa fa-fw fa-undo" aria-hidden="true"></i>
          Restore
        </button>
        <!-- ENDIF canRestoreWikiRevision -->
      </div>

      <div class="wiki-history-panels">
        <section class="wiki-history-panel" aria-labelledby="wiki-history-diff-title">
          <div class="wiki-history-panel-heading">
            <h3 id="wiki-history-diff-title">Diff</h3>
          </div>
          <pre class="wiki-history-diff" data-wiki-history-diff>Select a revision to load the patch.</pre>
        </section>

        <section class="wiki-history-panel" aria-labelledby="wiki-history-preview-title">
          <div class="wiki-history-panel-heading">
            <h3 id="wiki-history-preview-title">Preview</h3>
          </div>
          <div class="wiki-history-preview wiki-article-prose" data-wiki-history-preview>
            <p>Select a revision to preview the page content.</p>
          </div>
        </section>
      </div>

      <!-- IF isWikiTombstoned -->
      <!-- IF canHardPurgeWikiTombstone -->
      <section class="wiki-history-danger-zone" aria-label="Danger zone">
        <div>
          <h3>Hard Purge</h3>
          <p>This tombstoned page can be permanently removed from the wiki revision store.</p>
        </div>
        <button type="button" class="btn btn-danger" data-wiki-history-hard-purge>
          <i class="fa fa-fw fa-trash" aria-hidden="true"></i>
          Hard Purge
        </button>
      </section>
      <!-- ENDIF canHardPurgeWikiTombstone -->
      <!-- ENDIF isWikiTombstoned -->
    </article>
  </section>
</div>
