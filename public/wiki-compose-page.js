/* global WestgateWikiEditor, ajaxify */
"use strict";

/** Must match `MAX_WIKI_MAIN_BODY_UTF8_BYTES` in lib/wiki-page-validation.js */
const MAX_WIKI_MAIN_BODY_UTF8_BYTES = 512 * 1024;
const WIKI_COMPOSE_BLOCKING_SAVE_STATUSES = new Set([
  "namespace-collision",
  "namespace-page-collision",
  "page-collision",
  "reserved-path-segment"
]);

function utf8ByteLength(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  return unescape(encodeURIComponent(str)).length;
}

function decodePayloadB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder("utf-8").decode(bytes));
}

function setStatus(el, text) {
  if (el) {
    el.textContent = text || "";
    el.classList.remove("text-muted", "text-warning", "text-danger");
    if (!text) {
      el.classList.add("text-muted");
      return;
    }
    const level = arguments.length > 2 && arguments[2] ? arguments[2] : "muted";
    if (level === "warning") {
      el.classList.add("text-warning");
    } else if (level === "error") {
      el.classList.add("text-danger");
    } else {
      el.classList.add("text-muted");
    }
  }
}

function getApiResponseMessage(body, fallback) {
  return (
    (body && body.response && body.response.message) ||
    (body && body.status && body.status.message) ||
    fallback ||
    "Unexpected API response"
  );
}

function getBlockingWikiResponse(body) {
  const response = body && body.response;
  if (!response || response.ok !== false) {
    return null;
  }

  const status = String(response.status || "");
  return WIKI_COMPOSE_BLOCKING_SAVE_STATUSES.has(status) ? response : null;
}

function createBlockingWikiError(response, fallback) {
  const err = new Error((response && response.message) || fallback || "This page cannot be saved.");
  err.wikiComposeBlockingResponse = response || {};
  return err;
}

function getRelativeWikiHref(relativePath, wikiPath) {
  const path = String(wikiPath || "");
  if (!path) {
    return "";
  }
  const prefix = String(relativePath || "").replace(/\/$/, "");
  return `${prefix}${path.charAt(0) === "/" ? path : `/${path}`}`;
}

function normalizeWikiCreateCanonicalSegment(value) {
  const transliterations = {
    "æ": "ae",
    "œ": "oe",
    "ø": "o",
    "ß": "ss",
    "þ": "th",
    "ð": "d",
    "đ": "d",
    "ł": "l",
    "ħ": "h",
    "ı": "i",
    "ŋ": "n",
    "ŧ": "t"
  };
  let canonical = "";
  let lastSeparator = false;

  Array.from(String(value || "").trim().normalize("NFKD")).forEach(function (char) {
    const transliterated = transliterations[char.toLocaleLowerCase("en-US")];
    if (/^[A-Za-z0-9]$/.test(char)) {
      canonical += char;
      lastSeparator = false;
    } else if (char === "_") {
      if (canonical && !lastSeparator) {
        canonical += "_";
        lastSeparator = true;
      }
    } else if (/^\p{Mark}$/u.test(char) || /['"`´‘’‚‛“”„‟‹›«»′″＇＂]/.test(char)) {
      return;
    } else if (transliterated) {
      canonical += char === char.toLocaleUpperCase("en-US") ?
        transliterated.charAt(0).toLocaleUpperCase("en-US") + transliterated.slice(1) :
        transliterated;
      lastSeparator = false;
    } else if (canonical && !lastSeparator) {
      canonical += "_";
      lastSeparator = true;
    }
  });

  return canonical.replace(/^_+|_+$/g, "");
}

function normalizeWikiCreateCanonicalTitlePath(value) {
  return String(value || "")
    .split(/\s*::\s*/g)
    .map(normalizeWikiCreateCanonicalSegment)
    .filter(Boolean)
    .join("/");
}

function showComposeErrorModal(options) {
  const details = options || {};
  const existing = document.querySelector(".wiki-compose-error-dialog-shell");
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const restoreFocusTarget = details.restoreFocus || document.activeElement;
  const shell = document.createElement("div");
  shell.className = "wiki-compose-error-dialog-shell";

  const dialog = document.createElement("div");
  dialog.className = "wiki-compose-error-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "wiki-compose-error-dialog-title");
  dialog.setAttribute("aria-describedby", "wiki-compose-error-dialog-message");

  const title = document.createElement("h2");
  title.id = "wiki-compose-error-dialog-title";
  title.className = "wiki-compose-error-dialog__title";
  title.textContent = details.title || "Page cannot be saved";

  const message = document.createElement("p");
  message.id = "wiki-compose-error-dialog-message";
  message.className = "wiki-compose-error-dialog__message";
  message.textContent = details.message || "Resolve the page title or URL conflict before saving.";

  const actions = document.createElement("div");
  actions.className = "wiki-compose-error-dialog__actions";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "btn btn-primary";
  closeButton.textContent = "Close";

  dialog.appendChild(title);
  dialog.appendChild(message);

  if (details.wikiPath) {
    const pathNote = document.createElement("p");
    pathNote.className = "wiki-compose-error-dialog__path";
    pathNote.appendChild(document.createTextNode("Conflicting path: "));

    const pathLink = document.createElement("a");
    pathLink.href = getRelativeWikiHref(details.relativePath, details.wikiPath);
    pathLink.textContent = details.wikiPath;
    pathNote.appendChild(pathLink);
    dialog.appendChild(pathNote);
  }

  actions.appendChild(closeButton);
  dialog.appendChild(actions);
  shell.appendChild(dialog);

  let closed = false;
  function closeDialog() {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener("keydown", handleKeydown);
    if (shell.parentNode) {
      shell.parentNode.removeChild(shell);
    }
    if (restoreFocusTarget && typeof restoreFocusTarget.focus === "function") {
      restoreFocusTarget.focus();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
    }
  }

  closeButton.addEventListener("click", closeDialog);
  shell.addEventListener("click", function (event) {
    if (event.target === shell) {
      closeDialog();
    }
  });
  document.addEventListener("keydown", handleKeydown);
  document.body.appendChild(shell);
  closeButton.focus();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightCssSource(source) {
  return escapeHtml(source)
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="wiki-compose-css-token wiki-compose-css-token--comment">$1</span>')
    .replace(/(@[a-z-]+)/gi, '<span class="wiki-compose-css-token wiki-compose-css-token--at">$1</span>')
    .replace(/([#.][a-z0-9_-]+)/gi, '<span class="wiki-compose-css-token wiki-compose-css-token--selector">$1</span>')
    .replace(/([a-z-]+)(\s*:)/gi, '<span class="wiki-compose-css-token wiki-compose-css-token--property">$1</span>$2')
    .replace(/(:\s*)([^;{}\n]+)/g, '$1<span class="wiki-compose-css-token wiki-compose-css-token--value">$2</span>');
}

function syncCssLineNumbers(textarea, linesEl, highlightEl) {
  if (!textarea) {
    return;
  }
  const lineCount = Math.max(1, String(textarea.value || "").split("\n").length);
  if (linesEl) {
    const rows = [];
    for (let i = 1; i <= lineCount; i += 1) {
      rows.push(String(i));
    }
    linesEl.textContent = rows.join("\n");
    linesEl.scrollTop = textarea.scrollTop;
  }
  if (highlightEl) {
    highlightEl.innerHTML = highlightCssSource(textarea.value);
    highlightEl.scrollTop = textarea.scrollTop;
    highlightEl.scrollLeft = textarea.scrollLeft;
  }
}

function waitForEditorGlobal(attempts) {
  const max = attempts || 80;

  return new Promise(function (resolve, reject) {
    let n = 0;
    (function tick() {
      const candidate = window.WestgateWikiEditor;
      if (candidate && typeof candidate.createWikiEditor === "function") {
        resolve(candidate);
        return;
      }
      n += 1;
      if (n >= max) {
        reject(new Error("Tiptap editor bundle failed to load."));
        return;
      }
      setTimeout(tick, 50);
    })();
  });
}

async function createEditorHandle(editorEl, payload, initialData) {
  const bundle = await waitForEditorGlobal();
  return await bundle.createWikiEditor(editorEl, {
    relativePath: payload.relativePath,
    csrfToken: payload.csrfToken,
    initialData: initialData,
    onChange: payload.onChange
  });
}

async function initWikiComposePage() {
  const root = document.getElementById("westgate-wiki-compose");
  const dataEl = document.getElementById("westgate-wiki-compose-data");

  if (!root || !dataEl) {
    return;
  }

  if (root.getAttribute("data-wiki-compose-ready") === "1") {
    return;
  }
  root.setAttribute("data-wiki-compose-ready", "1");

  const b64 = dataEl.getAttribute("data-payload-b64");
  if (!b64) {
    return;
  }

  let payload;
  try {
    payload = decodePayloadB64(b64);
  } catch (err) {
    setStatus(document.getElementById("wiki-compose-status"), "Invalid page data.");
    return;
  }

  const titleInput = document.getElementById("wiki-compose-title");
  const editorEl = document.getElementById("wiki-compose-editor");
  const importTa = document.getElementById("wiki-compose-import-md");
  const importBtn = document.getElementById("wiki-compose-import-btn");
  const submitBtn = document.getElementById("wiki-compose-submit");
  const statusEl = document.getElementById("wiki-compose-status");
  const linkSearch = document.getElementById("wiki-compose-link-search");
  const linkSearchBtn = document.getElementById("wiki-compose-link-search-btn");
  const linkPick = document.getElementById("wiki-compose-link-pick");
  const linkInsert = document.getElementById("wiki-compose-link-insert");
  const returnLink = document.getElementById("wiki-compose-return");
  const discussionDisabledCheckbox = document.getElementById("wiki-compose-discussion-disabled");
  const cssButton = document.getElementById("wiki-compose-css-btn");
  const cssDialog = document.getElementById("wiki-compose-css-dialog");
  const cssInput = document.getElementById("wiki-compose-css-input");
  const cssLines = document.getElementById("wiki-compose-css-lines");
  const cssHighlight = document.getElementById("wiki-compose-css-highlight");

  let editorInstance = null;
  let articleCss = String(payload.initialArticleCss || "");
  let destroyStarted = false;
  let hasUnsavedChanges = false;
  let editLockRefreshTimer = null;
  let editLockReleased = false;

  function markUnsaved() {
    hasUnsavedChanges = true;
  }

  function markSaved(path) {
    hasUnsavedChanges = false;
    if (path) {
      if (returnLink) {
        returnLink.setAttribute("href", `${payload.relativePath || ""}${path}`);
      }
    }
  }

  function syncCssEditor() {
    syncCssLineNumbers(cssInput, cssLines, cssHighlight);
  }

  if (cssInput) {
    cssInput.value = articleCss;
    cssInput.addEventListener("input", function () {
      articleCss = cssInput.value;
      syncCssEditor();
      markUnsaved();
    });
    cssInput.addEventListener("scroll", syncCssEditor);
    syncCssEditor();
  }

  if (cssButton && cssDialog && cssInput) {
    cssButton.addEventListener("click", function () {
      if (typeof cssDialog.showModal === "function") {
        cssDialog.showModal();
      } else {
        cssDialog.setAttribute("open", "open");
      }
      syncCssEditor();
      cssInput.focus();
    });
  }

  async function destroyWikiEditor() {
    if (destroyStarted) {
      return;
    }

    const editor = editorInstance;
    editorInstance = null;
    destroyStarted = true;

    try {
      stopEditLockHeartbeat();
      if (editor && typeof editor.destroy === "function") {
        await editor.destroy();
      }
      await releaseEditLock();
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("westgate-wiki: editor cleanup failed", err);
      }
    } finally {
      destroyStarted = false;
    }
  }

  function hasEditLock() {
    return payload.mode === "edit" && payload.editLockUrl && payload.editLockToken && payload.tid;
  }

  function stopEditLockHeartbeat() {
    if (editLockRefreshTimer) {
      clearInterval(editLockRefreshTimer);
      editLockRefreshTimer = null;
    }
  }

  async function sendEditLockRequest(method) {
    if (!hasEditLock() || editLockReleased) {
      return null;
    }

    const res = await fetch(payload.editLockUrl, {
      method: method,
      credentials: "same-origin",
      keepalive: method === "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": payload.csrfToken
      },
      body: JSON.stringify({
        tid: parseInt(payload.tid, 10),
        token: payload.editLockToken
      })
    });
    let body = null;
    try {
      body = await res.json();
    } catch (err) {
      body = null;
    }
    if (!res.ok) {
      const msg = (body && body.status && body.status.message) ||
        (body && body.response && body.response.message) ||
        res.statusText;
      throw new Error(msg);
    }
    return body;
  }

  async function refreshEditLock() {
    try {
      await sendEditLockRequest("PUT");
    } catch (err) {
      stopEditLockHeartbeat();
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      setStatus(statusEl, (err && err.message) || "This wiki edit lock could not be renewed. Reopen the editor before saving.", "error");
    }
  }

  async function releaseEditLock() {
    if (!hasEditLock() || editLockReleased) {
      return;
    }
    try {
      await sendEditLockRequest("DELETE");
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("westgate-wiki: edit lock release failed", err);
      }
    } finally {
      editLockReleased = true;
    }
  }

  function startEditLockHeartbeat() {
    if (!hasEditLock() || editLockRefreshTimer) {
      return;
    }
    const ttlMs = parseInt(payload.editLockTtlMs, 10) || 120000;
    const intervalMs = Math.max(15000, Math.floor(ttlMs / 2));
    editLockRefreshTimer = setInterval(refreshEditLock, intervalMs);
  }

  async function leaveComposePage(path) {
    await destroyWikiEditor();

    if (typeof ajaxify !== "undefined" && ajaxify.go) {
      ajaxify.go(path.replace(/^\//, ""));
    } else {
      window.location.href = `${payload.relativePath || ""}${path}`;
    }
  }

  function attachLifecycleCleanup() {
    window.westgateWikiDestroyComposeEditor = destroyWikiEditor;

    if (typeof require === "function" && !window.westgateWikiComposeAjaxCleanupAttached) {
      window.westgateWikiComposeAjaxCleanupAttached = true;
      require(["hooks"], function (hooks) {
        hooks.on("action:ajaxify.start", function () {
          if (window.westgateWikiDestroyComposeEditor) {
            window.westgateWikiDestroyComposeEditor();
          }
        });
      });
    }

    window.addEventListener("pagehide", function () {
      destroyWikiEditor();
    }, { once: true });

    if (returnLink) {
      returnLink.addEventListener("click", async function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const href = returnLink.getAttribute("href") || "";

        if (!href) {
          return;
        }

        if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Return to the article anyway?")) {
          return;
        }
        await destroyWikiEditor();

        if (typeof ajaxify !== "undefined" && ajaxify.go) {
          const url = new URL(href, window.location.origin);
          const rel = (payload.relativePath || "").replace(/\/$/, "");
          const route = url.pathname.startsWith(rel) ? url.pathname.slice(rel.length) : url.pathname;
          ajaxify.go(route.replace(/^\//, ""));
        } else {
          window.location.href = href;
        }
      });
    }
  }

  async function initializeEditor() {
    const initialData = payload.mode === "edit" && typeof payload.initialContent === "string"
      ? payload.initialContent
      : "";
    const tiptapBundle = window.WestgateWikiEditor;
    const tiptapFallbackReason =
      tiptapBundle &&
      typeof tiptapBundle.detectUnsupportedContent === "function"
        ? tiptapBundle.detectUnsupportedContent(initialData)
        : "";
    const tiptapNormalizationNotice =
      tiptapBundle &&
      typeof tiptapBundle.getNormalizationNotice === "function"
        ? tiptapBundle.getNormalizationNotice(initialData)
        : "";

    if (tiptapFallbackReason) {
      throw new Error(`This article contains unsupported legacy HTML for the Tiptap editor: ${tiptapFallbackReason}`);
    }

    const editorPayload = Object.assign({}, payload, { onChange: markUnsaved });
    editorInstance = await createEditorHandle(editorEl, editorPayload, initialData);
    setStatus(statusEl, tiptapNormalizationNotice, tiptapNormalizationNotice ? "warning" : "muted");
  }

  attachLifecycleCleanup();

  try {
    await initializeEditor();
    startEditLockHeartbeat();
  } catch (err) {
    setStatus(statusEl, (err && err.message) || String(err), "error");
    await releaseEditLock();
    return;
  }

  if (importBtn && importTa) {
    importBtn.addEventListener("click", function () {
      const md = (importTa.value || "").trim();
      if (!md) {
        return;
      }
      try {
        editorInstance.setMarkdown(md);
        importTa.value = "";
        markUnsaved();
        setStatus(statusEl, "");
      } catch (err) {
        setStatus(statusEl, (err && err.message) || String(err), "error");
      }
    });
  }

  async function runLinkSearch() {
    const q = (linkSearch && linkSearch.value) || "";
    linkPick.innerHTML = "";
    try {
      const params = new URLSearchParams({
        q: q,
        context: "wiki",
        cid: String(payload.cid),
        scope: "current-namespace",
        type: "page",
        limit: "25"
      });
      const url = payload.linkAutocompleteUrl ?
        `${payload.linkAutocompleteUrl}?${params.toString()}` :
        `${payload.namespaceSearchUrl}?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { credentials: "same-origin" });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body && body.status && body.status.message ? body.status.message : res.statusText);
      }
      const topics = payload.linkAutocompleteUrl ?
        ((body.response && body.response.results) || []).filter(function (r) { return r.type === "page"; }) :
        ((body.response && body.response.topics) || []);
      topics.forEach(function (t) {
        const opt = document.createElement("option");
        opt.value = t.insertText || `[[${t.titleLeaf || t.title}]]`;
        opt.textContent = t.titleLeaf || t.title;
        linkPick.appendChild(opt);
      });
    } catch (err) {
      setStatus(statusEl, (err && err.message) || String(err), "error");
    }
  }

  if (linkSearchBtn) {
    linkSearchBtn.addEventListener("click", runLinkSearch);
  }

  if (linkInsert) {
    linkInsert.addEventListener("click", function () {
      const opt = linkPick.selectedOptions && linkPick.selectedOptions[0];
      const label = opt ? opt.value.trim() : "";
      if (!label) {
        return;
      }
      editorInstance.insertWikiLink(label);
      markUnsaved();
      editorInstance.focus();
    });
  }

  [titleInput, discussionDisabledCheckbox].forEach(function (input) {
    if (input) {
      input.addEventListener("input", markUnsaved);
      input.addEventListener("change", markUnsaved);
    }
  });

  if (submitBtn) {
    submitBtn.addEventListener("click", async function () {
      const title = (titleInput && titleInput.value.trim()) || "";
      if (!title) {
        setStatus(statusEl, "Title is required.", "error");
        return;
      }

      const content = (editorInstance.getHTML() || "").trim();
      if (!content) {
        setStatus(statusEl, "Body cannot be empty.", "error");
        return;
      }

      if (typeof editorInstance.hasPendingUploads === "function" && editorInstance.hasPendingUploads()) {
        setStatus(statusEl, "Wait for image uploads to finish before saving.", "warning");
        return;
      }

      const bodyBytes = utf8ByteLength(content);
      if (bodyBytes > MAX_WIKI_MAIN_BODY_UTF8_BYTES) {
        setStatus(
          statusEl,
          "Article body is too large (max " +
            Math.round(MAX_WIKI_MAIN_BODY_UTF8_BYTES / 1024) +
            " KiB UTF-8). Shorten the content before submitting."
          ,
          "error"
        );
        return;
      }

      submitBtn.disabled = true;
      const isEdit = payload.mode === "edit" && payload.postEditUrl;
      let createSucceeded = false;
      setStatus(statusEl, isEdit ? "Saving…" : "Publishing…");

      try {
        let res;
        let body;

        if (payload.pageTitleCheckUrl) {
          const params = new URLSearchParams({
            cid: String(payload.cid),
            title: title
          });
          if (payload.mode === "edit" && payload.tid) {
            params.set("tid", String(payload.tid));
          }
          const checkRes = await fetch(`${payload.pageTitleCheckUrl}?${params.toString()}`, {
            credentials: "same-origin",
            cache: "no-store"
          });
          let checkBody = null;
          try {
            checkBody = await checkRes.json();
          } catch (err) {
            checkBody = null;
          }
          const blockingTitleResponse = getBlockingWikiResponse(checkBody);
          if (blockingTitleResponse) {
            throw createBlockingWikiError(blockingTitleResponse, "This title cannot be published at a clean wiki URL.");
          }
          if (!checkRes.ok) {
            const msg = getApiResponseMessage(checkBody, checkRes.statusText);
            throw new Error(msg);
          }
          if (checkBody && checkBody.response && checkBody.response.ok === false) {
            throw new Error(getApiResponseMessage(checkBody, "This title cannot be published at a clean wiki URL."));
          }
        }

        if (isEdit && payload.wikiPageSaveApiUrl) {
          const saveForm = new FormData();
          saveForm.set("tid", String(payload.tid || ""));
          saveForm.set("pid", String(payload.mainPid || ""));
          saveForm.set("content", content);
          saveForm.set("title", title);
          saveForm.set("wikiEditLockToken", payload.editLockToken || "");
          res = await fetch(payload.wikiPageSaveApiUrl, {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "x-csrf-token": payload.csrfToken
            },
            body: saveForm
          });
          body = await res.json();
        } else if (isEdit) {
          const postEditUrl = new URL(payload.postEditUrl, window.location.origin);
          postEditUrl.searchParams.set("wikiEditLockToken", payload.editLockToken || "");
          res = await fetch(postEditUrl.toString(), {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": payload.csrfToken
            },
            body: JSON.stringify({
              content: content,
              sourceContent: content,
              title: title,
              wikiEditLockToken: payload.editLockToken
            })
          });
          body = await res.json();
        } else {
          res = await fetch(payload.topicsApiUrl, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": payload.csrfToken
            },
            body: JSON.stringify({
              cid: payload.cid,
              title: title,
              content: content,
              sourceContent: content,
              tags: []
            })
          });
          body = await res.json();
        }

        const blockingSaveResponse = getBlockingWikiResponse(body);
        if (blockingSaveResponse) {
          throw createBlockingWikiError(blockingSaveResponse, "This page cannot be saved.");
        }

        if (!res.ok) {
          const msg = getApiResponseMessage(body, res.statusText);
          throw new Error(msg);
        }

        const responsePayload = body.response;
        if (responsePayload && responsePayload.ok === false) {
          throw new Error(getApiResponseMessage(body, "This page cannot be saved."));
        }
        createSucceeded = !isEdit;
        let wikiSlug = null;
        const savedTid = (
          responsePayload &&
          (responsePayload.tid || (responsePayload.topic && responsePayload.topic.tid))
        ) || payload.tid;

        if (isEdit && responsePayload && responsePayload.topic && responsePayload.topic.slug) {
          wikiSlug = responsePayload.topic.slug;
        } else if (!isEdit && responsePayload && responsePayload.slug) {
          wikiSlug = responsePayload.slug;
        }

        if (payload.articleCssApiUrl && savedTid) {
          const cssRes = await fetch(payload.articleCssApiUrl, {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": payload.csrfToken
            },
            body: JSON.stringify({
              tid: parseInt(savedTid, 10),
              css: articleCss
            })
          });
          if (!cssRes.ok) {
            let cssJson = null;
            try {
              cssJson = await cssRes.json();
            } catch (e) {
              cssJson = null;
            }
            const cssMsg = (cssJson && cssJson.status && cssJson.status.message) || cssRes.statusText;
            throw new Error("Page saved, but article CSS was not updated: " + cssMsg);
          }
          const cssJson = await cssRes.json();
          articleCss = String((cssJson && cssJson.response && cssJson.response.articleCss) || articleCss || "");
          if (cssInput) {
            cssInput.value = articleCss;
            syncCssEditor();
          }
        }

        if (
          isEdit &&
          payload.discussionSettingsApiUrl &&
          discussionDisabledCheckbox &&
          savedTid
        ) {
          const discussionRes = await fetch(payload.discussionSettingsApiUrl, {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": payload.csrfToken
            },
            body: JSON.stringify({
              tid: parseInt(savedTid, 10),
              disabled: discussionDisabledCheckbox.checked
            })
          });
          if (!discussionRes.ok) {
            let discussionJson = null;
            try {
              discussionJson = await discussionRes.json();
            } catch (e) {
              discussionJson = null;
            }
            const discussionMsg = (discussionJson && discussionJson.status && discussionJson.status.message) || discussionRes.statusText;
            throw new Error("Page saved, but the discussion setting was not updated: " + discussionMsg);
          }
        }

        let homepageSetOk = false;
        if (!isEdit && payload.setAsWikiHome && payload.wikiHomepageApiUrl) {
          const tidVal = savedTid;
          if (tidVal) {
            const putRes = await fetch(payload.wikiHomepageApiUrl, {
              method: "PUT",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": payload.csrfToken
              },
              body: JSON.stringify({ tid: parseInt(tidVal, 10) })
            });
            if (putRes.ok) {
              homepageSetOk = true;
            } else {
              let putJson = null;
              try {
                putJson = await putRes.json();
              } catch (e) {
                putJson = null;
              }
              const putMsg = (putJson && putJson.status && putJson.status.message) || putRes.statusText;
              setStatus(
                statusEl,
                "Page published, but /wiki was not set as the homepage: " + putMsg + " You can set the topic id in the ACP."
                ,
                "warning"
              );
            }
          }
        }

        const canonicalTitlePath = normalizeWikiCreateCanonicalTitlePath(title);
        const slugLeaf = wikiSlug ? String(wikiSlug).split("/").filter(Boolean).pop() : "";
        const cleanWikiPath = responsePayload && responsePayload.wikiPath
          ? responsePayload.wikiPath
          : (payload.sectionWikiPath && (canonicalTitlePath || slugLeaf) ? `${payload.sectionWikiPath}/${canonicalTitlePath || slugLeaf}` : "");

        if (!cleanWikiPath) {
          throw new Error("Unexpected API response");
        }

        markSaved(homepageSetOk ? "/wiki" : cleanWikiPath);
        setStatus(
          statusEl,
          homepageSetOk
            ? "Page published and set as /wiki. Use Return to article when you are ready to leave."
            : "Page saved. Use Return to article when you are ready to leave."
        );
        if (isEdit) {
          submitBtn.disabled = false;
        }
      } catch (err) {
        const message = (err && err.message) || String(err);
        if (err && err.wikiComposeBlockingResponse) {
          showComposeErrorModal({
            message: message,
            wikiPath: err.wikiComposeBlockingResponse.wikiPath,
            relativePath: payload.relativePath,
            restoreFocus: titleInput || submitBtn
          });
        }
        setStatus(statusEl, message, "error");
        if (isEdit || !createSucceeded) {
          submitBtn.disabled = false;
        }
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    initWikiComposePage();
  });
} else {
  initWikiComposePage();
}

window.westgateWikiInitComposePage = initWikiComposePage;
