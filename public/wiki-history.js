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

  function renderPreview(previewMount, previewHtml) {
    previewMount.innerHTML = String(previewHtml || "");
  }

  function renderDiff(diffMount, diff) {
    diffMount.textContent = String(diff || "");
  }

  function getDiffBaseRevision(state, revision) {
    if (revision.parentRevisionId) {
      return state.revisions.find(function (row) {
        return row.revisionId === revision.parentRevisionId;
      }) || null;
    }
    return state.revisions[revision.index + 1] || null;
  }

  async function loadRevision(root, state, revision) {
    if (!revision || !revision.revisionId || state.loadingRevisionId === revision.revisionId) {
      return;
    }

    const diffMount = root.querySelector("[data-wiki-history-diff]");
    const previewMount = root.querySelector("[data-wiki-history-preview]");
    if (!diffMount || !previewMount) {
      return;
    }

    state.loadingRevisionId = revision.revisionId;
    state.requestId += 1;
    const requestId = state.requestId;
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
    renderDiff(diffMount, "Loading diff...");
    previewMount.textContent = "Loading preview...";

    try {
      const detail = await fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(revision.revisionId)}`);
      if (requestId !== state.requestId) {
        return;
      }
      renderPreview(previewMount, detail.previewHtml || "");

      const baseRevision = getDiffBaseRevision(state, revision);
      if (baseRevision && baseRevision.revisionId) {
        const diff = await fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(baseRevision.revisionId)}/${encodeURIComponent(revision.revisionId)}/diff`);
        if (requestId !== state.requestId) {
          return;
        }
        renderDiff(diffMount, diff.diff || "");
      } else {
        renderDiff(diffMount, "Initial revision. No earlier revision is available for comparison.");
      }

      const action = detail.revision && detail.revision.action ? detail.revision.action : "revision";
      setStatus(root, `Viewing ${action} ${revision.revisionId}`, "muted");
    } catch (err) {
      renderDiff(diffMount, "");
      previewMount.textContent = "";
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
    window.jQuery(window).on("action:ajaxify.end", function () {
      window.setTimeout(init, 0);
    });
  }
}());
