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

  function csrfToken() {
    return String((window.config && window.config.csrf_token) || "");
  }

  function apiBase() {
    return `${relativePath()}/api/v3/plugins/westgate-wiki/revisions`;
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

  function removeDangerousPreviewMarkup(fragment) {
    fragment.querySelectorAll("script, iframe, object, embed, base, link, meta").forEach(function (node) {
      node.remove();
    });
    fragment.querySelectorAll("*").forEach(function (node) {
      Array.from(node.attributes).forEach(function (attr) {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || "").trim().toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || value.startsWith("javascript:")) {
          node.removeAttribute(attr.name);
        }
      });
    });
  }

  function renderPreview(previewMount, source) {
    const template = document.createElement("template");
    template.innerHTML = String(source || "");
    removeDangerousPreviewMarkup(template.content);
    previewMount.textContent = "";
    previewMount.appendChild(template.content.cloneNode(true));
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
      renderPreview(previewMount, detail.source || "");

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

  function getOptionalLockToken(root) {
    const source = root.querySelector("[data-wiki-edit-lock-token]");
    return String(
      (source && source.getAttribute("data-wiki-edit-lock-token")) ||
      root.getAttribute("data-wiki-edit-lock-token") ||
      ""
    );
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
    const body = {};
    const wikiEditLockToken = getOptionalLockToken(root);
    if (wikiEditLockToken) {
      body.wikiEditLockToken = wikiEditLockToken;
    }

    if (restoreButton) {
      restoreButton.disabled = true;
    }
    setStatus(root, "Restoring revision...", "muted");

    try {
      const payload = await fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(revision.revisionId)}/restore`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken()
        },
        body: JSON.stringify(body)
      });
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
      setStatus(root, (err && err.message) || String(err), "error");
      if (restoreButton) {
        restoreButton.disabled = false;
      }
    }
  }

  function initHistory(root) {
    if (!root || initialized.has(root)) {
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

    if (state.revisions.length) {
      loadRevision(root, state, state.revisions[0]);
    }
  }

  function scan(context) {
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
