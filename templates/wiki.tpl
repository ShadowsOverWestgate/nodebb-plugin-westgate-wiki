<div class="westgate-wiki">
  <header class="wiki-page-header mb-4">
    <!-- IMPORT partials/wiki/breadcrumb-trail.tpl -->
    <!-- IMPORT partials/wiki/search-chrome.tpl -->
    <div class="wiki-page-heading">
      <!-- IF canonicalNodeView -->
      <h1 class="wiki-page-heading__title">{canonicalTitle}</h1>
      <!-- ELSE -->
      <h1 class="wiki-page-heading__title">Westgate Wiki</h1>
      <!-- ENDIF canonicalNodeView -->
    </div>
    <!-- IF canonicalNodeView -->
    <!-- ELSE -->
    <p class="wiki-hub-tagline mb-0 mt-2">
      Lore, factions, locations, rules, and player guidance for Shadows Over Westgate.
    </p>
    <!-- ENDIF canonicalNodeView -->
  </header>

  <!-- IF canonicalNodeView -->
  <div class="wiki-content-layout">
    <div class="wiki-page-main-column">
      <!-- IF hasArticle -->
      <section class="wiki-page-body mb-4">
        <article class="wiki-page-content wiki-article-prose card">
          <!-- IF article.hasArticleCss -->
          <style data-westgate-wiki-article-css>
{article.scopedArticleCss}
          </style>
          <!-- ENDIF article.hasArticleCss -->
          <div class="card-body wiki-article-custom-css-scope-{article.topic.tid}">
            {{txEscape(article.mainPost.content)}}
          </div>
        </article>
      </section>
      <!-- ENDIF hasArticle -->

      <!-- IF hasNamespace -->
      <!-- IF namespace.section.description -->
      <section class="wiki-section-description wiki-article-prose mb-4">
        {namespace.section.description}
      </section>
      <!-- ENDIF namespace.section.description -->
      <!-- ENDIF hasNamespace -->

      <!-- IF hasNodeListingRows -->
      <section class="wiki-page-body">
        <article class="wiki-page-content wiki-article-prose wiki-namespace-index card">
          <div class="card-body">
            <h2 class="wiki-index-subsection-title" style="margin-top:0;">Contents</h2>
            <ul class="wiki-index-list">
              <!-- BEGIN nodeListingRows -->
              <li class="wiki-index-entry">
                <div class="wiki-index-entry-main">
                  <a class="wiki-index-entry-title" href="{config.relative_path}{./wikiPath}">
                    {./displayTitle}
                  </a>
                </div>
              </li>
              <!-- END nodeListingRows -->
            </ul>
          </div>
        </article>
      </section>
      <!-- ELSE -->
      <!-- IF isBranchOnly -->
      <section class="wiki-status-card card">
        <div class="card-body">
          <h2>No Visible Wiki Entries</h2>
          <p class="mb-0">There are no visible child namespaces or wiki pages at this path.</p>
        </div>
      </section>
      <!-- ENDIF isBranchOnly -->
      <!-- ENDIF hasNodeListingRows -->
    </div>
  </div>
  <!-- ELSE -->

  <!-- IF showSetupNotices -->
  <!-- IF setupRequired -->
  <section class="wiki-status-card card mb-4">
    <div class="card-body">
      <h2>Wiki Setup Required</h2>
      <p>
        No wiki categories are configured yet. Add category IDs in the ACP at
        <strong>Plugins &gt; Westgate Wiki</strong> to get started.
      </p>
    </div>
  </section>
  <!-- ENDIF setupRequired -->
  <!-- ENDIF showSetupNotices -->

  <!-- IF showHomeSetupCard -->
  <section class="wiki-status-card card mb-4">
    <div class="card-body">
      <h2>Set the Wiki Homepage</h2>
      <p>
        The wiki needs a <strong>homepage topic</strong> to show at <code>/wiki</code>. The fastest way to get started
        is to create that page now; it will be set as the homepage automatically. You can still change the homepage
        later under <strong>Admin &rarr; Plugins &rarr; Westgate Wiki &rarr; Wiki homepage (topic id)</strong> (any
        existing wiki page by id).
      </p>
      <!-- IF canBootstrapHome -->
      <p>
        <a
          class="btn btn-primary"
          href="{config.relative_path}/wiki/compose/{bootstrapHomeCid}?setHome=1"
        >Create wiki homepage</a>
      </p>
      <p class="text-muted small mb-0">Opens the wiki editor. When you publish, this site sets <code>/wiki</code> to that new page.</p>
      <!-- ELSE -->
      <p class="text-muted mb-0">
        You do not have permission to start a new page in a wiki namespace. Ask a moderator or administrator to create
        the homepage, or to grant you posting access; they can also set an existing page by topic id in the ACP.
      </p>
      <!-- ENDIF canBootstrapHome -->
    </div>
  </section>
  <!-- ENDIF showHomeSetupCard -->

  <!-- IF showSetupNotices -->
  <!-- IF homePageLoadError -->
  <section class="wiki-status-card wiki-status-card-warning card mb-4">
    <div class="card-body">
      <h2>Wiki Homepage Unavailable</h2>
      <!-- IF homePageErrorForbidden -->
      <p>You do not have permission to read the configured wiki homepage topic, or the topic is unavailable.</p>
      <!-- ELSE -->
      <p>
        The configured homepage topic could not be loaded
        (<!-- IF homePageErrorNotFound -->not found<!-- ELSE -->{homePageErrorStatus}<!-- ENDIF homePageErrorNotFound -->).
        Choose another topic id in the ACP or restore the topic.
      </p>
      <!-- ENDIF homePageErrorForbidden -->
    </div>
  </section>
  <!-- ENDIF homePageLoadError -->

  <!-- IF hasInvalidCategoryIds -->
  <section class="wiki-status-card wiki-status-card-warning card mb-4">
    <div class="card-body">
      <h2>Some Configured Categories Could Not Be Loaded</h2>
      <p>
        The following category IDs are currently invalid or unavailable:
        <code>{invalidCategoryIdsText}</code>
      </p>
    </div>
  </section>
  <!-- ENDIF hasInvalidCategoryIds -->
  <!-- ENDIF showSetupNotices -->

  <!-- IF showWikiEmptyState -->
  <section class="wiki-status-card card mb-4">
    <div class="card-body">
      <h2>No Wiki Pages Yet</h2>
      <p class="mb-0">
        The Westgate wiki has no published pages yet. Check back soon, or return to the
        <a href="{config.relative_path}/">forum</a> in the meantime.
      </p>
    </div>
  </section>
  <!-- ENDIF showWikiEmptyState -->

  <!-- IF showNamespaceIndex -->
  <!-- IF hasSections -->
  <section class="wiki-grid">
    <!-- BEGIN sections -->
    <article class="wiki-card card h-100">
      <div class="card-body d-flex flex-column gap-2">
        <div class="wiki-card-header">
          <h2>
            <a href="{config.relative_path}{sections.wikiPath}">
              {sections.name}
            </a>
          </h2>
          <span class="wiki-topic-count">{sections.topicCount} pages</span>
        </div>

        <!-- IF sections.description -->
        <div class="wiki-card-description">
          {sections.description}
        </div>
        <!-- ENDIF sections.description -->

        <ul class="wiki-topic-list">
          <!-- BEGIN ./topics -->
          <li<!-- IF ./hasParentPath --> class="wiki-topic-list__item--subpage" style="--wiki-title-depth: {./titleDepth};"<!-- ENDIF ./hasParentPath -->>
            <a href="{config.relative_path}{./wikiPath}">
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
          </li>
          <!-- END ./topics -->
        </ul>

        <a class="wiki-card-link" href="{config.relative_path}{sections.wikiPath}">
          Browse Section
        </a>
        <!-- IF sections.privileges.canCreatePage -->
        <a
          class="wiki-card-link wiki-card-link-secondary"
          href="#"
          data-wiki-create-page="1"
          data-cid="{sections.cid}"
        >
          Create Page
        </a>
        <!-- ENDIF sections.privileges.canCreatePage -->
        <!-- IF canCreateWikiNamespaces -->
        <a class="wiki-card-link wiki-card-link-secondary" href="{config.relative_path}/wiki/namespace/create/{sections.cid}">
          Create child namespace
        </a>
        <!-- ENDIF canCreateWikiNamespaces -->
      </div>
    </article>
    <!-- END sections -->
  </section>
  <!-- ELSE -->
  <section class="wiki-status-card card">
    <div class="card-body">
      <h2>No Wiki Pages Yet</h2>
      <!-- IF showSetupNotices -->
      <p>
        {configuredCategoryCount} wiki categories are configured, but there are no visible topics to list right now.
      </p>
      <!-- IF includeChildCategories -->
      <p>
        Descendant namespace inheritance is enabled, so the wiki currently spans {effectiveCategoryCount} categories including child namespaces.
      </p>
      <!-- ENDIF includeChildCategories -->
      <!-- ELSE -->
      <p class="mb-0">
        The Westgate wiki has no published pages yet. Check back soon, or return to the
        <a href="{config.relative_path}/">forum</a> in the meantime.
      </p>
      <!-- ENDIF showSetupNotices -->
    </div>
  </section>
  <!-- ENDIF hasSections -->
  <!-- ENDIF showNamespaceIndex -->
  <!-- ENDIF canonicalNodeView -->
</div>
