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

      <div class="wiki-history-inspector" data-wiki-history-inspector>
        <div class="wiki-history-inspector__bar">
          <div class="wiki-history-tabs" role="tablist" aria-label="Revision inspection views">
            <button
              type="button"
              id="wiki-history-rendered-tab"
              class="wiki-history-tab active"
              role="tab"
              aria-selected="true"
              aria-controls="wiki-history-rendered-panel"
              data-wiki-history-tab="rendered"
            >
              Rendered Compare
            </button>
            <button
              type="button"
              id="wiki-history-source-tab"
              class="wiki-history-tab"
              role="tab"
              aria-selected="false"
              aria-controls="wiki-history-source-panel"
              data-wiki-history-tab="source"
            >
              Source Diff
            </button>
          </div>

          <div class="wiki-history-inspector__actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-open="rendered" aria-label="Open rendered comparison fullscreen" disabled>
              <i class="fa fa-fw fa-expand" aria-hidden="true"></i>
              Rendered
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-open="source" aria-label="Open source diff fullscreen" disabled>
              <i class="fa fa-fw fa-code" aria-hidden="true"></i>
              Source
            </button>
          </div>
        </div>

        <section
          id="wiki-history-rendered-panel"
          class="wiki-history-tab-panel"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="wiki-history-rendered-tab"
          data-wiki-history-tab-panel="rendered"
        >
          <div class="wiki-history-compare" role="group" aria-label="Rendered revision comparison">
            <section class="wiki-history-compare-pane" aria-labelledby="wiki-history-before-title">
              <div class="wiki-history-panel-heading">
                <h3 id="wiki-history-before-title">Before</h3>
                <span class="wiki-history-compare-label" data-wiki-history-before-label>Parent revision</span>
              </div>
              <div class="wiki-history-preview wiki-article-prose" data-wiki-history-before-preview>
                <p>Select a revision to preview the previous page content.</p>
              </div>
            </section>

            <section class="wiki-history-compare-pane" aria-labelledby="wiki-history-after-title">
              <div class="wiki-history-panel-heading">
                <h3 id="wiki-history-after-title">After</h3>
                <span class="wiki-history-compare-label" data-wiki-history-after-label>Selected revision</span>
              </div>
              <div class="wiki-history-preview wiki-article-prose" data-wiki-history-after-preview data-wiki-history-preview>
                <p>Select a revision to preview the selected page content.</p>
              </div>
            </section>
          </div>
        </section>

        <section
          id="wiki-history-source-panel"
          class="wiki-history-tab-panel"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="wiki-history-source-tab"
          data-wiki-history-tab-panel="source"
          hidden
        >
          <div class="wiki-history-panel-heading">
            <h3>Source Diff</h3>
          </div>
          <pre class="wiki-history-diff" data-wiki-history-diff>Select a revision to load the source diff.</pre>
        </section>
      </div>

      <div class="wiki-history-fullscreen" data-wiki-history-fullscreen hidden>
        <div class="wiki-history-fullscreen__backdrop" data-wiki-history-fullscreen-close></div>
        <section
          class="wiki-history-fullscreen__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wiki-history-fullscreen-title"
        >
          <header class="wiki-history-fullscreen__header">
            <div>
              <h2 id="wiki-history-fullscreen-title">Revision Viewer</h2>
              <p class="wiki-history-fullscreen__meta" data-wiki-history-fullscreen-meta>No revision selected.</p>
            </div>
            <div class="wiki-history-fullscreen__actions">
              <button type="button" class="btn btn-sm btn-outline-secondary active" data-wiki-history-fullscreen-mode="rendered" aria-pressed="true">Rendered</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-mode="source" aria-pressed="false">Source</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-close>
                <i class="fa fa-fw fa-times" aria-hidden="true"></i>
                Close
              </button>
            </div>
          </header>
          <div class="wiki-history-fullscreen__body">
            <article class="wiki-history-fullscreen__rendered wiki-article-prose" data-wiki-history-fullscreen-rendered></article>
            <pre class="wiki-history-fullscreen__source" data-wiki-history-fullscreen-source hidden></pre>
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
