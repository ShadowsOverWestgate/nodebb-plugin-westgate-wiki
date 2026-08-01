"use strict";

/*
 * /wiki/manage client behaviour.
 *
 * Tombstone and restore are one click each, with no confirmation: they are
 * reversible, and a maintainer runs them dozens of times in a row. The row
 * updates in place so a long list keeps its scroll position. Purge is the one
 * action that confirms, once per batch, through the forum's own modal.
 */
(function wikiManageClient() {
  if (typeof window === "undefined" || !window.document) {
    return;
  }

  var DEFAULT_CHUNK = 25;

  function relativePath() {
    var rel = (window.config && window.config.relative_path) || "";
    return rel.endsWith("/") ? rel.slice(0, -1) : rel;
  }

  function csrfToken() {
    return (window.config && window.config.csrf_token) || "";
  }

  function apiUrl(path) {
    return relativePath() + "/api/v3/plugins/westgate-wiki" + path;
  }

  async function api(method, path, body) {
    var res = await fetch(apiUrl(path), {
      method: method,
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken()
      },
      body: JSON.stringify(body || {})
    });

    var payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }
    if (!res.ok) {
      throw new Error((payload && payload.status && payload.status.message) || res.statusText || "request-failed");
    }
    return (payload && payload.response) || payload || {};
  }

  function root(node) {
    return node && node.closest ? node.closest("[data-wiki-manage]") : null;
  }

  function announce(scope, message) {
    var status = scope && scope.querySelector("[data-wiki-manage-status]");
    if (status) {
      status.textContent = message || "";
    }
  }

  function chunkSize(scope) {
    var parsed = parseInt(scope && scope.getAttribute("data-purge-chunk"), 10);
    return parsed > 0 ? parsed : DEFAULT_CHUNK;
  }

  // Rows staged for removal: tombstoned, and not one of the pages that can
  // never be purged (the wiki home page). cid 0 means the whole wiki.
  function stagedRows(scope, cid) {
    var selector = cid ?
      '[data-wiki-manage-namespace="' + cid + '"] [data-wiki-manage-row]' :
      "[data-wiki-manage-row]";
    return Array.prototype.filter.call(scope.querySelectorAll(selector), function (row) {
      return row.getAttribute("data-tombstoned") === "1" && row.getAttribute("data-purgeable") === "1";
    });
  }

  function refreshCounts(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll("[data-wiki-manage-namespace]"), function (section) {
      var label = section.querySelector("[data-wiki-manage-staged-count]");
      if (label) {
        label.textContent = String(stagedRows(scope, parseInt(section.getAttribute("data-wiki-manage-namespace"), 10)).length);
      }
    });

    Array.prototype.forEach.call(scope.querySelectorAll("[data-wiki-manage-purge]"), function (button) {
      var cid = parseInt(button.getAttribute("data-wiki-manage-purge"), 10) || 0;
      var count = stagedRows(scope, cid).length;
      var label = button.querySelector("[data-wiki-manage-purge-count]");
      if (label) {
        label.textContent = String(count);
      }
      button.disabled = count === 0 || scope.getAttribute("data-busy") === "1";
    });
  }

  function setRowState(row, tombstoned) {
    row.setAttribute("data-tombstoned", tombstoned ? "1" : "0");

    var flags = row.querySelector("[data-wiki-manage-flags]");
    if (flags) {
      var badge = flags.querySelector("[data-wiki-manage-tombstone-badge]");
      if (tombstoned && !badge) {
        badge = row.ownerDocument.createElement("span");
        badge.className = "badge bg-secondary";
        badge.setAttribute("data-wiki-manage-tombstone-badge", "1");
        badge.textContent = "tombstoned";
        flags.appendChild(badge);
      } else if (!tombstoned && badge) {
        badge.remove();
      }
    }

    var button = row.querySelector("[data-wiki-manage-tombstone], [data-wiki-manage-restore]");
    if (button) {
      if (tombstoned) {
        button.removeAttribute("data-wiki-manage-tombstone");
        button.setAttribute("data-wiki-manage-restore", "1");
        button.className = "btn btn-sm btn-outline-secondary";
        button.textContent = "Restore";
        button.title = "Bring this page back into the wiki";
      } else {
        button.removeAttribute("data-wiki-manage-restore");
        button.setAttribute("data-wiki-manage-tombstone", "1");
        button.className = "btn btn-sm btn-outline-danger";
        button.textContent = "Tombstone";
        button.title = "Tombstone this page before it can be purged.";
      }
    }
  }

  function reportError(err) {
    var message = (err && err.message) || String(err);
    if (typeof app !== "undefined" && app.alert) {
      app.alert({ type: "error", title: "Wiki manager", message: message });
    }
    return message;
  }

  async function toggleRow(button, tombstone) {
    var scope = root(button);
    var row = button.closest("[data-wiki-manage-row]");
    var tid = parseInt(button.getAttribute("data-tid"), 10);
    if (!scope || !row || !(tid > 0) || scope.getAttribute("data-busy") === "1") {
      return;
    }

    button.disabled = true;
    try {
      await api("PUT", tombstone ? "/page/tombstone" : "/page/restore", { tid: tid });
      setRowState(row, tombstone);
      refreshCounts(scope);
      announce(scope, (tombstone ? "Tombstoned " : "Restored ") + (row.getAttribute("data-title") || ("page " + tid)) + ".");
    } catch (err) {
      announce(scope, reportError(err));
    } finally {
      button.disabled = scope.getAttribute("data-busy") === "1";
    }
  }

  function setBusy(scope, busy) {
    scope.setAttribute("data-busy", busy ? "1" : "0");
    Array.prototype.forEach.call(
      scope.querySelectorAll("[data-wiki-manage-tombstone], [data-wiki-manage-restore], [data-wiki-manage-purge]"),
      function (button) {
        button.disabled = busy;
      }
    );
    var cancel = scope.querySelector("[data-wiki-manage-cancel]");
    if (cancel) {
      cancel.hidden = !busy;
      cancel.disabled = false;
    }
    if (!busy) {
      refreshCounts(scope);
    }
  }

  function describeFailures(failures) {
    return failures.map(function (failure) {
      return failure.tid ? "page " + failure.tid + " (" + failure.reason + ")" : failure.reason;
    }).join(", ");
  }

  async function runPurge(button) {
    var scope = root(button);
    if (!scope || scope.getAttribute("data-busy") === "1") {
      return;
    }

    var cid = parseInt(button.getAttribute("data-wiki-manage-purge"), 10) || 0;
    var name = button.getAttribute("data-name") || "the whole wiki";
    var total = stagedRows(scope, cid).length;
    if (!total) {
      return;
    }

    var confirmTyped = window.westgateWiki && window.westgateWiki.confirmTyped;
    var confirmed = confirmTyped ? await confirmTyped({
      title: "Purge tombstoned wiki pages",
      message: "This permanently removes " + total + " tombstoned page(s) from " + name +
        ". Purged pages are gone for good and this cannot be undone. Type " + name + " to confirm.",
      phrase: name,
      confirmLabel: "Purge " + total + " page(s)"
    }) : false;
    if (!confirmed) {
      return;
    }

    scope.wikiManageCancelled = false;
    setBusy(scope, true);
    announce(scope, "Purging 0 of " + total + " pages...");

    var purged = 0;
    var failures = [];
    try {
      while (!scope.wikiManageCancelled) {
        var result = await api("DELETE", "/pages/purge-tombstoned", { cid: cid, limit: chunkSize(scope) });
        (result.purged || []).forEach(function (tid) {
          var row = scope.querySelector('[data-wiki-manage-row="' + tid + '"]');
          if (row) {
            row.remove();
          }
          purged += 1;
        });
        (result.failed || []).forEach(function (failure) {
          // A page that fails stays tombstoned, so the next chunk hits it again.
          // Report each failing page once.
          var seen = failures.some(function (each) {
            return each.tid === failure.tid;
          });
          if (!seen) {
            failures.push(failure);
          }
        });
        announce(scope, "Purging " + purged + " of " + total + " pages...");
        // A chunk that purged nothing means every remaining page is failing;
        // looping again would just repeat the same failures forever.
        if (result.done || !(result.purged || []).length) {
          break;
        }
      }
    } catch (err) {
      failures.push({ reason: reportError(err) });
    }

    setBusy(scope, false);
    var summary = (scope.wikiManageCancelled ? "Cancelled after purging " : "Purged ") + purged + " page(s).";
    if (failures.length) {
      summary += " " + failures.length + " failed: " + describeFailures(failures) + ".";
    }
    announce(scope, summary);
  }

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ?
      event.target.closest("[data-wiki-manage-tombstone], [data-wiki-manage-restore], [data-wiki-manage-purge], [data-wiki-manage-cancel]") :
      null;
    if (!target || !root(target)) {
      return;
    }

    event.preventDefault();
    if (target.hasAttribute("data-wiki-manage-cancel")) {
      var scope = root(target);
      scope.wikiManageCancelled = true;
      target.disabled = true;
      announce(scope, "Cancelling after the current batch...");
      return;
    }
    if (target.hasAttribute("data-wiki-manage-purge")) {
      runPurge(target);
      return;
    }
    toggleRow(target, target.hasAttribute("data-wiki-manage-tombstone"));
  });

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-wiki-manage]"), refreshCounts);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  if (window.jQuery) {
    window.jQuery(window).on("action:ajaxify.end", init);
  }
})();
