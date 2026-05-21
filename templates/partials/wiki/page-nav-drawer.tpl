<aside class="wiki-article-drawer wiki-article-drawer--nav" id="wiki-article-drawer-nav" data-wiki-article-drawer="nav" aria-label="Wiki navigation">
  <button type="button" class="wiki-article-drawer__tab" id="wiki-article-drawer-nav-toggle" data-wiki-drawer-toggle data-wiki-drawer-target="nav" aria-controls="wiki-article-drawer-nav" aria-expanded="false">
    <i class="fa fa-fw fa-book" aria-hidden="true"></i>
    <span class="wiki-article-drawer__tab-label">Pages</span>
  </button>
  <div class="wiki-article-drawer__panel card">
    <div class="wiki-article-drawer__header">
      <h2 class="wiki-article-drawer__title" id="wiki-article-drawer-nav-title">Wiki navigation</h2>
      <button type="button" class="wiki-article-drawer__close" data-wiki-drawer-close data-wiki-drawer-target="nav" aria-label="Close wiki navigation">
        <i class="fa fa-fw fa-times" aria-hidden="true"></i>
      </button>
    </div>
    <div class="wiki-article-drawer__body wiki-sidebar-disclosure__body--nav wiki-sidebar-panel-scroll">
      <nav class="wiki-sidebar-merged-nav" aria-labelledby="wiki-article-drawer-nav-title">
        <div
          class="wiki-sidebar-directory"
          data-wiki-directory-mount="1"
          data-cid="{sectionNavigation.cid}"
          data-initial-cursor="{sectionNavigation.directoryNextCursor}"
          data-initial-has-more="<!-- IF sectionNavigation.directoryHasMore -->1<!-- ELSE -->0<!-- ENDIF -->"
          data-wiki-directory-endpoint="pages"
          data-wiki-directory-mode="nav"
          <!-- IF hasWikiNavCurrentTid -->
          data-around-tid="{wikiNavCurrentTid}"
          data-current-tid="{wikiNavCurrentTid}"
          <!-- ENDIF hasWikiNavCurrentTid -->
          data-limit="35"
        >
          <label class="visually-hidden" for="wiki-sidebar-dir-filter-{wikiNavFilterId}">Filter pages in this namespace</label>
          <input
            type="search"
            id="wiki-sidebar-dir-filter-{wikiNavFilterId}"
            class="form-control form-control-sm wiki-directory-filter"
            placeholder="Filter pages..."
            data-wiki-directory-filter="1"
            autocomplete="off"
          />
          <!-- IF sectionNavigation -->
          <ul class="wiki-sidebar-nav-rows wiki-sidebar-nav-rows--namespace-lead" role="list">
            <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--namespace" data-wiki-current-namespace="1" style="--wiki-nav-depth: 0;">
              <a class="wiki-sidebar-nav-ns" href="{config.relative_path}{sectionNavigation.wikiPath}">{sectionNavigation.name}</a>
            </li>
          </ul>
          <!-- ENDIF sectionNavigation -->
          <ul class="wiki-sidebar-nav-rows wiki-sidebar-nav-rows--child-pages" data-wiki-directory-list role="list">
            <!-- BEGIN wikiSidebarPageRows -->
            <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--page" data-wiki-nav-tid="{./tid}">
              <a class="wiki-sidebar-nav-page" href="{config.relative_path}{./wikiPath}">
                <!-- IF ./hasParentPath -->
                <span class="wiki-sidebar-parent-path">
                  <!-- BEGIN ./parentTitlePathSegments -->
                  <!-- IF ./hasSeparatorBefore --><span class="wiki-topic-title-separator" aria-hidden="true">/</span><!-- ENDIF ./hasSeparatorBefore -->
                  <span class="wiki-sidebar-parent-path__part">{./text}</span>
                  <!-- END ./parentTitlePathSegments -->
                </span>
                <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
                <!-- ENDIF ./hasParentPath -->
                <span class="wiki-sidebar-page-title">{./titleLeaf}</span>
              </a>
            </li>
            <!-- END wikiSidebarPageRows -->
          </ul>
          <p class="wiki-directory-status small text-muted mb-0" data-wiki-directory-status aria-live="polite"></p>
          <!-- IF sectionNavigation.directoryHasMore -->
          <button type="button" class="btn btn-sm btn-outline-secondary mt-2" data-wiki-directory-more>
            Load more
          </button>
          <div data-wiki-directory-sentinel class="wiki-directory-sentinel" aria-hidden="true"></div>
          <!-- ENDIF sectionNavigation.directoryHasMore -->
        </div>

        <!-- IF hasSectionChildNamespaces -->
        <hr class="wiki-sidebar-divider" />
        <h2 class="wiki-sidebar-child-ns-heading" id="wiki-sidebar-child-ns-heading">Child namespaces</h2>
        <ul class="wiki-sidebar-nav-rows" aria-labelledby="wiki-sidebar-child-ns-heading">
          <!-- BEGIN sectionNavigation.childSections -->
          <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--page">
            <a class="wiki-sidebar-nav-page" href="{config.relative_path}{./wikiPath}">
              <span class="wiki-sidebar-page-title">{./name}</span>
            </a>
          </li>
          <!-- END sectionNavigation.childSections -->
        </ul>
        <!-- ENDIF hasSectionChildNamespaces -->
      </nav>
    </div>
  </div>
</aside>
