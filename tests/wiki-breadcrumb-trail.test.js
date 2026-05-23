"use strict";

const assert = require("assert");

const wikiBreadcrumbTrail = require("../lib/wiki-breadcrumb-trail");

function texts(trail) {
  return trail.wikiBreadcrumbs.map((crumb) => crumb.text);
}

assert.deepStrictEqual(
  texts(wikiBreadcrumbTrail.forArticleView({
    ancestorSections: [],
    category: {
      name: "Shadows Over Westgate Wiki",
      wikiPath: "/wiki/shadows-over-westgate-wiki"
    },
    sectionNavigation: {
      wikiPath: "/wiki/shadows-over-westgate-wiki"
    },
    topic: {
      title: "Home"
    }
  })),
  ["Shadows Over Westgate Wiki", "Home"],
  "article breadcrumbs should not include the static wiki root label"
);

assert.deepStrictEqual(
  texts(wikiBreadcrumbTrail.forSectionView({
    ancestorSections: [],
    name: "Shadows Over Westgate Wiki"
  })),
  ["Shadows Over Westgate Wiki"],
  "section breadcrumbs should start with the concrete namespace"
);

assert.deepStrictEqual(
  texts(wikiBreadcrumbTrail.forArticleView({
    ancestorSections: [],
    category: {
      name: "Shadows Over Westgate Wiki",
      wikiPath: "/wiki/shadows-over-westgate-wiki"
    },
    sectionNavigation: {
      wikiPath: "/wiki/shadows-over-westgate-wiki"
    },
    topic: {
      title: "asdf/zxcv"
    },
    pageTitlePath: ["asdf/zxcv"],
    parentPages: []
  })),
  ["Shadows Over Westgate Wiki", "asdf/zxcv"],
  "literal slashes in article titles should not create parent breadcrumbs"
);

assert.deepStrictEqual(
  texts(wikiBreadcrumbTrail.forArticleView({
    ancestorSections: [],
    category: {
      name: "Shadows Over Westgate Wiki",
      wikiPath: "/wiki/shadows-over-westgate-wiki"
    },
    sectionNavigation: {
      wikiPath: "/wiki/shadows-over-westgate-wiki"
    },
    topic: {
      title: "asdf :: zxcv"
    },
    pageTitlePath: ["asdf", "zxcv"],
    parentPages: [{ text: "asdf", url: "/wiki/shadows-over-westgate-wiki/asdf" }]
  })),
  ["Shadows Over Westgate Wiki", "asdf", "zxcv"],
  "explicit subpage delimiter should create parent breadcrumbs"
);

assert.deepStrictEqual(
  texts(wikiBreadcrumbTrail.forCanonicalNodeView({
    ancestors: [
      { segment: "Lore", wikiPath: "/wiki/Lore" },
      { segment: "Deities", wikiPath: "/wiki/Lore/Deities" }
    ],
    node: {
      canonicalPath: "Lore/Deities/Gond",
      segments: ["Lore", "Deities", "Gond"],
      page: { titlePath: ["Gond"] },
      namespace: { category: { name: "Gond" } },
      isComposite: true
    }
  })),
  ["Lore", "Deities", "Gond"],
  "canonical node breadcrumbs should use tree ancestors and render composite nodes once"
);
