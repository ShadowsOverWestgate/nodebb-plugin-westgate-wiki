"use strict";

define("admin/plugins/westgate-wiki", ["settings"], function (Settings) {
  const ACP = {};

  function getCheckedCategoryIds(settingsEl) {
    return settingsEl.find("[data-wiki-category-toggle]:checked").map(function () {
      return $(this).val();
    }).get();
  }

  function syncCheckboxesFromTextarea(settingsEl) {
    const selected = new Set(
      String(settingsEl.find("#categoryIds").val() || "")
        .split(/[\s,]+/)
        .filter(Boolean)
    );

    settingsEl.find("[data-wiki-category-toggle]").each(function () {
      $(this).prop("checked", selected.has($(this).val()));
    });
  }

  function syncTextareaFromCheckboxes(settingsEl) {
    const values = getCheckedCategoryIds(settingsEl);
    settingsEl.find("#categoryIds").val(values.join(", "));
    settingsEl.find("[data-selected-count]").text(values.length);
  }

  function getCheckedWikiNamespaceGroupNames(settingsEl) {
    return settingsEl.find("[data-wiki-namespace-creator-group]:checked").map(function () {
      return $(this).val();
    }).get();
  }

  function parseWikiNamespaceGroupNames(rawValue) {
    return String(rawValue || "")
      .split(/[\n,]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function syncWikiNamespaceGroupsFromTextarea(settingsEl) {
    const selected = new Set(
      parseWikiNamespaceGroupNames(settingsEl.find("#wikiNamespaceCreateGroups").val())
    );

    settingsEl.find("[data-wiki-namespace-creator-group]").each(function () {
      $(this).prop("checked", selected.has($(this).val()));
    });
  }

  function syncWikiNamespaceTextareaFromCheckboxes(settingsEl) {
    const checkedNames = getCheckedWikiNamespaceGroupNames(settingsEl);
    const knownNames = new Set(
      settingsEl.find("[data-wiki-namespace-creator-group]").map(function () {
        return $(this).val();
      }).get()
    );
    const manualNames = parseWikiNamespaceGroupNames(settingsEl.find("#wikiNamespaceCreateGroups").val())
      .filter(function (name) {
        return !knownNames.has(name);
      });
    const names = checkedNames.concat(manualNames);
    settingsEl.find("#wikiNamespaceCreateGroups").val(names.join(", "));
  }

  function getRelativePath() {
    return (window.config && window.config.relative_path) || "";
  }

  function getCsrfToken() {
    return (window.config && window.config.csrf_token) || "";
  }

  function unwrapApiResponse(payload) {
    return payload && Object.prototype.hasOwnProperty.call(payload, "response") ? payload.response : payload;
  }

  function renderMigrationReport(panel, action, report) {
    const statusEl = panel.find("[data-wiki-path-migration-blocking-status]");
    const outputEl = panel.find("[data-wiki-path-migration-output]");
    const verification = report && report.verify ? report.verify : report;
    const summary = verification && verification.summary ? verification.summary : (report && report.summary);
    const blockingErrors = summary ? parseInt(summary.blockingErrors, 10) || 0 : 0;
    const legacyMainPages = verification && Object.prototype.hasOwnProperty.call(verification, "activeNamespaceMainPageOverrides") ?
      parseInt(verification.activeNamespaceMainPageOverrides, 10) || 0 :
      (summary ? parseInt(summary.legacyNamespaceMainPages, 10) || 0 : 0);
    const retiredSlugs = verification && Object.prototype.hasOwnProperty.call(verification, "activeGeneratedPublicSlugRouting") ?
      parseInt(verification.activeGeneratedPublicSlugRouting, 10) || 0 :
      (summary ? parseInt(summary.retiredGeneratedSlugRows, 10) || 0 : 0);
    const routeRoots = report && Array.isArray(report.routeRoots) ? report.routeRoots.length : 0;
    const isOk = blockingErrors === 0 && legacyMainPages === 0 && retiredSlugs === 0;

    statusEl
      .removeClass("alert-secondary alert-success alert-warning alert-danger")
      .addClass(isOk ? "alert-success" : (blockingErrors > 0 ? "alert-danger" : "alert-warning"))
      .text(
        action + " complete: " +
        blockingErrors + " blocking issue" + (blockingErrors === 1 ? "" : "s") +
        ", " + legacyMainPages + " active namespace main page override" + (legacyMainPages === 1 ? "" : "s") +
        ", " + retiredSlugs + " active generated public slug route" + (retiredSlugs === 1 ? "" : "s") +
        ", " + routeRoots + " route-root row" + (routeRoots === 1 ? "" : "s") + "."
      );
    outputEl.text(JSON.stringify(report || {}, null, 2));
  }

  function setMigrationError(panel, message) {
    panel.find("[data-wiki-path-migration-blocking-status]")
      .removeClass("alert-secondary alert-success alert-warning alert-danger")
      .addClass("alert-danger")
      .text(message || "Migration report request failed.");
  }

  async function runMigrationReport(panel, action, method, path) {
    const buttons = panel.find("[data-wiki-path-migration-scan], [data-wiki-path-migration-prepare], [data-wiki-path-migration-apply], [data-wiki-path-migration-verify]");
    buttons.prop("disabled", true);
    panel.find("[data-wiki-path-migration-blocking-status]")
      .removeClass("alert-secondary alert-success alert-danger")
      .addClass("alert-warning")
      .text(action + " report is running...");

    try {
      const response = await fetch(getRelativePath() + "/api/v3/plugins/westgate-wiki/" + path, {
        method: method,
        credentials: "same-origin",
        headers: method === "POST" ? { "x-csrf-token": getCsrfToken() } : {}
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload && payload.status && payload.status.message || response.statusText);
      }
      renderMigrationReport(panel, action, unwrapApiResponse(payload));
    } catch (err) {
      setMigrationError(panel, err && err.message);
    } finally {
      buttons.prop("disabled", false);
    }
  }

  function wikiApiPath(path) {
    return getRelativePath() + "/api/v3/plugins/westgate-wiki/" + path;
  }

  function renderArchiveStatus(panel, message, level) {
    panel.find("[data-wiki-archive-status]")
      .removeClass("alert-secondary alert-success alert-warning alert-danger")
      .addClass("alert-" + (level || "secondary"))
      .text(message);
  }

  function renderArchiveOutput(panel, payload) {
    panel.find("[data-wiki-archive-output]").text(JSON.stringify(payload || {}, null, 2));
  }

  function setArchiveButtons(panel, disabled) {
    panel.find("[data-wiki-archive-export-start], [data-wiki-archive-export-status], [data-wiki-archive-import-preview]")
      .prop("disabled", disabled);
    if (disabled) {
      panel.find("[data-wiki-archive-apply]").prop("disabled", true);
    } else {
      panel.find("[data-wiki-archive-apply]").prop("disabled", !canApplyApprovedArchive(panel));
    }
  }

  function resetArchiveApproval(panel) {
    panel.data("wikiArchiveApprovedJobId", "");
    panel.find("[data-wiki-archive-apply-approved]").prop("checked", false);
    setArchiveButtons(panel, false);
  }

  function bindArchiveApproval(panel) {
    const approved = panel.find("[data-wiki-archive-apply-approved]").prop("checked");
    panel.data("wikiArchiveApprovedJobId", approved ? panel.data("wikiArchiveImportJobId") : "");
    setArchiveButtons(panel, false);
  }

  function canApplyApprovedArchive(panel) {
    const jobId = panel.data("wikiArchiveImportJobId");
    return !!jobId &&
      panel.data("wikiArchiveImportCanApply") === true &&
      panel.data("wikiArchiveApprovedJobId") === jobId;
  }

  function updateArchiveDownload(panel, job) {
    const link = panel.find("[data-wiki-archive-export-download]");
    if (job && job.jobId && job.status === "completed" && job.hasArtifact) {
      link
        .removeClass("disabled")
        .attr("href", wikiApiPath("archive/export-jobs/" + encodeURIComponent(job.jobId) + "/download"));
      return;
    }
    link.addClass("disabled").attr("href", "#");
  }

  function archiveSummary(payload) {
    const job = payload && payload.job ? payload.job : payload;
    const preview = payload && payload.preview || job && job.report && job.report.preview;
    const applyReport = payload && payload.applyReport || job && job.report && job.report.applyReport;
    const parts = [];
    if (job && job.type) {
      parts.push(job.type + " job " + job.status);
    }
    if (preview) {
      parts.push("preview " + preview.status + " with " + (preview.operations || []).length + " operation(s)");
      if ((preview.blockers || []).length) {
        parts.push((preview.blockers || []).length + " blocker(s)");
      }
    }
    if (applyReport) {
      parts.push("apply " + applyReport.status);
    }
    return parts.join(", ") || "Archive request complete.";
  }

  async function requestArchive(panel, method, path, body) {
    const headers = { "x-csrf-token": getCsrfToken() };
    const options = {
      method: method,
      credentials: "same-origin",
      headers: headers
    };
    if (body instanceof FormData) {
      options.body = body;
    } else if (body) {
      headers["content-type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(wikiApiPath(path), options);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload && payload.status && payload.status.message || response.statusText);
    }
    return unwrapApiResponse(payload);
  }

  async function startArchiveExport(panel) {
    setArchiveButtons(panel, true);
    renderArchiveStatus(panel, "Export job is running...", "warning");
    try {
      const payload = await requestArchive(panel, "POST", "archive/export-jobs");
      panel.data("wikiArchiveExportJobId", payload.jobId);
      updateArchiveDownload(panel, payload);
      renderArchiveStatus(panel, archiveSummary(payload), payload.status === "completed" ? "success" : "warning");
      renderArchiveOutput(panel, payload);
    } catch (err) {
      renderArchiveStatus(panel, err && err.message || "Export failed.", "danger");
    } finally {
      setArchiveButtons(panel, false);
    }
  }

  async function refreshArchiveExport(panel) {
    const jobId = panel.data("wikiArchiveExportJobId");
    if (!jobId) {
      renderArchiveStatus(panel, "No export job has been started in this browser session.", "warning");
      return;
    }
    setArchiveButtons(panel, true);
    try {
      const payload = await requestArchive(panel, "GET", "archive/jobs/" + encodeURIComponent(jobId));
      updateArchiveDownload(panel, payload);
      renderArchiveStatus(panel, archiveSummary(payload), payload.status === "completed" ? "success" : "warning");
      renderArchiveOutput(panel, payload);
    } catch (err) {
      renderArchiveStatus(panel, err && err.message || "Export status request failed.", "danger");
    } finally {
      setArchiveButtons(panel, false);
    }
  }

  async function startArchiveImportPreview(panel) {
    const file = panel.find("[data-wiki-archive-import-file]")[0].files[0];
    if (!file) {
      renderArchiveStatus(panel, "Choose an archive ZIP before previewing import.", "warning");
      return;
    }
    resetArchiveApproval(panel);
    setArchiveButtons(panel, true);
    renderArchiveStatus(panel, "Import preview is running...", "warning");
    try {
      const body = new FormData();
      body.append("archive", file, file.name || "westgate-wiki-archive.zip");
      body.append("includeSettings", panel.find("[data-wiki-archive-include-settings]").prop("checked") ? "true" : "false");
      const payload = await requestArchive(panel, "POST", "archive/import-jobs", body);
      panel.data("wikiArchiveImportJobId", payload.jobId);
      panel.data("wikiArchiveImportCanApply", !(payload.preview && payload.preview.status === "blocked"));
      resetArchiveApproval(panel);
      renderArchiveStatus(panel, archiveSummary(payload), payload.preview && payload.preview.status === "blocked" ? "danger" : "success");
      renderArchiveOutput(panel, payload);
    } catch (err) {
      panel.data("wikiArchiveImportCanApply", false);
      resetArchiveApproval(panel);
      renderArchiveStatus(panel, err && err.message || "Import preview failed.", "danger");
    } finally {
      setArchiveButtons(panel, false);
    }
  }

  async function applyArchiveImport(panel) {
    const jobId = panel.data("wikiArchiveImportJobId");
    if (!jobId) {
      renderArchiveStatus(panel, "No import preview job has been created in this browser session.", "warning");
      return;
    }
    if (!canApplyApprovedArchive(panel)) {
      renderArchiveStatus(panel, "Approve the preview before applying the import.", "warning");
      return;
    }
    setArchiveButtons(panel, true);
    renderArchiveStatus(panel, "Import apply is running...", "warning");
    try {
      const payload = await requestArchive(panel, "PUT", "archive/import-jobs/" + encodeURIComponent(jobId) + "/apply", {
        approved: true,
        includeSettings: panel.find("[data-wiki-archive-include-settings]").prop("checked")
      });
      renderArchiveStatus(panel, archiveSummary(payload), payload.applyReport && payload.applyReport.status === "failed" ? "danger" : "success");
      renderArchiveOutput(panel, payload);
    } catch (err) {
      renderArchiveStatus(panel, err && err.message || "Import apply failed.", "danger");
    } finally {
      setArchiveButtons(panel, false);
    }
  }

  ACP.init = function () {
    const settingsEl = $(".westgate-wiki-settings");
    const migrationPanel = $("[data-wiki-path-migration-panel]");
    const archivePanel = $("[data-wiki-archive-panel]");

    Settings.load("westgate-wiki", settingsEl, function () {
      syncCheckboxesFromTextarea(settingsEl);
      syncTextareaFromCheckboxes(settingsEl);
      syncWikiNamespaceGroupsFromTextarea(settingsEl);
      syncWikiNamespaceTextareaFromCheckboxes(settingsEl);
    });

    settingsEl.on("change", "[data-wiki-category-toggle]", function () {
      syncTextareaFromCheckboxes(settingsEl);
    });

    settingsEl.on("input", "#categoryIds", function () {
      syncCheckboxesFromTextarea(settingsEl);
      syncTextareaFromCheckboxes(settingsEl);
    });

    settingsEl.on("change", "[data-wiki-namespace-creator-group]", function () {
      syncWikiNamespaceTextareaFromCheckboxes(settingsEl);
    });

    settingsEl.on("input", "#wikiNamespaceCreateGroups", function () {
      syncWikiNamespaceGroupsFromTextarea(settingsEl);
    });

    migrationPanel.on("click", "[data-wiki-path-migration-scan]", function () {
      runMigrationReport(migrationPanel, "Scan", "GET", "path-migration/scan");
    });

    migrationPanel.on("click", "[data-wiki-path-migration-prepare]", function () {
      runMigrationReport(migrationPanel, "Prepare", "POST", "path-migration/prepare");
    });

    migrationPanel.on("click", "[data-wiki-path-migration-verify]", function () {
      runMigrationReport(migrationPanel, "Verify", "GET", "path-migration/verify");
    });

    migrationPanel.on("click", "[data-wiki-path-migration-apply]", function () {
      runMigrationReport(migrationPanel, "Apply", "POST", "path-migration/apply");
    });

    archivePanel.on("click", "[data-wiki-archive-export-start]", function () {
      startArchiveExport(archivePanel);
    });

    archivePanel.on("click", "[data-wiki-archive-export-status]", function () {
      refreshArchiveExport(archivePanel);
    });

    archivePanel.on("click", "[data-wiki-archive-import-preview]", function () {
      startArchiveImportPreview(archivePanel);
    });

    archivePanel.on("change", "[data-wiki-archive-import-file]", function () {
      archivePanel.data("wikiArchiveImportJobId", "");
      archivePanel.data("wikiArchiveImportCanApply", false);
      resetArchiveApproval(archivePanel);
    });

    archivePanel.on("change", "[data-wiki-archive-apply-approved]", function () {
      bindArchiveApproval(archivePanel);
    });

    archivePanel.on("click", "[data-wiki-archive-apply]", function () {
      applyArchiveImport(archivePanel);
    });

    $("#save").on("click", function () {
      syncTextareaFromCheckboxes(settingsEl);
      syncWikiNamespaceTextareaFromCheckboxes(settingsEl);
      Settings.save("westgate-wiki", settingsEl);
    });
  };

  return ACP;
});
