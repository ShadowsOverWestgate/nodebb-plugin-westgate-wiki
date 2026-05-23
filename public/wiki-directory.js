/* global ajaxify */
"use strict";

(function wikiDirectoryClient() {
  if (typeof window === "undefined" || !window.document) {
    return;
  }

  var DEFAULT_LIMIT = 40;

  function relBase() {
    return (window.config && window.config.relative_path) || "";
  }

  function buildApiUrl(cid, which, params) {
    var base = relBase().replace(/\/$/, "");
    var path = base + "/api/v3/plugins/westgate-wiki/namespace/" + encodeURIComponent(String(cid)) + "/" + which;
    var u = new URL(path, window.location.origin);
    if (params) {
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v !== undefined && v !== null && v !== "") {
          u.searchParams.set(k, String(v));
        }
      });
    }
    return u.toString();
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizePathSegment(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPageTitlePath(page) {
    if (page && Array.isArray(page.titlePath) && page.titlePath.length) {
      return page.titlePath.map(function (segment) {
        return String(segment || "").trim();
      }).filter(Boolean);
    }
    var segments = Array.isArray(page && page.parentTitlePathSegments) ?
      page.parentTitlePathSegments.map(function (segment) {
        return String(segment && segment.text || "").trim();
      }).filter(Boolean) :
      String(page && page.parentTitlePathText || "").split(/\s*::\s*/).filter(Boolean);
    segments.push(String(page && (page.titleLeaf || page.title) || "").trim());
    return segments.filter(Boolean);
  }

  function titlePathAttr(page) {
    return escapeHtml(JSON.stringify(getPageTitlePath(page)));
  }

  function renderParentPath(page, className) {
    if (!page || !page.hasParentPath) {
      return "";
    }
    var segments = Array.isArray(page.parentTitlePathSegments) && page.parentTitlePathSegments.length ?
      page.parentTitlePathSegments :
      String(page.parentTitlePathText || "").split(/\s*::\s*/).filter(Boolean).map(function (text, index) {
        return { text: text, hasSeparatorBefore: index > 0 };
      });
    if (!segments.length) {
      return "";
    }
    var inner = segments.map(function (segment) {
      var separator = segment.hasSeparatorBefore ?
        "<span class=\"wiki-topic-title-separator\" aria-hidden=\"true\">/</span>" :
        "";
      return separator + "<span class=\"" + className + "__part\">" + escapeHtml(segment.text || "") + "</span>";
    }).join("");
    return "<span class=\"" + className + "\">" + inner + "</span><span class=\"wiki-topic-title-separator\" aria-hidden=\"true\">/</span>";
  }

  function pageHasWikiPath(page) {
    return !!(page && page.hasWikiPath !== false && page.wikiPath);
  }

  function renderPageRow(page, rel) {
    var parent = renderParentPath(page, "wiki-topic-parent-path");
    var leaf = "<span class=\"wiki-topic-title-leaf\">" + escapeHtml(page.titleLeaf || page.title || "") + "</span>";
    var subpageClass = page.hasParentPath ? " wiki-index-entry--subpage" : "";
    var depth = parseInt(page.titleDepth, 10);
    var depthStyle = Number.isInteger(depth) && depth > 0 ? " style=\"--wiki-title-depth: " + escapeHtml(String(depth)) + ";\"" : "";
    var title = pageHasWikiPath(page) ?
      "<a class=\"wiki-index-entry-title\" href=\"" + escapeHtml(rel + page.wikiPath) + "\">" + parent + leaf + "</a>" :
      "<span class=\"wiki-index-entry-title wiki-index-entry-title--disabled\" aria-disabled=\"true\">" + parent + leaf + "</span>";
    return (
      "<li class=\"wiki-index-entry wiki-directory-row" + subpageClass + "\" data-wiki-title-path=\"" + titlePathAttr(page) + "\"" + depthStyle + ">" +
      "<div class=\"wiki-index-entry-main\">" +
      title +
      "</div></li>"
    );
  }

  function renderNavRow(page, rel) {
    var parent = renderParentPath(page, "wiki-sidebar-parent-path");
    var leaf = "<span class=\"wiki-sidebar-page-title\">" + escapeHtml(page.titleLeaf || page.title || "") + "</span>";
    var active = page.isActive ? " is-active" : "";
    var tidAttr = page.tid != null ? " data-wiki-nav-tid=\"" + escapeHtml(String(page.tid)) + "\"" : "";
    var title = pageHasWikiPath(page) ?
      "<a class=\"wiki-sidebar-nav-page\" href=\"" + escapeHtml(rel + page.wikiPath) + "\">" + parent + leaf + "</a>" :
      "<span class=\"wiki-sidebar-nav-page wiki-sidebar-nav-page--disabled\" aria-disabled=\"true\">" + parent + leaf + "</span>";
    return (
      "<li class=\"wiki-sidebar-nav-row wiki-sidebar-nav-row--page" + active + "\"" + tidAttr + " data-wiki-title-path=\"" + titlePathAttr(page) + "\">" +
      title +
      "</li>"
    );
  }

  function getRowTitlePath(row) {
    var attr = row && row.getAttribute("data-wiki-title-path");
    if (attr) {
      try {
        var parsed = JSON.parse(attr);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.map(normalizePathSegment).filter(Boolean);
        }
      } catch (err) {
        /* infer from rendered title parts below */
      }
    }

    var parts = [];
    Array.prototype.forEach.call(row.querySelectorAll(".wiki-sidebar-parent-path__part, .wiki-topic-parent-path__part"), function (part) {
      var text = normalizePathSegment(part.textContent);
      if (text) {
        parts.push(text);
      }
    });
    var leaf = row.querySelector(".wiki-sidebar-page-title, .wiki-topic-title-leaf");
    var leafText = normalizePathSegment(leaf && leaf.textContent);
    if (leafText) {
      parts.push(leafText);
    }
    return parts;
  }

  function isDescendantPath(path, ancestor) {
    if (!path || !ancestor || path.length <= ancestor.length) {
      return false;
    }
    for (var i = 0; i < ancestor.length; i += 1) {
      if (path[i] !== ancestor[i]) {
        return false;
      }
    }
    return true;
  }

  function getTreeRows(list) {
    return Array.prototype.filter.call(list ? list.children : [], function (row) {
      return row && row.matches && row.matches(".wiki-directory-row, .wiki-sidebar-nav-row--page");
    });
  }

  function getTreeRowLabel(row) {
    var title = row && row.querySelector(".wiki-sidebar-page-title, .wiki-topic-title-leaf");
    return (title && title.textContent || "page").replace(/\s+/g, " ").trim();
  }

  function setTreeRowCollapsed(row, collapsed) {
    var label = getTreeRowLabel(row);
    var toggle = row && row.querySelector(":scope > .wiki-directory-tree-toggle");

    row.classList.toggle("wiki-directory-row--collapsed", !!collapsed);
    if (toggle) {
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute("aria-label", (collapsed ? "Expand " : "Collapse ") + label);
    }
  }

  function refreshTreeVisibility(list) {
    var rows = getTreeRows(list);
    var collapsedAncestors = [];

    rows.forEach(function (row) {
      var path = getRowTitlePath(row);
      collapsedAncestors = collapsedAncestors.filter(function (ancestor) {
        return isDescendantPath(path, ancestor);
      });
      row.hidden = collapsedAncestors.length > 0;
      if (row.classList.contains("wiki-directory-row--collapsed")) {
        collapsedAncestors.push(path);
      }
    });
  }

  function addTreeToggle(row, list) {
    if (row.querySelector(":scope > .wiki-directory-tree-toggle")) {
      return;
    }
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "wiki-directory-tree-toggle";
    toggle.innerHTML = '<i class="fa fa-fw fa-caret-down" aria-hidden="true"></i>';
    toggle.addEventListener("click", function (event) {
      var collapsed = !row.classList.contains("wiki-directory-row--collapsed");
      event.preventDefault();
      event.stopPropagation();
      setTreeRowCollapsed(row, collapsed);
      refreshTreeVisibility(list);
    });
    row.insertBefore(toggle, row.firstElementChild);
    setTreeRowCollapsed(row, true);
  }

  function expandActiveNavAncestors(list) {
    var activeRow = list && list.querySelector(".wiki-sidebar-nav-row--page.is-active");
    if (!activeRow) {
      return;
    }
    var activePath = getRowTitlePath(activeRow);
    if (!activePath || activePath.length <= 1) {
      return;
    }

    getTreeRows(list).forEach(function (row) {
      var path = getRowTitlePath(row);
      if (path.length < activePath.length && isDescendantPath(activePath, path)) {
        setTreeRowCollapsed(row, false);
      }
    });
  }

  function decorateTreeRows(list, options) {
    var rows = getTreeRows(list);
    rows.forEach(function (row, index) {
      var path = getRowTitlePath(row);
      row.style.setProperty("--wiki-title-depth", String(Math.max(0, path.length - 1)));
      row.style.setProperty("--wiki-nav-depth", String(Math.max(0, path.length - 1)));
      var next = rows[index + 1];
      var hasChildren = next && isDescendantPath(getRowTitlePath(next), path);
      row.classList.toggle("wiki-directory-row--has-children", !!hasChildren);
      if (hasChildren) {
        addTreeToggle(row, list);
      }
    });
    if (options && options.navMode) {
      expandActiveNavAncestors(list);
    }
    refreshTreeVisibility(list);
  }

  function parseBoolAttr(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v === "1" || v === "true") {
      return true;
    }
    if (v === "0" || v === "false") {
      return false;
    }
    return fallback;
  }

  function mountDirectory(mount) {
    if (!mount || mount.getAttribute("data-wiki-directory-ready") === "1") {
      return;
    }
    mount.setAttribute("data-wiki-directory-ready", "1");

    var cid = parseInt(mount.getAttribute("data-cid"), 10);
    if (!Number.isInteger(cid) || cid <= 0) {
      return;
    }

    var which = mount.getAttribute("data-wiki-directory-endpoint") || "pages";
    var list = mount.querySelector("[data-wiki-directory-list]");
    var moreBtn = mount.querySelector("[data-wiki-directory-more]");
    var statusEl = mount.querySelector("[data-wiki-directory-status]");
    var filterInput = mount.querySelector("[data-wiki-directory-filter]");
    var letterHost = mount.querySelector("[data-wiki-directory-letters]");
    var rel = relBase();
    var cursor = mount.getAttribute("data-initial-cursor") || "";
    var hasMore = parseBoolAttr(mount, "data-initial-has-more", false);
    var activeLetter = "";
    var debounceTimer = null;
    var aroundTid = parseInt(mount.getAttribute("data-around-tid") || "", 10);
    var navMode = mount.getAttribute("data-wiki-directory-mode") === "nav";
    var loading = false;

    function markActiveNav() {
      var cur = mount.getAttribute("data-current-tid");
      if (!cur || !list) {
        return;
      }
      Array.prototype.forEach.call(list.querySelectorAll(".wiki-sidebar-nav-row--page"), function (row) {
        row.classList.remove("is-active");
      });
      var row = list.querySelector('[data-wiki-nav-tid="' + cur + '"]');
      if (row) {
        row.classList.add("is-active");
      }
    }

    function setStatus(text) {
      if (statusEl) {
        statusEl.textContent = text || "";
      }
    }

    function buildLetterJump(letters) {
      if (!letterHost || !letters || !letters.length) {
        return;
      }
      letterHost.innerHTML = "";
      letters.forEach(function (L) {
        var a = document.createElement("a");
        a.className = "wiki-index-jump-link";
        a.href = "#";
        a.textContent = L;
        a.setAttribute("data-letter", L);
        a.addEventListener("click", function (e) {
          e.preventDefault();
          activeLetter = L === activeLetter ? "" : L;
          Array.prototype.forEach.call(letterHost.querySelectorAll("a"), function (x) {
            x.classList.toggle("is-active", x.getAttribute("data-letter") === activeLetter && activeLetter);
          });
          resetAndFetch();
        });
        letterHost.appendChild(a);
      });
    }

    function collectLettersFromList() {
      var seen = {};
      var out = [];
      if (!list) {
        return out;
      }
      Array.prototype.forEach.call(list.querySelectorAll(".wiki-topic-title-leaf, .wiki-sidebar-page-title"), function (el) {
        var t = (el.textContent || "").trim().toLowerCase();
        var ch = t.length ? t.charAt(0) : "";
        var L = (ch >= "a" && ch <= "z") ? ch.toUpperCase() : "#";
        if (!seen[L]) {
          seen[L] = true;
          out.push(L);
        }
      });
      out.sort(function (a, b) {
        if (a === "#") {
          return 1;
        }
        if (b === "#") {
          return -1;
        }
        return a.localeCompare(b);
      });
      return out;
    }

    function resetAndFetch() {
      if (loading) {
        return;
      }
      cursor = "";
      hasMore = true;
      if (list) {
        list.innerHTML = "";
      }
      loadMore(true);
    }

    function appendRows(pages, replace) {
      if (!list || !pages || !pages.length) {
        return;
      }
      var html = pages.map(function (p) {
        return navMode ? renderNavRow(p, rel) : renderPageRow(p, rel);
      }).join("");
      if (replace) {
        list.innerHTML = html;
      } else {
        list.insertAdjacentHTML("beforeend", html);
      }
      decorateTreeRows(list, { navMode: navMode });
    }

    function loadMore(isReset) {
      if (loading) {
        return;
      }
      if (isReset) {
        if (list) {
          list.innerHTML = "";
        }
        cursor = "";
        hasMore = true;
      }
      if (!hasMore && !isReset) {
        return;
      }

      loading = true;
      if (moreBtn) {
        moreBtn.disabled = true;
      }
      setStatus(isReset ? "Loading…" : "Loading more…");

      var params = {
        limit: mount.getAttribute("data-limit") || String(DEFAULT_LIMIT)
      };
      if (cursor) {
        params.after = cursor;
      }
      if (activeLetter) {
        params.letter = activeLetter;
      }
      if (filterInput && filterInput.value.trim()) {
        params.q = filterInput.value.trim();
      }
      if (Number.isInteger(aroundTid) && aroundTid > 0 && isReset && !params.after && !activeLetter && !params.q) {
        params.aroundTid = String(aroundTid);
      }

      fetch(buildApiUrl(cid, which, params), { credentials: "same-origin" })
        .then(function (res) {
          return res.json().then(function (body) {
            return { res: res, body: body };
          });
        })
        .then(function (pack) {
          if (!pack.res.ok) {
            var msg = (pack.body && pack.body.status && pack.body.status.message) || pack.res.statusText;
            throw new Error(msg);
          }
          var payload = (pack.body && pack.body.response) ? pack.body.response : pack.body;
          var pages = payload.pages || [];
          var cur = mount.getAttribute("data-current-tid");
          if (navMode && cur) {
            pages.forEach(function (p) {
              p.isActive = String(p.tid) === String(cur);
            });
          }
          cursor = payload.nextCursor || "";
          hasMore = !!payload.hasMore;
          appendRows(pages, !!isReset);
          if (navMode) {
            markActiveNav();
          }
          if (isReset && letterHost && !letterHost.childElementCount) {
            buildLetterJump(collectLettersFromList());
          }
          setStatus("");
        })
        .catch(function (err) {
          setStatus((err && err.message) || String(err));
        })
        .finally(function () {
          loading = false;
          if (moreBtn) {
            moreBtn.disabled = false;
            moreBtn.hidden = !hasMore;
          }
        });
    }

    if (moreBtn) {
      moreBtn.addEventListener("click", function (e) {
        e.preventDefault();
        loadMore(false);
      });
      moreBtn.hidden = !hasMore;
    }

    if (filterInput) {
      filterInput.addEventListener("input", function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          resetAndFetch();
        }, 220);
      });
    }

    var obs = mount.querySelector("[data-wiki-directory-sentinel]");
    if (obs && typeof window.IntersectionObserver === "function") {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && hasMore && !loading) {
            loadMore(false);
          }
        });
      }, { root: null, rootMargin: "120px", threshold: 0.01 });
      io.observe(obs);
    }

    if (letterHost && !letterHost.childElementCount) {
      buildLetterJump(collectLettersFromList());
    }

    if (navMode) {
      markActiveNav();
    }
    if (list) {
      decorateTreeRows(list, { navMode: navMode });
    }
  }

  function scanMounts(root) {
    (root || document).querySelectorAll("[data-wiki-directory-mount]").forEach(mountDirectory);
  }

  function init() {
    scanMounts(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if (typeof window.jQuery !== "undefined" && window.jQuery.fn) {
    window.jQuery(window).on("action:ajaxify.end", function () {
      setTimeout(function () {
        scanMounts(document);
      }, 0);
    });
  }
}());
