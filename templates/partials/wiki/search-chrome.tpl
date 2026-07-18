<div class="wiki-search-chrome" data-wiki-search-chrome>
  <!-- IF canManageWiki -->
  <a class="wiki-search-chrome__manage" href="{config.relative_path}/wiki/manage" title="Manage wiki pages">
    <i class="fa fa-table" aria-hidden="true"></i> Manage
  </a>
  <!-- ENDIF canManageWiki -->
  <form class="wiki-search-chrome__form" action="{config.relative_path}/wiki/search" method="get" role="search" data-wiki-search-form>
    <label class="visually-hidden" for="wiki-search-chrome-input">Search the wiki</label>
    <div class="wiki-search-chrome__control">
      <i class="fa fa-search wiki-search-chrome__icon" aria-hidden="true"></i>
      <input
        id="wiki-search-chrome-input"
        class="form-control form-control-sm wiki-search-chrome__input"
        type="search"
        name="q"
        value="{wikiSearchQuery}"
        placeholder="Search wiki"
        autocomplete="off"
        data-wiki-search-input
        data-wiki-search-mode="suggest"
      />
      <button class="btn btn-sm btn-primary wiki-search-chrome__button" type="submit">Search</button>
    </div>
    <div class="wiki-search-suggestions" data-wiki-search-suggestions hidden>
      <div class="wiki-search-suggestions__status small text-muted" data-wiki-search-status aria-live="polite"></div>
      <ul class="wiki-search-suggestions__list" data-wiki-search-results></ul>
      <a class="wiki-search-suggestions__all" href="{config.relative_path}/wiki/search" data-wiki-search-all hidden>View all results</a>
    </div>
  </form>
</div>
