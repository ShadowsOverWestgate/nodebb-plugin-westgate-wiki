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
        <!-- IF hasCreateIntent -->
        <section class="wiki-status-card wiki-status-card-redlink card mb-4">
          <div class="card-body">
            <h2>Missing Wiki Page</h2>
            <p>
              <strong>{createIntentTitle}</strong> does not exist in <strong>{createIntentNamespaceName}</strong> yet.
            </p>
            <p>
              Follow the wiki pattern and create it directly in this namespace.
            </p>
            <a
              class="wiki-card-link wiki-redlink-action"
              href="#"
              data-wiki-create-page="1"
              data-cid="{createIntentCid}"
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

        <!-- IF hasNodeListingRows -->
        <section class="wiki-page-body mt-4">
          <article class="wiki-page-content wiki-article-prose wiki-namespace-index wiki-node-contents card">
            <div class="card-body">
              <h2 class="wiki-index-subsection-title" style="margin-top:0;">Contents</h2>

              <!-- IF hasNodeListingNamespaceRows -->
              <section class="wiki-index-namespaces-block" aria-labelledby="wiki-node-ns-heading">
                <h3 class="wiki-index-subsection-title" id="wiki-node-ns-heading" style="margin-top:0;">Child Namespaces</h3>
                <ul class="wiki-index-list wiki-index-list--namespaces">
                  <!-- BEGIN nodeListingNamespaceRows -->
                  <li class="wiki-index-entry wiki-index-entry--namespace">
                    <div class="wiki-index-entry-main">
                      <a class="wiki-index-entry-title" href="{config.relative_path}{./wikiPath}">
                        {./displayTitle}
                      </a>
                    </div>
                  </li>
                  <!-- END nodeListingNamespaceRows -->
                </ul>
              </section>
              <!-- ENDIF hasNodeListingNamespaceRows -->

              <!-- IF hasNodeListingArticleRows -->
              <!-- IF hasNodeListingArticleDivider -->
              <hr class="wiki-index-section-rule" />
              <!-- ENDIF hasNodeListingArticleDivider -->
              <section class="wiki-index-pages-block" aria-labelledby="wiki-node-pages-heading">
                <h3 class="wiki-index-subsection-title" id="wiki-node-pages-heading"><!-- IF isNamespaceIndexPage -->Articles<!-- ELSE -->Subpages<!-- ENDIF isNamespaceIndexPage --></h3>
                <ul class="wiki-index-list">
                  <!-- BEGIN nodeListingArticleRows -->
                  <li class="wiki-index-entry wiki-index-entry--article">
                    <div class="wiki-index-entry-main">
                      <a class="wiki-index-entry-title" href="{config.relative_path}{./wikiPath}">
                        {./displayTitle}
                      </a>
                    </div>
                  </li>
                  <!-- END nodeListingArticleRows -->
                </ul>
              </section>
              <!-- ENDIF hasNodeListingArticleRows -->

              <!-- IF hasNodeListingBranchRows -->
              <!-- IF hasNodeListingBranchDivider -->
              <hr class="wiki-index-section-rule" />
              <!-- ENDIF hasNodeListingBranchDivider -->
              <section class="wiki-index-branches-block" aria-labelledby="wiki-node-branches-heading">
                <h3 class="wiki-index-subsection-title" id="wiki-node-branches-heading">Branches</h3>
                <ul class="wiki-index-list">
                  <!-- BEGIN nodeListingBranchRows -->
                  <li class="wiki-index-entry wiki-index-entry--branch">
                    <div class="wiki-index-entry-main">
                      <a class="wiki-index-entry-title" href="{config.relative_path}{./wikiPath}">
                        {./displayTitle}
                      </a>
                    </div>
                  </li>
                  <!-- END nodeListingBranchRows -->
                </ul>
              </section>
              <!-- ENDIF hasNodeListingBranchRows -->
            </div>
          </article>
        </section>
        <!-- ENDIF hasNodeListingRows -->
      </div>
    </div>

    <div class="wiki-article-drawers" data-wiki-article-drawers>
      <!-- IF hasSectionNavigation -->
      <!-- IMPORT partials/wiki/page-nav-drawer.tpl -->
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

    <nav class="wiki-fab-dock wiki-fab-dock--floating" aria-label="<!-- IF isNamespaceIndexPage -->Namespace tools<!-- ELSE -->Page tools<!-- ENDIF isNamespaceIndexPage -->">
      <div class="wiki-fab-dock-inner">
        <!-- IF isNamespaceIndexPage -->
        <!-- IF canEditWikiPage -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="{config.relative_path}/wiki/edit/{topic.tid}" title="Edit namespace index page" aria-label="Edit namespace index page">
          <i class="fa fa-fw fa-pencil" aria-hidden="true"></i>
        </a>
        <!-- ENDIF canEditWikiPage -->
        <!-- IF namespaceIndexCanCreatePage -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="#" data-wiki-create-page="1" data-cid="{namespaceIndexActionCid}" title="Create a new wiki page in this namespace" aria-label="Create a new wiki page in this namespace">
          <i class="fa fa-fw fa-file-text" aria-hidden="true"></i>
        </a>
        <!-- ENDIF namespaceIndexCanCreatePage -->
        <!-- IF namespaceIndexCanCreateWikiNamespaces -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="{config.relative_path}/wiki/namespace/create/{namespaceIndexActionCid}" title="Create a child wiki namespace under this namespace" aria-label="Create a child wiki namespace">
          <i class="fa fa-fw fa-folder-open" aria-hidden="true"></i>
        </a>
        <!-- ENDIF namespaceIndexCanCreateWikiNamespaces -->
        <!-- IF canDeleteWikiPage -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon wiki-fab-btn--danger wiki-delete-page" data-wiki-tombstone-page="1" data-tid="{topic.tid}" data-redirect-href="{config.relative_path}{namespaceIndexDeleteRedirectPath}" title="Hide namespace index page" aria-label="Hide namespace index page">
          <i class="fa fa-fw fa-trash-o" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canDeleteWikiPage -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon" data-wiki-scroll-top="1" title="Scroll to top" aria-label="Scroll to top">
          <i class="fa fa-fw fa-chevron-up" aria-hidden="true"></i>
        </button>
        <!-- ELSE -->
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
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon" data-wiki-make-subpage="1" data-cid="{category.cid}" data-title="{subpageDraftTitle}" data-wiki-create-namespace-path="{category.wikiPath}" title="Make a subpage" aria-label="Make a subpage">
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
          <i class="fa fa-fw <!-- IF wikiArticleWatched -->fa-eye-slash<!-- ELSE -->fa-eye<!-- ENDIF wikiArticleWatched -->" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canWatchWikiArticle -->
        <!-- IF showWikiDiscussionLink -->
        <a class="wiki-fab-btn wiki-fab-btn--icon" href="{config.relative_path}/topic/{topic.slug}" title="Open the forum discussion thread" aria-label="Open discussion thread">
          <i class="fa fa-fw fa-comments" aria-hidden="true"></i>
        </a>
        <!-- ENDIF showWikiDiscussionLink -->
        <!-- IF canDeleteWikiPage -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon wiki-fab-btn--danger wiki-delete-page" data-wiki-tombstone-page="1" data-tid="{topic.tid}" data-redirect-href="{config.relative_path}{category.wikiPath}" title="Hide this wiki page" aria-label="Hide this wiki page">
          <i class="fa fa-fw fa-trash-o" aria-hidden="true"></i>
        </button>
        <!-- ENDIF canDeleteWikiPage -->
        <button type="button" class="wiki-fab-btn wiki-fab-btn--icon" data-wiki-scroll-top="1" title="Scroll to top" aria-label="Scroll to top">
          <i class="fa fa-fw fa-chevron-up" aria-hidden="true"></i>
        </button>
        <!-- ENDIF isNamespaceIndexPage -->
      </div>
    </nav>
  </div>
</div>

<!-- IF config.cache-buster -->
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/article-body.css?{config.cache-buster}" />
<!-- ELSE -->
<link rel="stylesheet" href="{config.relative_path}/westgate-wiki/compose/article-body.css" />
<!-- ENDIF config.cache-buster -->
