"use strict";

/*
 * Confirmation dialogs for destructive wiki actions.
 *
 * These always go through the forum's own modal (bootbox). Never window.confirm
 * or window.prompt: browsers offer a "prevent this page from creating additional
 * dialogs" checkbox after a few native dialogs, and once it is ticked every
 * later confirmation is auto-declined, which silently kills the action instead
 * of running it. If no modal system is available we refuse the action rather
 * than fall back to a native dialog.
 */
(function westgateWikiConfirm() {
  if (typeof window === "undefined") {
    return;
  }

  function unavailable(what) {
    if (window.console && window.console.error) {
      window.console.error("westgate-wiki: no forum modal available, refusing " + what);
    }
    return Promise.resolve(false);
  }

  function confirmAction(options) {
    var settings = options || {};
    var bootbox = window.bootbox;
    if (!bootbox || typeof bootbox.confirm !== "function") {
      return unavailable("confirmation");
    }

    return new Promise(function (resolve) {
      bootbox.confirm({
        title: settings.title || "Confirm",
        message: settings.message || "",
        buttons: {
          confirm: {
            label: settings.confirmLabel || "Confirm",
            className: settings.confirmClass || "btn-primary"
          }
        },
        callback: function (confirmed) {
          resolve(!!confirmed);
        }
      });
    });
  }

  // Typed confirmation: the caller must retype `phrase` exactly. A stray
  // double-click can never carry a batch through this.
  function confirmTyped(options) {
    var settings = options || {};
    var phrase = String(settings.phrase || "");
    var bootbox = window.bootbox;
    if (!bootbox || typeof bootbox.prompt !== "function") {
      return unavailable("typed confirmation");
    }

    return new Promise(function (resolve) {
      bootbox.prompt({
        title: settings.title || "Confirm",
        message: settings.message || "",
        inputType: "text",
        buttons: {
          confirm: {
            label: settings.confirmLabel || "Confirm",
            className: settings.confirmClass || "btn-danger"
          }
        },
        callback: function (value) {
          resolve(value !== null && String(value).trim() === phrase);
        }
      });
    });
  }

  window.westgateWiki = window.westgateWiki || {};
  window.westgateWiki.confirmAction = confirmAction;
  window.westgateWiki.confirmTyped = confirmTyped;
})();
