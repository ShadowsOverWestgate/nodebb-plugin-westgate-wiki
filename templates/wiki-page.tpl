<div class="westgate-wiki">
  <header class="wiki-page-header mb-4">
    <!-- IMPORT partials/wiki/breadcrumb-trail.tpl -->
    <!-- IMPORT partials/wiki/search-chrome.tpl -->
    <div class="wiki-page-heading">
      <!-- IF hasPageTitleSegments -->
      <h1 class="wiki-page-heading__title wiki-page-heading__title--subpage" aria-label="{pageTitle}">
        <!-- BEGIN pageTitleSegments -->
        <!-- IF ./hasSeparatorBefore -->
        <span class="wiki-page-heading__title-separator" aria-hidden="true">/</span>
        <!-- ENDIF ./hasSeparatorBefore -->
        <span class="wiki-page-heading__title-part <!-- IF ./isParent -->wiki-page-heading__title-part--parent<!-- ENDIF ./isParent --><!-- IF ./isLeaf -->wiki-page-heading__title-part--leaf<!-- ENDIF ./isLeaf -->">{./text}</span>
        <!-- END pageTitleSegments -->
      </h1>
      <!-- ELSE -->
      <h1 class="wiki-page-heading__title">{pageTitle}</h1>
      <!-- ENDIF hasPageTitleSegments -->
      <!-- IF mainPost -->
      <div class="wiki-page-heading__meta wiki-page-byline wiki-page-byline--attribution">
        <!-- IF mainPost.wikiLastRevisionUser -->
        <span>Last edited by
          <!-- IF mainPost.wikiLastRevisionUser.userslug --><a class="wiki-page-byline__userlink" href="{config.relative_path}/user/{mainPost.wikiLastRevisionUser.userslug}">{mainPost.wikiLastRevisionUser.displayname}</a><!-- ELSE -->{mainPost.wikiLastRevisionUser.displayname}<!-- ENDIF mainPost.wikiLastRevisionUser.userslug -->
        </span><!-- IF mainPost.wikiLastRevisionTimeISO --> <span title="{mainPost.wikiLastRevisionTimeISO}" class="wiki-page-byline-time timeago"></span><!-- ENDIF mainPost.wikiLastRevisionTimeISO --><!-- IF mainPost.wikiCreatedByUser --><span>, created by
          <!-- IF mainPost.wikiCreatedByUser.userslug --><a class="wiki-page-byline__userlink" href="{config.relative_path}/user/{mainPost.wikiCreatedByUser.userslug}">{mainPost.wikiCreatedByUser.displayname}</a><!-- ELSE -->{mainPost.wikiCreatedByUser.displayname}<!-- ENDIF mainPost.wikiCreatedByUser.userslug -->
        </span><!-- ENDIF mainPost.wikiCreatedByUser -->
        <!-- ENDIF mainPost.wikiLastRevisionUser -->
      </div>
      <!-- ENDIF mainPost -->
    </div>
  </header>

  <div class="wiki-with-fab">
    <div class="wiki-content-layout">
      <div class="wiki-page-main-column">
        <section class="wiki-page-body">
          <!-- IF mainPost -->
          <article class="wiki-page-content wiki-article-prose card">
            <!-- IF hasArticleCss -->
            <style data-westgate-wiki-article-css>
{scopedArticleCss}
            </style>
            <!-- ENDIF hasArticleCss -->
            <div class="card-body wiki-article-custom-css-scope-{topic.tid}">
              {mainPost.content}
            </div>
          </article>
          <!-- ELSE -->
          <article class="wiki-status-card card">
            <div class="card-body">
              <h2>Page Content Unavailable</h2>
              <p>The topic exists, but its first post could not be loaded as wiki content.</p>
            </div>
          </article>
          <!-- ENDIF mainPost -->
        </section>
      </div>
    </div>

    <div class="wiki-article-drawers" data-wiki-article-drawers>
      <!-- IF hasSectionNavigation -->
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
                data-around-tid="{topic.tid}"
                data-current-tid="{topic.tid}"
                data-limit="35"
              >
                <label class="visually-hidden" for="wiki-sidebar-dir-filter-{topic.tid}">Filter pages in this namespace</label>
                <input
                  type="search"
                  id="wiki-sidebar-dir-filter-{topic.tid}"
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
                  <a class="wiki-sidebar-nav-page" href="{config.relative_path}{sectionNavigation.childSections.wikiPath}">
                    <span class="wiki-sidebar-page-title">{sectionNavigation.childSections.name}</span>
                  </a>
                </li>
                <!-- END sectionNavigation.childSections -->
              </ul>
              <!-- ENDIF hasSectionChildNamespaces -->
            </nav>
          </div>
        </div>
      </aside>
      <!-- ENDIF hasSectionNavigation -->

      <aside class="wiki-article-drawer wiki-article-drawer--toc wiki-article-toc" id="wiki-article-drawer-toc" data-wiki-article-drawer="toc" data-wiki-article-toc-root hidden aria-label="Article table of contents">
        <button type="button" class="wiki-article-drawer__tab" id="wiki-article-drawer-toc-toggle" data-wiki-drawer-toggle data-wiki-drawer-target="toc" aria-controls="wiki-article-drawer-toc" aria-expanded="false">
          <i class="fa fa-fw fa-list-ul" aria-hidden="true"></i>
          <span class="wiki-article-drawer__tab-label">Contents</span>
        </button>
        <div class="wiki-article-drawer__panel card">
          <div class="wiki-article-drawer__header">
            <h2 class="wiki-article-drawer__title" id="wiki-article-drawer-toc-title">Contents</h2>
            <button type="button" class="wiki-article-drawer__close" data-wiki-drawer-close data-wiki-drawer-target="toc" aria-label="Close table of contents">
              <i class="fa fa-fw fa-times" aria-hidden="true"></i>
            </button>
          </div>
          <nav class="wiki-article-toc__list-host wiki-article-drawer__body wiki-sidebar-panel-scroll" data-wiki-article-toc aria-labelledby="wiki-article-drawer-toc-title"></nav>
        </div>
      </aside>

      <button type="button" class="wiki-article-drawer-backdrop" data-wiki-drawer-backdrop hidden aria-label="Close article navigation drawers"></button>
    </div>

    <nav class="wiki-fab-dock wiki-fab-dock--floating" aria-label="Page tools">
      <div class="wiki-fab-dock-inner">
        <!-- IF canEditWikiPage -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="{config.relative_path}/wiki/edit/{topic.tid}" title="Edit this wiki page" aria-label="Edit this wiki page">
          <i class="fa fa-fw fa-pencil" aria-hidden="true"></i>
        </a>
        <!-- ENDIF canEditWikiPage -->
        <!-- IF canMoveWikiPage -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon" data-wiki-move-page="1" data-tid="{topic.tid}" data-cid="{category.cid}" data-title="{pageTitle}" data-parent-title="{pageParentTitle}" data-namespace-name="{category.name}" title="Move this wiki page" aria-label="Move this wiki page">
          <i class="fa fa-fw fa-arrows" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canMoveWikiPage -->
        <!-- IF canChangeWikiOwner -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon" data-wiki-change-owner="1" data-tid="{topic.tid}" title="Change page owner" aria-label="Change page owner">
          <i class="fa fa-fw fa-user" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canChangeWikiOwner -->
        <!-- IF canMakeWikiSubpage -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon" data-wiki-make-subpage="1" data-cid="{category.cid}" data-title="{subpageDraftTitle}" title="Make a subpage" aria-label="Make a subpage">
          <i class="fa fa-fw fa-level-down" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canMakeWikiSubpage -->
        <!-- IF rootNamespaceCanCreatePage -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="#" data-wiki-create-page="1" data-cid="{rootNamespaceCid}" title="Create a new wiki page in the root namespace" aria-label="Create a new wiki page in the root namespace">
          <i class="fa fa-fw fa-file-text" aria-hidden="true"></i>
        </a>
        <!-- ENDIF rootNamespaceCanCreatePage -->
        <!-- IF rootNamespaceCanCreateWikiNamespaces -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="{config.relative_path}/wiki/namespace/create/{rootNamespaceCid}" title="Create a child wiki namespace under the root namespace" aria-label="Create a child wiki namespace under the root namespace">
          <i class="fa fa-fw fa-folder-open" aria-hidden="true"></i>
        </a>
        <!-- ENDIF rootNamespaceCanCreateWikiNamespaces -->
        <!-- IF canWatchWikiArticle -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon<!-- IF wikiArticleWatched --> active<!-- ENDIF wikiArticleWatched -->" data-wiki-article-watch="1" data-tid="{topic.tid}" data-watching="<!-- IF wikiArticleWatched -->1<!-- ELSE -->0<!-- ENDIF wikiArticleWatched -->" title="<!-- IF wikiArticleWatched -->Stop watching wiki article edits<!-- ELSE -->Watch wiki article edits<!-- ENDIF wikiArticleWatched -->" aria-label="<!-- IF wikiArticleWatched -->Stop watching wiki article edits<!-- ELSE -->Watch wiki article edits<!-- ENDIF wikiArticleWatched -->" aria-pressed="<!-- IF wikiArticleWatched -->true<!-- ELSE -->false<!-- ENDIF wikiArticleWatched -->">
          <i class="fa fa-fw <!-- IF wikiArticleWatched -->fa-eye<!-- ELSE -->fa-eye-slash<!-- ENDIF wikiArticleWatched -->" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canWatchWikiArticle -->
        <!-- IF showWikiDiscussionLink -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="{config.relative_path}/topic/{topic.slug}" title="Open the forum discussion thread" aria-label="Open discussion thread">
          <i class="fa fa-fw fa-comments" aria-hidden="true"></i>
        </a>
        <!-- ENDIF showWikiDiscussionLink -->
        <!-- IF canDeleteWikiPage -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon wiki-fab-btn--danger wiki-delete-page" data-wiki-delete-topic="1" data-tid="{topic.tid}" data-redirect-href="{config.relative_path}{category.wikiPath}" title="Permanently remove this wiki page" aria-label="Remove this wiki page">
          <i class="fa fa-fw fa-trash-o" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canDeleteWikiPage -->
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
