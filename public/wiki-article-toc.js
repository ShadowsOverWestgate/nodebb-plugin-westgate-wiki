/* Westgate wiki: in-page table of contents. Thrown errors reject ajaxify script load. */
(function initWikiArticleToc() {
  "use strict";
  if (typeof window === "undefined" || !window.document) {
    return;
  }
  const HEADING_SEL = "h1, h2, h3, h4, h5, h6";
  /** Cap headings processed for ToC to avoid freezing the browser on pathological pages. */
  const MAX_TOC_HEADINGS = 200;
  const ROOT_ARTICLE = "article.wiki-page-content.wiki-article-prose";
  const BODY = ".card-body";
  const ATTR_ROOT = "data-wiki-article-toc-root";
  const ATTR_MOUNT = "data-wiki-article-toc";
  const DRAWER_ATTR = "data-wiki-article-drawer";
  const DRAWER_TOGGLE_ATTR = "data-wiki-drawer-toggle";
  const DRAWER_CLOSE_ATTR = "data-wiki-drawer-close";
  const DRAWER_TARGET_ATTR = "data-wiki-drawer-target";
  const DRAWER_BACKDROP_ATTR = "data-wiki-drawer-backdrop";
  const DRAWER_OPEN_CLASS = "wiki-article-drawer--open";
  const MODAL_OPEN_CLASS = "wiki-article-drawer-modal-open";
  let drawersGlobalBound = false;

  function textToSlug(s) {
    var t = String(s || "")
      .trim()
      .toLowerCase();
    if (typeof t.normalize === "function") {
      t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    }
    return t
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function ensureHeadingIds(headings) {
    const used = new Set();
    headings.forEach((h) => {
      if (h.id) {
        used.add(h.id);
      }
    });

    headings.forEach((h) => {
      if (h.id) {
        h.classList.add("wiki-article-toc__heading");
        return;
      }
      const base = textToSlug(h.textContent || "");
      const b = base || "section";
      let k = 0;
      let candidate;
      do {
        candidate = k === 0 ? b : b + "-" + (k + 1);
        k += 1;
      } while (used.has(candidate) && k < 5000);
      h.id = candidate;
      used.add(candidate);
      h.classList.add("wiki-article-toc__heading");
    });
  }

  function buildNestedList(headings) {
    if (!headings.length) {
      return null;
    }

    const root = document.createElement("ol");
    root.className = "wiki-article-toc__ol";

    const stack = [{ list: root, hLevel: 0 }];

    for (let i = 0; i < headings.length; i += 1) {
      const h = headings[i];
      const level = parseInt(h.tagName[1], 10);
      if (!Number.isFinite(level) || level < 1) {
        continue;
      }

      while (stack.length > 1 && stack[stack.length - 1].hLevel >= level) {
        stack.pop();
      }

      const { list: parentList } = stack[stack.length - 1];
      const li = document.createElement("li");
      li.className = "wiki-article-toc__item";
      li.dataset.wikiTocLevel = String(level);

      const row = document.createElement("div");
      row.className = "wiki-article-toc__row";
      li.appendChild(row);

      const a = document.createElement("a");
      a.className = "wiki-article-toc__link";
      a.setAttribute("href", "#" + h.id);
      a.textContent = String(h.textContent || "").replace(/\s+/g, " ").trim();
      row.appendChild(a);
      parentList.appendChild(li);

      const next = headings[i + 1];
      const nextLevel = next ? parseInt(next.tagName[1], 10) : 0;
      if (next && nextLevel > level) {
        const sub = document.createElement("ol");
        sub.className = "wiki-article-toc__ol wiki-article-toc__ol--nest";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "wiki-article-toc__toggle";
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "Collapse " + (a.textContent || "section"));
        toggle.innerHTML = '<i class="fa fa-fw fa-caret-down" aria-hidden="true"></i>';
        toggle.addEventListener("click", function (event) {
          const collapsed = !li.classList.contains("wiki-article-toc__item--collapsed");
          event.preventDefault();
          event.stopPropagation();
          li.classList.toggle("wiki-article-toc__item--collapsed", collapsed);
          sub.hidden = collapsed;
          toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
          toggle.setAttribute("aria-label", (collapsed ? "Expand " : "Collapse ") + (a.textContent || "section"));
        });
        row.insertBefore(toggle, a);
        li.appendChild(sub);
        stack.push({ list: sub, hLevel: level });
      }
    }

    return root;
  }

  function bindTocSmoothScroll(tocMount) {
    if (!tocMount || tocMount.dataset.wikiTocSmoothBound === "1") {
      return;
    }
    tocMount.dataset.wikiTocSmoothBound = "1";
    tocMount.addEventListener("click", function onTocLinkClick(ev) {
      const anchor = ev.target && ev.target.closest
        ? ev.target.closest("a.wiki-article-toc__link")
        : null;
      if (!anchor || !tocMount.contains(anchor)) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.charAt(0) !== "#") {
        return;
      }
      const id = decodeURIComponent(href.slice(1));
      if (!id) {
        return;
      }
      let target;
      try {
        target = document.getElementById(id);
      } catch (eId) {
        return;
      }
      if (!target) {
        return;
      }
      ev.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof history.replaceState === "function") {
        try {
          history.replaceState(null, "", href);
        } catch (eHist) {
          /* ignore */
        }
      }
      if (!isSmallDrawerViewport() && typeof anchor.blur === "function") {
        anchor.blur();
      }
    });
  }

  function scrollToCurrentHash() {
    const hash = window.location && window.location.hash;
    if (!hash || hash.charAt(0) !== "#") {
      return;
    }
    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch (eDecode) {
      id = hash.slice(1);
    }
    if (!id) {
      return;
    }
    let target;
    try {
      target = document.getElementById(id);
    } catch (eId) {
      return;
    }
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start" });
    }
  }

  function isSmallDrawerViewport() {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 1199.98px)").matches;
  }

  function getArticleDrawersRoot() {
    return document.querySelector("[data-wiki-article-drawers]");
  }

  function getDrawer(name) {
    if (!name) {
      return null;
    }
    return document.querySelector("[" + DRAWER_ATTR + "=\"" + name + "\"]");
  }

  function getDrawerTarget(control) {
    return control && control.getAttribute(DRAWER_TARGET_ATTR);
  }

  function getDrawerToggles(name) {
    if (!name) {
      return [];
    }
    return [].slice.call(document.querySelectorAll(
      "[" + DRAWER_TOGGLE_ATTR + "][" + DRAWER_TARGET_ATTR + "=\"" + name + "\"]"
    ));
  }

  function syncBackdrop() {
    const anyOpen = !!document.querySelector("." + DRAWER_OPEN_CLASS);
    const backdrop = document.querySelector("[" + DRAWER_BACKDROP_ATTR + "]");
    const showBackdrop = anyOpen && isSmallDrawerViewport();

    if (backdrop) {
      if (showBackdrop) {
        backdrop.removeAttribute("hidden");
        backdrop.setAttribute("aria-hidden", "false");
      } else {
        backdrop.setAttribute("hidden", "");
        backdrop.setAttribute("aria-hidden", "true");
      }
    }

    document.documentElement.classList.toggle(MODAL_OPEN_CLASS, showBackdrop);
  }

  function setDrawerOpen(drawer, open) {
    if (!drawer) {
      return;
    }

    const name = drawer.getAttribute(DRAWER_ATTR);

    if (open) {
      [].slice.call(document.querySelectorAll("[" + DRAWER_ATTR + "]")).forEach(function (other) {
        if (other !== drawer) {
          setDrawerOpen(other, false);
        }
      });
    }

    drawer.classList.toggle(DRAWER_OPEN_CLASS, !!open);
    getDrawerToggles(name).forEach(function (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    syncBackdrop();
  }

  function closeArticleDrawers() {
    [].slice.call(document.querySelectorAll("[" + DRAWER_ATTR + "]")).forEach(function (drawer) {
      setDrawerOpen(drawer, false);
    });
    const active = document.activeElement;
    if (active && active.closest && active.closest("[" + DRAWER_ATTR + "]") && typeof active.blur === "function") {
      active.blur();
    }
    syncBackdrop();
  }

  function initArticleDrawers() {
    const root = getArticleDrawersRoot();
    if (!root || root.dataset.wikiArticleDrawersReady === "1") {
      return;
    }
    root.dataset.wikiArticleDrawersReady = "1";

    root.addEventListener("click", function onDrawerClick(ev) {
      const toggle = ev.target && ev.target.closest
        ? ev.target.closest("[" + DRAWER_TOGGLE_ATTR + "]")
        : null;
      const close = ev.target && ev.target.closest
        ? ev.target.closest("[" + DRAWER_CLOSE_ATTR + "]")
        : null;
      const backdrop = ev.target && ev.target.closest
        ? ev.target.closest("[" + DRAWER_BACKDROP_ATTR + "]")
        : null;
      const drawerLink = ev.target && ev.target.closest
        ? ev.target.closest("[" + DRAWER_ATTR + "] a")
        : null;

      if (toggle && root.contains(toggle)) {
        const drawer = getDrawer(getDrawerTarget(toggle));
        if (drawer) {
          ev.preventDefault();
          setDrawerOpen(drawer, !drawer.classList.contains(DRAWER_OPEN_CLASS));
        }
        return;
      }

      if ((close && root.contains(close)) || backdrop) {
        ev.preventDefault();
        closeArticleDrawers();
        return;
      }

      if (drawerLink && isSmallDrawerViewport()) {
        closeArticleDrawers();
      }
    });

    if (!drawersGlobalBound) {
      drawersGlobalBound = true;
      document.addEventListener("keydown", function onDrawerKeydown(ev) {
        if (ev.key === "Escape") {
          closeArticleDrawers();
        }
      });
      window.addEventListener("resize", syncBackdrop);
    }

    syncBackdrop();
  }

  function collapseTocOnSmallScreens() {
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    const toc = document.querySelector(
      ".wiki-article-toc--sidebar, .wiki-article-toc--inline"
    );
    const d = toc && toc.querySelector("details");
    if (d) {
      d.open = false;
    }
  }

  function run() {
    const article = document.querySelector(ROOT_ARTICLE);
    if (!article) {
      return;
    }

    const contentRoot = article.querySelector(BODY);
    if (!contentRoot) {
      return;
    }

    const rawAll = [].slice.call(contentRoot.querySelectorAll(HEADING_SEL));
    const truncated = rawAll.length > MAX_TOC_HEADINGS;
    const raw = truncated ? rawAll.slice(0, MAX_TOC_HEADINGS) : rawAll;

    const drawersRoot = getArticleDrawersRoot();
    const mount = drawersRoot ?
      drawersRoot.querySelector("[" + ATTR_MOUNT + "]") :
      document.querySelector("[" + ATTR_MOUNT + "]");
    const wrap = drawersRoot ?
      drawersRoot.querySelector("[" + ATTR_ROOT + "]") :
      document.querySelector("[" + ATTR_ROOT + "]");

    raw.forEach((h) => h.classList.remove("wiki-article-toc__heading"));

    if (!mount || !raw.length) {
      if (wrap) {
        setDrawerOpen(wrap, false);
        wrap.setAttribute("hidden", "");
        wrap.setAttribute("aria-hidden", "true");
      }
      if (mount) {
        mount.innerHTML = "";
      }
      return;
    }

    ensureHeadingIds(raw);
    scrollToCurrentHash();
    const list = buildNestedList(raw);
    mount.innerHTML = "";
    if (truncated) {
      const note = document.createElement("p");
      note.className = "wiki-article-toc__truncated-note small text-muted mb-2";
      note.setAttribute("role", "status");
      note.textContent =
        "Showing the first " +
        MAX_TOC_HEADINGS +
        " headings in this table of contents. The article has more headings.";
      mount.appendChild(note);
    }
    if (list) {
      mount.appendChild(list);
    }
    if (wrap) {
      wrap.removeAttribute("hidden");
      wrap.setAttribute("aria-hidden", "false");
    }
    bindTocSmoothScroll(mount);
    collapseTocOnSmallScreens();
    syncBackdrop();
  }

  function scheduleBindAjaxify() {
    var n = 0;
    var maxTries = 200;
    function tryBind() {
      var jQuery = window.jQuery;
      if (jQuery && jQuery.fn) {
        try {
          jQuery(window).on("action:ajaxify.end", function () {
            setTimeout(function () {
              try {
                run();
                initArticleDrawers();
              } catch (eRun) {
                if (console && console.error) {
                  console.error("wiki-article-toc:run", eRun);
                }
              }
            }, 0);
          });
        } catch (e) {
          if (console && console.error) {
            console.error("wiki-article-toc:bind", e);
          }
        }
        return;
      }
      if (n < maxTries) {
        n += 1;
        setTimeout(tryBind, 25);
      }
    }
    tryBind();
  }

  function start() {
    try {
      run();
      initArticleDrawers();
    } catch (e) {
      if (console && console.error) {
        console.error("wiki-article-toc:init", e);
      }
    }
    scheduleBindAjaxify();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}());
