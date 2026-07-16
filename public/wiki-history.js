/* global ajaxify */
"use strict";

(function wikiHistoryClient() {
  if (typeof window === "undefined" || !window.document) {
    return;
  }

  const initialized = new WeakSet();

  function relativePath() {
    return String((window.config && window.config.relative_path) || "").replace(/\/$/, "");
  }

  function currentPathWithoutRelativePath() {
    const pathname = String((window.location && window.location.pathname) || "/") || "/";
    const prefix = relativePath();

    if (prefix && (pathname === prefix || pathname.indexOf(`${prefix}/`) === 0)) {
      return pathname.slice(prefix.length) || "/";
    }

    return pathname;
  }

  function isWikiHistoryRoute() {
    return /^\/wiki\/history\/[1-9]\d*\/?$/.test(currentPathWithoutRelativePath());
  }

  function csrfToken() {
    return String((window.config && window.config.csrf_token) || "");
  }

  function apiBase() {
    return `${relativePath()}/api/v3/plugins/westgate-wiki/revisions`;
  }

  function editLockApiUrl() {
    return `${relativePath()}/api/v3/plugins/westgate-wiki/edit-lock`;
  }

  function hardPurgeApiUrl() {
    return `${relativePath()}/api/v3/plugins/westgate-wiki/page/hard-purge`;
  }

  function responsePayload(body) {
    return body && body.response ? body.response : (body || {});
  }

  async function fetchJson(url, options) {
    const res = await window.fetch(url, {
      credentials: "same-origin",
      ...(options || {})
    });
    const body = await res.json().catch(function () {
      return null;
    });
    if (!res.ok) {
      throw new Error((body && body.status && body.status.message) || res.statusText || "Wiki history request failed");
    }
    return responsePayload(body);
  }

  function setStatus(root, message, level) {
    const status = root.querySelector("[data-wiki-history-status]");
    if (!status) {
      return;
    }
    status.textContent = message || "";
    status.classList.toggle("text-danger", level === "error");
    status.classList.toggle("text-warning", level === "warning");
    status.classList.toggle("text-muted", !level || level === "muted");
  }

  function revisionFromButton(button, index) {
    return {
      button,
      index,
      revisionId: String(button.getAttribute("data-revision-id") || "").trim(),
      parentRevisionId: String(button.getAttribute("data-parent-revision-id") || "").trim()
    };
  }

  function renderServerPreview(previewMount, previewHtml) {
    if (previewMount) {
      previewMount.innerHTML = String(previewHtml || "");
    }
  }

  function renderTextMessage(mount, message) {
    if (mount) {
      mount.textContent = message || "";
    }
  }

  function revisionLabel(revision, fallback) {
    return String(revision && revision.revisionId || fallback || "revision");
  }

  async function fetchRevisionDetail(state, revision) {
    if (!revision || !revision.revisionId) {
      return null;
    }
    const revisionId = revision.revisionId;
    if (!state.detailsByRevisionId[revisionId]) {
      const detailPromise = fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(revisionId)}`).catch(function (err) {
        if (state.detailsByRevisionId[revisionId] === detailPromise) {
          delete state.detailsByRevisionId[revisionId];
        }
        throw err;
      });
      state.detailsByRevisionId[revisionId] = detailPromise;
    }
    return state.detailsByRevisionId[revisionId];
  }

  function clearNode(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function diffLineClass(line, state) {
    if (/^(Index:|={3,})/.test(line)) {
      state.inHunk = false;
      return "wiki-history-diff-line--meta";
    }
    if (/^@@ /.test(line)) {
      state.inHunk = true;
      return "wiki-history-diff-line--meta";
    }
    if (!state.inHunk && /^(--- |\+\+\+ )/.test(line)) {
      return "wiki-history-diff-line--meta";
    }
    if (line.indexOf("-") === 0) {
      return "wiki-history-diff-line--remove";
    }
    if (line.indexOf("+") === 0) {
      return "wiki-history-diff-line--add";
    }
    return "";
  }

  function appendDiffLine(diffMount, line, lineNumber, klass) {
    const row = document.createElement("span");
    row.className = `wiki-history-diff-line${klass ? ` ${klass}` : ""}`;

    const gutter = document.createElement("span");
    gutter.className = "wiki-history-diff-line__gutter";
    gutter.textContent = String(lineNumber);

    const marker = document.createElement("span");
    marker.className = "wiki-history-diff-line__marker";
    marker.textContent = klass === "wiki-history-diff-line--remove" ? "-" : (klass === "wiki-history-diff-line--add" ? "+" : "");

    const content = document.createElement("span");
    content.className = "wiki-history-diff-line__content";
    content.textContent = line;

    row.appendChild(gutter);
    row.appendChild(marker);
    row.appendChild(content);
    diffMount.appendChild(row);
    diffMount.appendChild(document.createTextNode("\n"));
  }

  function renderSourceLines(diffMount, heading, source) {
    if (!diffMount) {
      return;
    }
    clearNode(diffMount);
    const lines = [String(heading || "")].concat(String(source || "").split(/\r?\n/));
    lines.forEach(function (line, index) {
      appendDiffLine(diffMount, line, index + 1, "");
    });
  }

  function isEmptyPatch(lines) {
    return lines.every(function (line) {
      return !line || /^(Index:|={3,}|--- |\+\+\+ )/.test(line);
    });
  }

  function renderDiff(diffMount, diff) {
    if (!diffMount) {
      return;
    }
    clearNode(diffMount);
    const lines = String(diff || "").split(/\r?\n/);
    if (!String(diff || "").trim() || isEmptyPatch(lines)) {
      diffMount.textContent = "No source changes.";
      return;
    }
    const state = { inHunk: false };
    lines.forEach(function (line, index) {
      appendDiffLine(diffMount, line, index + 1, diffLineClass(line, state));
    });
  }

  function getDiffBaseRevision(state, revision) {
    if (revision.parentRevisionId) {
      return state.revisions.find(function (row) {
        return row.revisionId === revision.parentRevisionId;
      }) || null;
    }
    return state.revisions[revision.index + 1] || null;
  }

  function setFullscreenButtonsDisabled(root, disabled) {
    root.querySelectorAll("[data-wiki-history-fullscreen-open]").forEach(function (button) {
      button.disabled = disabled;
    });
  }

  function clearFullscreenBodyLock() {
    document.body.classList.remove("wiki-history-fullscreen-open");
  }

  function clearLoadedDetails(state) {
    state.selectedDetail = null;
    state.baseDetail = null;
  }

  function setActiveTab(root, activeTab) {
    const tabName = activeTab === "source" ? "source" : "rendered";
    root.querySelectorAll("[data-wiki-history-tab]").forEach(function (button) {
      const active = button.getAttribute("data-wiki-history-tab") === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    root.querySelectorAll("[data-wiki-history-tab-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-wiki-history-tab-panel") !== tabName;
    });
  }

  function setFullscreenMode(root, mode) {
    const sourceMode = mode === "source";
    const rendered = root.querySelector("[data-wiki-history-fullscreen-rendered]");
    const source = root.querySelector("[data-wiki-history-fullscreen-source]");
    if (rendered) {
      rendered.hidden = sourceMode;
    }
    if (source) {
      source.hidden = !sourceMode;
    }
    root.querySelectorAll("[data-wiki-history-fullscreen-mode]").forEach(function (button) {
      const active = button.getAttribute("data-wiki-history-fullscreen-mode") === (sourceMode ? "source" : "rendered");
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function focusableElements(container) {
    return Array.from(container.querySelectorAll("a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex=\"-1\"])")).filter(function (element) {
      return !element.hidden && !element.disabled && !element.closest("[hidden]");
    });
  }

  function closeFullscreen(root, state) {
    const overlay = root.querySelector("[data-wiki-history-fullscreen]");
    if (!overlay || overlay.hidden) {
      return;
    }
    overlay.hidden = true;
    clearFullscreenBodyLock();
    const opener = state.fullscreenOpener;
    state.fullscreenOpener = null;
    if (opener && typeof opener.focus === "function") {
      opener.focus();
    }
  }

  function openFullscreen(root, state, mode, opener) {
    if (!state.selectedDetail) {
      return;
    }
    const overlay = root.querySelector("[data-wiki-history-fullscreen]");
    const rendered = root.querySelector("[data-wiki-history-fullscreen-rendered]");
    const source = root.querySelector("[data-wiki-history-fullscreen-source]");
    const meta = root.querySelector("[data-wiki-history-fullscreen-meta]");
    if (!overlay || !rendered || !source) {
      return;
    }
    state.fullscreenOpener = opener || document.activeElement;
    renderServerPreview(rendered, state.selectedDetail.previewHtml || "");
    source.textContent = String(state.selectedDetail.source || "");
    if (meta) {
      meta.textContent = `Viewing ${revisionLabel(state.selectedDetail.revision, state.selectedRevision && state.selectedRevision.revisionId)}`;
    }
    setFullscreenMode(root, mode);
    overlay.hidden = false;
    document.body.classList.add("wiki-history-fullscreen-open");
    const focusables = focusableElements(overlay);
    (focusables[0] || overlay).focus();
  }

  function handleFullscreenKeydown(root, state, event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFullscreen(root, state);
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const overlay = root.querySelector("[data-wiki-history-fullscreen]");
    const focusables = overlay ? focusableElements(overlay) : [];
    if (!focusables.length) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function loadRevision(root, state, revision) {
    if (!revision || !revision.revisionId || state.loadingRevisionId === revision.revisionId) {
      return;
    }

    const beforePreview = root.querySelector("[data-wiki-history-before-preview]");
    const afterPreview = root.querySelector("[data-wiki-history-after-preview]");
    const beforeLabel = root.querySelector("[data-wiki-history-before-label]");
    const afterLabel = root.querySelector("[data-wiki-history-after-label]");
    const diffMount = root.querySelector("[data-wiki-history-diff]");
    if (!beforePreview || !afterPreview || !diffMount) {
      return;
    }

    state.loadingRevisionId = revision.revisionId;
    state.requestId += 1;
    const requestId = state.requestId;
    clearLoadedDetails(state);
    setFullscreenButtonsDisabled(root, true);
    state.selectedRevision = revision;
    state.revisions.forEach(function (row) {
      const active = row.revisionId === revision.revisionId;
      row.button.classList.toggle("active", active);
      row.button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const restoreButton = root.querySelector("[data-wiki-history-restore]");
    if (restoreButton) {
      restoreButton.disabled = !state.canRestore;
      restoreButton.setAttribute("data-revision-id", revision.revisionId);
    }

    setStatus(root, "Loading revision...", "muted");
    renderTextMessage(beforePreview, "Loading previous revision...");
    renderTextMessage(afterPreview, "Loading selected revision...");
    renderDiff(diffMount, "Loading source diff...");

    try {
      const detail = await fetchRevisionDetail(state, revision);
      const baseRevision = getDiffBaseRevision(state, revision);
      const baseDetail = baseRevision && baseRevision.revisionId ? await fetchRevisionDetail(state, baseRevision) : null;
      if (requestId !== state.requestId) {
        return;
      }

      state.selectedDetail = detail || null;
      state.baseDetail = baseDetail || null;

      if (baseDetail) {
        renderServerPreview(beforePreview, baseDetail.previewHtml || "");
        if (beforeLabel) {
          beforeLabel.textContent = revisionLabel(baseDetail.revision, baseRevision.revisionId);
        }
      } else {
        renderTextMessage(beforePreview, "Initial revision. No earlier rendered version is available.");
        if (beforeLabel) {
          beforeLabel.textContent = "No parent revision";
        }
      }

      renderServerPreview(afterPreview, detail.previewHtml || "");
      if (afterLabel) {
        afterLabel.textContent = revisionLabel(detail.revision, revision.revisionId);
      }

      if (baseRevision && baseRevision.revisionId) {
        const diff = await fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(baseRevision.revisionId)}/${encodeURIComponent(revision.revisionId)}/diff`);
        if (requestId !== state.requestId) {
          return;
        }
        renderDiff(diffMount, diff.diff || "");
      } else {
        renderSourceLines(diffMount, "Initial revision source", detail.source || "");
      }

      setFullscreenButtonsDisabled(root, false);

      const action = detail.revision && detail.revision.action ? detail.revision.action : "revision";
      setStatus(root, `Viewing ${action} ${revision.revisionId}`, "muted");
    } catch (err) {
      if (requestId !== state.requestId) {
        return;
      }
      clearLoadedDetails(state);
      clearNode(diffMount);
      renderTextMessage(beforePreview, "");
      renderTextMessage(afterPreview, "");
      setStatus(root, (err && err.message) || String(err), "error");
    } finally {
      if (requestId === state.requestId) {
        state.loadingRevisionId = "";
      }
    }
  }

  async function acquireEditLock(tid) {
    const lock = await fetchJson(editLockApiUrl(), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken()
      },
      body: JSON.stringify({ tid })
    });
    if (!lock || !lock.token) {
      throw new Error("Wiki edit lock could not be acquired.");
    }
    return lock;
  }

  async function releaseEditLock(tid, lock) {
    if (!lock || !lock.token) {
      return;
    }
    try {
      await fetchJson(editLockApiUrl(), {
        method: "DELETE",
        keepalive: true,
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken()
        },
        body: JSON.stringify({
          tid,
          token: lock.token
        })
      });
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("westgate-wiki: history restore edit lock release failed", err);
      }
    }
  }

  async function restoreSelectedRevision(root, state) {
    const revision = state.selectedRevision;
    if (!revision || !revision.revisionId || !state.canRestore) {
      return;
    }
    if (!window.confirm("Restore this wiki revision? The current page content will be replaced.")) {
      return;
    }

    const restoreButton = root.querySelector("[data-wiki-history-restore]");
    let lock = null;

    if (restoreButton) {
      restoreButton.disabled = true;
    }
    setStatus(root, "Restoring revision...", "muted");

    try {
      lock = await acquireEditLock(state.tid);
      const payload = await fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(revision.revisionId)}/restore`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken()
        },
        body: JSON.stringify({
          wikiEditLockToken: lock.token
        })
      });
      await releaseEditLock(state.tid, lock);
      lock = null;
      const wikiPath = payload && payload.wikiPath;
      if (wikiPath && typeof ajaxify !== "undefined" && ajaxify && typeof ajaxify.go === "function") {
        ajaxify.go(String(wikiPath).replace(/^\//, ""));
        return;
      }
      if (wikiPath) {
        window.location.href = `${relativePath()}${wikiPath}`;
        return;
      }
      window.location.reload();
    } catch (err) {
      if (lock) {
        await releaseEditLock(state.tid, lock);
      }
      setStatus(root, (err && err.message) || String(err), "error");
      if (restoreButton) {
        restoreButton.disabled = false;
      }
    }
  }

  function goToWikiPath(path) {
    const nextPath = String(path || "/wiki");
    if (typeof ajaxify !== "undefined" && ajaxify && typeof ajaxify.go === "function") {
      ajaxify.go(nextPath.replace(/^\//, ""));
      return;
    }
    window.location.href = `${relativePath()}${nextPath}`;
  }

  async function hardPurgePage(root, state) {
    const button = findHardPurgeButton(root);
    const title = state.pageTitle || "this page";
    const typed = window.prompt(`Type "${title}" to permanently hard purge this tombstoned wiki page.`);
    if (typed === null) {
      return;
    }
    if (typed !== title) {
      setStatus(root, "Hard purge confirmation did not match the page title.", "error");
      return;
    }

    if (button) {
      button.disabled = true;
    }
    setStatus(root, "Hard purging tombstoned page...", "muted");

    try {
      await fetchJson(hardPurgeApiUrl(), {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken()
        },
        body: JSON.stringify({ tid: state.tid })
      });
      goToWikiPath(state.hardPurgeRedirect || "/wiki");
    } catch (err) {
      setStatus(root, (err && err.message) || String(err), "error");
      if (button) {
        button.disabled = false;
      }
    }
  }

  function findHardPurgeButton(root) {
    if (!root || !root.classList || !root.classList.contains("wiki-history-page")) {
      return null;
    }

    return Array.from(root.querySelectorAll(".wiki-history-danger-zone [data-wiki-history-hard-purge]")).find(function (button) {
      return button.closest("[data-wiki-history]") === root;
    }) || null;
  }

  function initHistory(root) {
    if (!isWikiHistoryRoute() || !root || initialized.has(root)) {
      return;
    }
    initialized.add(root);

    const tid = parseInt(root.getAttribute("data-tid"), 10);
    if (!Number.isInteger(tid) || tid <= 0) {
      return;
    }

    const buttons = Array.from(root.querySelectorAll("[data-wiki-history-revision]"));
    const state = {
      tid,
      canRestore: root.getAttribute("data-can-restore") === "1",
      pageTitle: String(root.getAttribute("data-page-title") || "").trim(),
      hardPurgeRedirect: String(root.getAttribute("data-hard-purge-redirect") || "/wiki").trim() || "/wiki",
      loadingRevisionId: "",
      requestId: 0,
      selectedRevision: null,
      selectedDetail: null,
      baseDetail: null,
      fullscreenOpener: null,
      detailsByRevisionId: Object.create(null),
      revisions: buttons.map(revisionFromButton).filter(function (row) {
        return !!row.revisionId;
      })
    };

    state.revisions.forEach(function (revision) {
      revision.button.addEventListener("click", function () {
        loadRevision(root, state, revision);
      });
    });

    const restoreButton = root.querySelector("[data-wiki-history-restore]");
    if (restoreButton) {
      restoreButton.addEventListener("click", function () {
        restoreSelectedRevision(root, state);
      });
    }

    const hardPurgeButton = findHardPurgeButton(root);
    if (hardPurgeButton) {
      hardPurgeButton.addEventListener("click", function () {
        hardPurgePage(root, state);
      });
    }

    root.querySelectorAll("[data-wiki-history-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        setActiveTab(root, button.getAttribute("data-wiki-history-tab"));
      });
    });

    root.querySelectorAll("[data-wiki-history-fullscreen-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        openFullscreen(root, state, button.getAttribute("data-wiki-history-fullscreen-open"), button);
      });
    });

    root.querySelectorAll("[data-wiki-history-fullscreen-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        setFullscreenMode(root, button.getAttribute("data-wiki-history-fullscreen-mode"));
      });
    });

    root.querySelectorAll("[data-wiki-history-fullscreen-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeFullscreen(root, state);
      });
    });

    const fullscreen = root.querySelector("[data-wiki-history-fullscreen]");
    if (fullscreen) {
      fullscreen.addEventListener("keydown", function (event) {
        handleFullscreenKeydown(root, state, event);
      });
    }

    if (state.revisions.length) {
      loadRevision(root, state, state.revisions[0]);
    }
  }

  function scan(context) {
    if (!isWikiHistoryRoute()) {
      return;
    }

    (context || document).querySelectorAll("[data-wiki-history]").forEach(initHistory);
  }

  function init() {
    scan(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if (typeof window.jQuery !== "undefined" && window.jQuery.fn) {
    window.jQuery(window).on("action:ajaxify.start", clearFullscreenBodyLock);
    window.jQuery(window).on("action:ajaxify.end", function () {
      clearFullscreenBodyLock();
      window.setTimeout(init, 0);
    });
  }

  window.addEventListener("pagehide", clearFullscreenBodyLock);
}());
