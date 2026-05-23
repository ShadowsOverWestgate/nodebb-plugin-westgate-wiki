<div class="westgate-wiki">
  <header class="wiki-page-header mb-4">
    <!-- IMPORT partials/wiki/breadcrumb-trail.tpl -->
    <!-- IMPORT partials/wiki/search-chrome.tpl -->
    <div class="wiki-page-heading">
      <h1 class="wiki-page-heading__title">{section.name}</h1>
    </div>
    <!-- IF section.description -->
    <div class="wiki-section-description wiki-article-prose mt-2 mb-0">
      {section.description}
    </div>
    <!-- ENDIF section.description -->
  </header>

  <div class="wiki-with-fab wiki-with-fab--section">
    <div class="wiki-content-layout">
      <div class="wiki-page-main-column">
        <!-- IF hasCreateIntent -->
        <section class="wiki-status-card wiki-status-card-redlink card mb-4">
          <div class="card-body">
            <h2>Missing Wiki Page</h2>
            <p>
              <strong>{createIntentTitle}</strong> does not exist in <strong>{section.name}</strong> yet.
            </p>
            <p>
              Follow the wiki pattern and create it directly in this namespace.
            </p>
            <a
              class="wiki-card-link wiki-redlink-action"
              href="#"
              data-wiki-create-page="1"
              data-cid="{section.cid}"
              data-title="{createIntentTitle}"
              <!-- IF createIntentAutoload -->
              data-wiki-create-autoload="1"
              <!-- ENDIF createIntentAutoload -->
            >
              Create {createIntentTitle}
            </a>
          </div>
        </section>
        <!-- ENDIF hasCreateIntent -->

        <section class="wiki-page-body">
          <article class="wiki-page-content wiki-article-prose wiki-namespace-index card">
            <div class="card-body">
              <!-- IF hasNamespaceIndexContent -->
              <!-- IF hasWikiIndexNamespaces -->
              <section class="wiki-index-namespaces-block" aria-labelledby="wiki-index-ns-heading">
                <h3 class="wiki-index-subsection-title" id="wiki-index-ns-heading" style="margin-top:0;">Child Namespaces</h3>
                <ul class="wiki-index-list wiki-index-list--namespaces">
                  <!-- BEGIN wikiIndexNamespaces -->
                  <li class="wiki-index-entry wiki-index-entry--namespace">
                    <div class="wiki-index-entry-main">
                      <!-- IF ./hasWikiPath -->
                      <a class="wiki-index-entry-title" href="{config.relative_path}{./wikiPath}">
                        {./displayTitle}
                      </a>
                      <!-- ELSE -->
                      <span class="wiki-index-entry-title wiki-index-entry-title--disabled" aria-disabled="true">
                        {./displayTitle}
                      </span>
                      <!-- ENDIF ./hasWikiPath -->
                      <p>({wikiIndexNamespaces.articleCountLabel})</p>
                    </div>
                  </li>
                  <!-- END wikiIndexNamespaces -->
                </ul>
              </section>
              <!-- ENDIF hasWikiIndexNamespaces -->

              <!-- IF hasWikiIndexPageLetters -->
              <!-- IF hasWikiIndexNamespaces -->
              <hr class="wiki-index-section-rule" />
              <!-- ENDIF hasWikiIndexNamespaces -->

              <section class="wiki-index-pages-block" aria-labelledby="wiki-index-pages-heading">
                <h3 class="wiki-index-subsection-title" id="wiki-index-pages-heading">Articles</h3>
                <p class="wiki-index-subsection-lead mb-2">
                  This page shows only a subset of pages. Search, jump by letter, or scroll to load more.
                </p>

                <div
                  class="wiki-namespace-directory"
                  data-wiki-directory-mount="1"
                  data-cid="{section.cid}"
                  data-initial-cursor="{section.directoryNextCursor}"
                  data-initial-has-more="<!-- IF section.directoryHasMore -->1<!-- ELSE -->0<!-- ENDIF -->"
                  data-wiki-directory-endpoint="pages"
                >
                  <label class="visually-hidden" for="wiki-ns-dir-filter-{section.cid}">Filter articles in this namespace</label>
                  <input
                    type="search"
                    id="wiki-ns-dir-filter-{section.cid}"
                    class="form-control form-control-sm mb-2 wiki-directory-filter"
                    placeholder="Filter pages…"
                    data-wiki-directory-filter="1"
                    autocomplete="off"
                  />

                  <nav class="wiki-index-jump wiki-index-jump--dynamic mb-2" aria-label="Jump to wiki page letter" data-wiki-directory-letters></nav>

                  <ul class="wiki-index-list" data-wiki-directory-list>
                    <!-- BEGIN section.topics -->
                    <li class="wiki-index-entry wiki-directory-row<!-- IF ./hasParentPath --> wiki-index-entry--subpage<!-- ENDIF ./hasParentPath -->"<!-- IF ./hasParentPath --> style="--wiki-title-depth: {./titleDepth};"<!-- ENDIF ./hasParentPath -->>
                      <div class="wiki-index-entry-main">
                        <!-- IF ./hasWikiPath -->
                        <a class="wiki-index-entry-title" href="{config.relative_path}{./wikiPath}">
                          <!-- IF ./hasParentPath -->
                          <span class="wiki-topic-parent-path">
                            <!-- BEGIN ./parentTitlePathSegments -->
                            <!-- IF ./hasSeparatorBefore --><span class="wiki-topic-title-separator" aria-hidden="true">/</span><!-- ENDIF ./hasSeparatorBefore -->
                            <span class="wiki-topic-parent-path__part">{./text}</span>
                            <!-- END ./parentTitlePathSegments -->
                          </span>
                          <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
                          <!-- ENDIF ./hasParentPath -->
                          <span class="wiki-topic-title-leaf">{./titleLeaf}</span>
                        </a>
                        <!-- ELSE -->
                        <span class="wiki-index-entry-title wiki-index-entry-title--disabled" aria-disabled="true">
                          <!-- IF ./hasParentPath -->
                          <span class="wiki-topic-parent-path">
                            <!-- BEGIN ./parentTitlePathSegments -->
                            <!-- IF ./hasSeparatorBefore --><span class="wiki-topic-title-separator" aria-hidden="true">/</span><!-- ENDIF ./hasSeparatorBefore -->
                            <span class="wiki-topic-parent-path__part">{./text}</span>
                            <!-- END ./parentTitlePathSegments -->
                          </span>
                          <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
                          <!-- ENDIF ./hasParentPath -->
                          <span class="wiki-topic-title-leaf">{./titleLeaf}</span>
                        </span>
                        <!-- ENDIF ./hasWikiPath -->
                      </div>
                    </li>
                    <!-- END section.topics -->
                  </ul>

                  <p class="wiki-directory-status small text-muted mb-2" data-wiki-directory-status aria-live="polite"></p>

                  <!-- IF section.directoryHasMore -->
                  <button type="button" class="btn btn-sm btn-outline-secondary mb-2" data-wiki-directory-more>
                    Load more pages
                  </button>
                  <div data-wiki-directory-sentinel class="wiki-directory-sentinel" aria-hidden="true"></div>
                  <!-- ENDIF section.directoryHasMore -->
                </div>
              </section>
              <!-- ENDIF hasWikiIndexPageLetters -->

              <!-- ELSE -->
              <p class="wiki-namespace-index-empty">
                There are no visible child namespaces or wiki pages in this namespace yet.
              </p>
              <!-- ENDIF hasNamespaceIndexContent -->
            </div>
          </article>
        </section>
      </div>
    </div>

    <div class="wiki-article-drawers wiki-article-drawers--nav-only" data-wiki-article-drawers>
      <!-- IMPORT partials/wiki/page-nav-drawer.tpl -->

      <button type="button" class="wiki-article-drawer-backdrop" data-wiki-drawer-backdrop hidden aria-label="Close article navigation drawers"></button>
    </div>

    <nav class="wiki-fab-dock wiki-fab-dock--floating" aria-label="Namespace tools">
      <div class="wiki-fab-dock-inner">
        <!-- IF canCreatePage -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="#" data-wiki-create-page="1" data-cid="{section.cid}" title="Create a new wiki page in this namespace" aria-label="Create a new wiki page in this namespace">
          <i class="fa fa-fw fa-file-text" aria-hidden="true"></i>
        </a>
        <!-- ENDIF canCreatePage -->
        <!-- IF canCreateWikiNamespaces -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="{config.relative_path}/wiki/namespace/create/{section.cid}" title="Create a child wiki namespace under this category" aria-label="Create a child wiki namespace">
          <i class="fa fa-fw fa-folder-open" aria-hidden="true"></i>
        </a>
        <!-- ENDIF canCreateWikiNamespaces -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon" data-wiki-scroll-top="1" title="Scroll to top" aria-label="Scroll to top">
          <i class="fa fa-fw fa-chevron-up" aria-hidden="true"></i>
        </button>
      </div>
    </nav>
  </div>
</div>

<!-- IF config.cache-buster -->
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/article-body.css?{config.cache-buster}" />
<!-- ELSE -->
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/article-body.css" />
<!-- ENDIF config.cache-buster -->
