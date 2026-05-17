<div class="westgate-wiki">
  <header class="wiki-page-header wiki-page-header--search mb-4">
    <!-- IMPORT partials/wiki/search-chrome.tpl -->
    <div class="wiki-page-heading">
      <h1 class="wiki-page-heading__title" data-wiki-search-heading>
        <!-- IF hasSearchQuery -->Results for {wikiSearchQuery}<!-- ELSE -->Search the Wiki<!-- ENDIF hasSearchQuery -->
      </h1>
    </div>
  </header>

  <section
    class="wiki-search-page"
    data-wiki-search-page
    data-search-query="{wikiSearchQuery}"
  >
    <div class="wiki-search-page__status small text-muted mb-3" data-wiki-search-page-status aria-live="polite"></div>

    <div class="wiki-search-page__results" data-wiki-search-page-results>
      <!-- IF showSearchEmptyPrompt -->
      <article class="wiki-status-card card">
        <div class="card-body">
          <h2>Search for wiki pages and namespaces</h2>
          <p class="mb-0">Type a page title, title path, or namespace name to search the readable wiki.</p>
        </div>
      </article>
      <!-- ENDIF showSearchEmptyPrompt -->

      <!-- IF showSearchSetupState -->
      <article class="wiki-status-card card">
        <div class="card-body">
          <h2>Wiki Search Unavailable</h2>
          <p class="mb-0">No wiki namespaces are configured yet.</p>
        </div>
      </article>
      <!-- ENDIF showSearchSetupState -->

      <!-- IF showSearchNoReadableNamespaces -->
      <article class="wiki-status-card card">
        <div class="card-body">
          <h2>No Readable Wiki Namespaces</h2>
          <p class="mb-0">There are no wiki namespaces available to your account.</p>
        </div>
      </article>
      <!-- ENDIF showSearchNoReadableNamespaces -->

      <!-- IF searchQueryTooShort -->
      <article class="wiki-status-card card">
        <div class="card-body">
          <h2>Keep Typing</h2>
          <p class="mb-0">Use at least two characters to search the wiki.</p>
        </div>
      </article>
      <!-- ENDIF searchQueryTooShort -->

      <!-- IF showSearchNoResults -->
      <article class="wiki-status-card card">
        <div class="card-body">
          <h2>No Results</h2>
          <p class="mb-0">No readable wiki pages or namespaces matched <strong>{wikiSearchQuery}</strong>.</p>
        </div>
      </article>
      <!-- ENDIF showSearchNoResults -->

      <!-- IF hasSearchResults -->
      <div class="wiki-search-results">
        <!-- IF hasExactResults -->
        <section class="wiki-search-results__group" aria-labelledby="wiki-search-exact-heading">
          <h2 id="wiki-search-exact-heading">Exact Matches</h2>
          <ul class="wiki-search-results__list">
            <!-- BEGIN exactResults -->
            <li class="wiki-search-result wiki-search-result--page">
              <a class="wiki-search-result__title" href="{config.relative_path}{exactResults.wikiPath}">{exactResults.titleLeaf}</a>
              <span class="wiki-search-result__meta">{exactResults.namespaceTitle}</span>
            </li>
            <!-- END exactResults -->
          </ul>
        </section>
        <!-- ENDIF hasExactResults -->

        <!-- IF hasPageResults -->
        <section class="wiki-search-results__group" aria-labelledby="wiki-search-pages-heading">
          <h2 id="wiki-search-pages-heading">Pages</h2>
          <ul class="wiki-search-results__list">
            <!-- BEGIN pageResults -->
            <li class="wiki-search-result wiki-search-result--page">
              <a class="wiki-search-result__title" href="{config.relative_path}{pageResults.wikiPath}">
                <!-- IF pageResults.hasParentPath -->
                <span class="wiki-topic-parent-path">
                  <!-- BEGIN ./parentTitlePathSegments -->
                  <!-- IF ./hasSeparatorBefore --><span class="wiki-topic-title-separator" aria-hidden="true">/</span><!-- ENDIF ./hasSeparatorBefore -->
                  <span class="wiki-topic-parent-path__part">{./text}</span>
                  <!-- END ./parentTitlePathSegments -->
                </span>
                <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
                <!-- ENDIF pageResults.hasParentPath -->
                <span class="wiki-topic-title-leaf">{pageResults.titleLeaf}</span>
              </a>
              <span class="wiki-search-result__meta">{pageResults.namespaceTitle}</span>
            </li>
            <!-- END pageResults -->
          </ul>
        </section>
        <!-- ENDIF hasPageResults -->

        <!-- IF hasNamespaceResults -->
        <section class="wiki-search-results__group" aria-labelledby="wiki-search-namespaces-heading">
          <h2 id="wiki-search-namespaces-heading">Namespaces</h2>
          <ul class="wiki-search-results__list">
            <!-- BEGIN namespaceResults -->
            <li class="wiki-search-result wiki-search-result--namespace">
              <a class="wiki-search-result__title" href="{config.relative_path}{namespaceResults.wikiPath}">{namespaceResults.title}</a>
              <span class="wiki-search-result__meta">{namespaceResults.wikiPath}</span>
            </li>
            <!-- END namespaceResults -->
          </ul>
        </section>
        <!-- ENDIF hasNamespaceResults -->
      </div>
      <!-- ENDIF hasSearchResults -->
    </div>
  </section>
</div>
