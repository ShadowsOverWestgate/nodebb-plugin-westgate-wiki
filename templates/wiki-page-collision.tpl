<div class="westgate-wiki">
  <header class="wiki-page-header mb-4">
    <!-- IMPORT partials/wiki/breadcrumb-trail.tpl -->
    <!-- IMPORT partials/wiki/search-chrome.tpl -->
    <div class="wiki-page-heading">
      <h1 class="wiki-page-heading__title">Ambiguous Wiki Page</h1>
    </div>
    <p class="wiki-hub-tagline mb-0 mt-2">
      Multiple wiki articles match <code>{requestedWikiPath}</code>.
    </p>
  </header>

  <section class="wiki-status-card wiki-status-card-warning card mb-4">
    <div class="card-body">
      <h2>Choose an article</h2>
      <p>
        These articles seem to share an URL. Please choose one of the articles, and if you have permissions to do it, rename them to remove the ambiguity.
      </p>

      <!-- IF hasPageCollisionRows -->
      <ul class="wiki-index-list">
        <!-- BEGIN pageCollisionRows -->
        <li class="wiki-index-entry wiki-directory-row<!-- IF ./hasParentPath --> wiki-index-entry--subpage<!-- ENDIF ./hasParentPath -->"<!-- IF ./hasParentPath --> style="--wiki-title-depth: {./titleDepth};"<!-- ENDIF ./hasParentPath -->>
          <div class="wiki-index-entry-main">
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
          </div>
        </li>
        <!-- END pageCollisionRows -->
      </ul>
      <!-- ENDIF hasPageCollisionRows -->
    </div>
  </section>
</div>
