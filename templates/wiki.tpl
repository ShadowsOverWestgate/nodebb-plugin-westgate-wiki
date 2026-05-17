<div class="westgate-wiki">
  <header class="wiki-page-header mb-4">
    <!-- IMPORT partials/wiki/breadcrumb-trail.tpl -->
    <!-- IMPORT partials/wiki/search-chrome.tpl -->
    <div class="wiki-page-heading">
      <h1 class="wiki-page-heading__title">Westgate Wiki</h1>
    </div>
    <p class="wiki-hub-tagline mb-0 mt-2">
      Lore, factions, locations, rules, and player guidance for Shadows Over Westgate.
    </p>
  </header>

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

  <!-- IF homePageSetupRequired -->
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
  <!-- ENDIF homePageSetupRequired -->

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
      <p>
        {configuredCategoryCount} wiki categories are configured, but there are no visible topics to list right now.
      </p>
      <!-- IF includeChildCategories -->
      <p>
        Descendant namespace inheritance is enabled, so the wiki currently spans {effectiveCategoryCount} categories including child namespaces.
      </p>
      <!-- ENDIF includeChildCategories -->
    </div>
  </section>
  <!-- ENDIF hasSections -->
  <!-- ENDIF showNamespaceIndex -->
</div>
