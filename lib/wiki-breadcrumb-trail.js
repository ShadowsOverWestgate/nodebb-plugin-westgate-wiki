"use strict";

function mapAncestors(ancestorSections) {
  if (!Array.isArray(ancestorSections)) {
    return [];
  }
  return ancestorSections.map((a) => ({
    text: a.name,
    url: a.wikiPath
  }));
}

function finalize(locationItems, actionText) {
  const action = actionText && String(actionText).trim();
  const hasAction = !!action;
  const wikiBreadcrumbs = locationItems.map((c, i) => {
    const isLast = i === locationItems.length - 1;
    const isAriaCurrent = !hasAction && isLast && !c.url;
    const crumb = { text: c.text, isAriaCurrent };
    if (c.url) {
      crumb.url = c.url;
    }
    return crumb;
  });
  return {
    wikiBreadcrumbs,
    wikiBreadcrumbAction: action || "",
    hasWikiBreadcrumbAction: hasAction,
    breadcrumbs: []
  };
}

function forWikiHub() {
  return finalize([], "");
}

function forWikiSearch() {
  return finalize([], "Search");
}

function forSectionView(section) {
  const trail = [
    ...mapAncestors(section.ancestorSections),
    { text: section.name }
  ];
  return finalize(trail, "");
}

function forArticleView(wikiPage) {
  const cat = wikiPage.category;
  const parentCrumbs = (wikiPage.parentPages || []).map((p) => ({
    text: p.text,
    url: p.url || undefined
  }));
  const leafTitle = wikiPage.pageTitlePath && wikiPage.pageTitlePath.length
    ? wikiPage.pageTitlePath[wikiPage.pageTitlePath.length - 1]
    : wikiPage.topic.title;

  const trail = [
    ...mapAncestors(wikiPage.ancestorSections),
    { text: cat.name, url: wikiPage.sectionNavigation ? wikiPage.sectionNavigation.wikiPath : cat.wikiPath },
    ...parentCrumbs,
    { text: leafTitle }
  ];
  return finalize(trail, "");
}

function getCanonicalNodeLeafText(nodeResult, fallbackText) {
  const node = nodeResult && nodeResult.node || {};
  const pageTitlePath = node.page && Array.isArray(node.page.titlePath) ? node.page.titlePath : [];
  if (pageTitlePath.length) {
    return pageTitlePath[pageTitlePath.length - 1];
  }
  if (node.namespace && node.namespace.category && node.namespace.category.name) {
    return node.namespace.category.name;
  }
  const segments = Array.isArray(node.segments) ? node.segments : [];
  if (segments.length) {
    return segments[segments.length - 1];
  }
  return String(fallbackText || nodeResult && nodeResult.canonicalPath || "Wiki");
}

function getCanonicalTitleAncestorText(nodeResult, ancestor) {
  const node = nodeResult && nodeResult.node || {};
  const page = node.page || {};
  const titlePath = Array.isArray(page.titlePath) ? page.titlePath : [];
  const canonicalPath = String(page.canonicalPath || node.canonicalPath || "");
  if (titlePath.length <= 1 || !canonicalPath) {
    return "";
  }

  const pathSegments = canonicalPath.split("/").filter(Boolean);
  const namespaceSegmentCount = pathSegments.length - titlePath.length;
  const ancestorSegmentCount = String(ancestor && ancestor.canonicalPath || "").split("/").filter(Boolean).length;
  const titleIndex = ancestorSegmentCount - 1 - namespaceSegmentCount;
  if (titleIndex < 0 || titleIndex >= titlePath.length - 1) {
    return "";
  }
  return titlePath[titleIndex] || "";
}

function forCanonicalNodeView(nodeResult, options = {}) {
  const ancestors = Array.isArray(nodeResult && nodeResult.ancestors) ? nodeResult.ancestors : [];
  const trail = ancestors.map((ancestor) => ({
    text: getCanonicalTitleAncestorText(nodeResult, ancestor) ||
      ancestor.displayTitle ||
      ancestor.segment ||
      String(ancestor.canonicalPath || "").split("/").filter(Boolean).pop() ||
      "Wiki",
    url: ancestor.wikiPath
  }));

  trail.push({
    text: options.leafText || getCanonicalNodeLeafText(nodeResult, options.fallbackText)
  });

  return finalize(trail, "");
}

function forComposeCreate(section, actionLabel) {
  const trail = [
    ...mapAncestors(section.ancestorSections),
    { text: section.name, url: section.wikiPath }
  ];
  return finalize(trail, actionLabel || "Create page");
}

function forComposeEdit(section, topic) {
  const title = topic.titleRaw || topic.title;
  const trail = [
    ...mapAncestors(section.ancestorSections),
    { text: section.name, url: section.wikiPath },
    { text: title, url: topic.wikiPath || "" }
  ];
  return finalize(trail, "Edit");
}

function forNamespaceCreate(section) {
  const trail = [
    ...mapAncestors(section.ancestorSections),
    { text: section.name, url: section.wikiPath }
  ];
  return finalize(trail, "Create namespace");
}

module.exports = {
  forWikiHub,
  forWikiSearch,
  forSectionView,
  forArticleView,
  forCanonicalNodeView,
  forComposeCreate,
  forComposeEdit,
  forNamespaceCreate
};
