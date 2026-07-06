"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const wikiTreeIndex = require("../lib/tree/wiki-tree-index");
const root = path.resolve(__dirname, "..");
const originalMainRequire = require.main.require.bind(require.main);

const loreTreeCategories = [
  { cid: 10, name: "Lore", slug: "10/lore", parentCid: 0 },
  { cid: 20, name: "Deities", slug: "20/deities", parentCid: 10 },
  { cid: 42, name: "Gond", slug: "42/gond", parentCid: 20 },
  { cid: 43, name: "Clerics", slug: "43/clerics", parentCid: 42 }
];

function createTree(input = {}) {
  return wikiTreeIndex.createWikiTreeIndex({
    categories: input.categories || loreTreeCategories,
    topics: input.topics || [
      { tid: 77, cid: 20, title: "Gond", titleRaw: "Gond", slug: "77/gond", deleted: 0, scheduled: 0 }
    ],
    routeRootCid: input.routeRootCid,
    canReadTopic: input.canReadTopic,
    canViewCategory: input.canViewCategory
  });
}

function clearProjectModule(relativePath) {
  delete require.cache[require.resolve(path.join(root, relativePath))];
}

async function withRuntimeStubs(stubs, fn) {
  const previousMainRequire = require.main.require;
  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };
  wikiTreeIndex.invalidateWikiTreeIndex();
  clearProjectModule("lib/core/config.js");

  try {
    return await fn();
  } finally {
    require.main.require = previousMainRequire;
    wikiTreeIndex.invalidateWikiTreeIndex();
    clearProjectModule("lib/core/config.js");
  }
}

(async () => {
  {
    const tree = createTree();
    const result = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 1, includeChildren: true });

    assert.equal(result.status, "ok");
    assert.equal(result.node.isComposite, true);
    assert.equal(result.node.page.tid, 77);
    assert.equal(result.node.namespace.cid, 42);
    assert.deepEqual(result.children.directNodes.map((row) => row.canonicalPath), [
      "Lore/Deities/Gond/Clerics"
    ]);

    const folded = await tree.resolveWikiNode("lore/deities/gond", { uid: 1 });
    assert.equal(folded.status, "ok");
    assert.equal(folded.redirectToCanonical, true);
    assert.equal(folded.canonicalPath, "Lore/Deities/Gond");

    const children = await tree.listWikiNodeChildren("Lore/Deities/Gond", { uid: 1 });
    assert.deepEqual(children.directNodes.map((row) => row.canonicalPath), [
      "Lore/Deities/Gond/Clerics"
    ]);

    assert.equal(
      await tree.getCanonicalPagePath({ tid: 78, cid: 20, title: "Gond :: Clerics" }),
      "Lore/Deities/Gond/Clerics"
    );
    assert.equal(await tree.getCanonicalPagePath({ tid: 79, cid: 999, title: "Out of Tree" }), "");
    assert.equal(await tree.getCanonicalNamespacePath(loreTreeCategories[2]), "Lore/Deities/Gond");
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 }
      ],
      topics: [
        { tid: 90, cid: 10, title: "Calendar :: Months :: Hammer", deleted: 0, scheduled: 0 }
      ]
    });
    const result = await tree.resolveWikiNode("Lore/Calendar", { uid: 1, includeChildren: true });

    assert.equal(result.status, "ok");
    assert.equal(result.node.isBranchOnly, true);
    assert.equal(result.node.page, null);
    assert.equal(result.node.namespace, null);
    assert.equal(result.node.hasDescendants, true);
    assert.deepEqual(result.children.directNodes.map((row) => row.canonicalPath), [
      "Lore/Calendar/Months"
    ]);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 50, name: "!!!", parentCid: 0 }
      ],
      topics: [
        { tid: 96, cid: 50, title: "Page", deleted: 0, scheduled: 0 }
      ]
    });

    assert.equal(await tree.getCanonicalNamespacePath({ cid: 50, name: "!!!", parentCid: 0 }), "");
    assert.equal(await tree.getCanonicalPagePath({ tid: 96, cid: 50, title: "Page" }), "");
    assert.equal((await tree.resolveWikiNode("Page", { uid: 1 })).status, "not-found");
    assert.equal((await tree.validateCanonicalPagePlacement({ cid: 50, title: "Page" })).status, "namespace-invalid");
  }

  {
    const topic = { tid: 97, cid: 10, title: "", titleRaw: "", deleted: 0, scheduled: 0 };
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 }
      ],
      topics: [topic]
    });

    assert.equal(await tree.getCanonicalPagePath(topic), "");
    assert.equal((await tree.resolveWikiNode("Lore", { uid: 1 })).node.page, null);
  }

  {
    const tree = createTree({
      topics: [
        { tid: 77, cid: 20, title: "Gond", deleted: 0, scheduled: 0 },
        { tid: 78, cid: 20, title: "gond", deleted: 0, scheduled: 0 }
      ]
    });
    const result = await tree.resolveWikiNode("lore/deities/gond", { uid: 1 });

    assert.equal(result.status, "ambiguous");
    assert.equal(result.foldedKey, "lore/deities/gond");
    assert.deepEqual(result.matches.map((row) => row.canonicalPath), [
      "Lore/Deities/Gond",
      "Lore/Deities/gond"
    ]);

    const exact = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 1 });
    assert.equal(exact.status, "ambiguous");
    assert.equal(exact.foldedKey, "lore/deities/gond");
    assert.deepEqual(exact.matches.map((row) => row.canonicalPath), [
      "Lore/Deities/Gond",
      "Lore/Deities/gond"
    ]);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Aardvark", parentCid: 10 }
      ],
      topics: [
        { tid: 92, cid: 10, title: "Zeta", deleted: 0, scheduled: 0 },
        { tid: 93, cid: 10, title: "Alpha :: Child", deleted: 0, scheduled: 0 },
        { tid: 94, cid: 10, title: "Moon", deleted: 0, scheduled: 0 }
      ]
    });
    const result = await tree.resolveWikiNode("Lore", { uid: 1, includeChildren: true });

    assert.deepEqual(result.children.directNodes.map((row) => row.canonicalPath), [
      "Lore/Aardvark",
      "Lore/Alpha",
      "Lore/Moon",
      "Lore/Zeta"
    ]);
    assert.deepEqual(
      (await tree.listWikiNodeChildren("lore", { uid: 1 })).directNodes.map((row) => row.canonicalPath),
      [
        "Lore/Aardvark",
        "Lore/Alpha",
        "Lore/Moon",
        "Lore/Zeta"
      ]
    );
  }

  {
    const tree = createTree({
      categories: [
        { cid: 30, name: "Feats", parentCid: 0 }
      ],
      topics: [
        { tid: 95, cid: 30, title: "Inspire Competence", deleted: 0, scheduled: 0 }
      ]
    });

    assert.equal((await tree.resolveWikiNode("Feats/Inspire_Competence", { uid: 1 })).status, "ok");
    assert.equal((await tree.resolveWikiNode("Feats/Inspire%2DCompetence", { uid: 1 })).status, "not-found");
  }

  {
    const tree = createTree({
      categories: [
        { cid: 100, name: "Category", parentCid: 0 },
        { cid: 101, name: "12", parentCid: 100 },
        { cid: 102, name: "Lore", parentCid: 101 }
      ],
      topics: []
    });

    const legacyCategoryShape = await tree.resolveWikiNode("category/12/lore", { uid: 1 });
    assert.equal(legacyCategoryShape.status, "not-found");
    assert.equal(Object.prototype.hasOwnProperty.call(legacyCategoryShape, "redirectToCanonical"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(legacyCategoryShape, "wikiPath"), false);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 200, name: "77", parentCid: 0 },
        { cid: 201, name: "Gond", parentCid: 200 }
      ],
      topics: []
    });

    const legacyNumericShape = await tree.resolveWikiNode("77/gond", { uid: 1 });
    assert.equal(legacyNumericShape.status, "not-found");
    assert.equal(Object.prototype.hasOwnProperty.call(legacyNumericShape, "redirectToCanonical"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(legacyNumericShape, "wikiPath"), false);
  }

  {
    const categories = [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Lore", slug: "2/lore", parentCid: 1 }
    ];
    const implicitTree = createTree({ categories, topics: [] });
    assert.equal(await implicitTree.getCanonicalNamespacePath(categories[1]), "Wiki/Lore");
    assert.equal((await implicitTree.resolveWikiNode("Lore", { uid: 1 })).status, "not-found");
    assert.equal((await implicitTree.resolveWikiNode("Wiki/Lore", { uid: 1 })).node.namespace.cid, 2);

    const explicitTree = createTree({ categories, topics: [], routeRootCid: 1 });
    assert.equal(await explicitTree.getCanonicalNamespacePath(categories[1]), "Lore");
    assert.equal((await explicitTree.resolveWikiNode("", { uid: 1 })).status, "root-outside-tree");
    const routedLore = await explicitTree.resolveWikiNode("Lore", { uid: 1 });
    assert.equal(routedLore.node.namespace.cid, 2);
    assert.deepEqual(routedLore.ancestors, [
      { canonicalPath: "", segment: "Wiki", wikiPath: "/wiki" }
    ]);
  }

  {
    const categories = [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "test child ns", slug: "2/test-child-ns", parentCid: 1 }
    ];
    const topics = [
      { tid: 81, cid: 2, title: "asdf :: zxcv", titleRaw: "asdf :: zxcv", deleted: 0, scheduled: 0 }
    ];
    const tree = createTree({ categories, topics, routeRootCid: 1 });
    const article = await tree.resolveWikiNode("Test_child_ns/asdf/zxcv", { uid: 1 });

    assert.equal(article.status, "ok");
    assert.deepEqual(article.ancestors.map((ancestor) => ancestor.displayTitle || ancestor.segment), [
      "Wiki",
      "test child ns",
      "asdf"
    ]);
  }

  {
    const categories = [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }
    ];
    const topics = [
      { tid: 80, cid: 1, title: "Home", deleted: 0, scheduled: 0 }
    ];
    const visibleRoot = createTree({
      categories,
      topics,
      routeRootCid: 1,
      canViewCategory: () => true,
      canReadTopic: () => true
    });

    assert.equal(await visibleRoot.getCanonicalPagePath(topics[0]), "Home");
    assert.equal((await visibleRoot.validateCanonicalPagePlacement({ cid: 1, title: "Home", omitTid: 80 })).status, "ok");
    const visible = await visibleRoot.resolveWikiNode("Home", { uid: 9 });
    assert.equal(visible.status, "ok");
    assert.equal(visible.node.page.tid, 80);
    assert.equal(visible.node.namespace, null);

    const hiddenRoot = createTree({
      categories,
      topics,
      routeRootCid: 1,
      canViewCategory: () => false,
      canReadTopic: () => true
    });

    const hidden = await hiddenRoot.resolveWikiNode("Home", { uid: 9 });
    assert.equal(hidden.status, "not-found");
    assert.equal(Object.prototype.hasOwnProperty.call(hidden, "canonicalPath"), false);
    assert.doesNotMatch(JSON.stringify(hidden), /"tid"|"cid"|"wikiPath"/);
  }

  {
    const tree = createTree({
      canReadTopic: (topic, uid) => !(uid === 2 && parseInt(topic.tid, 10) === 77),
      canViewCategory: (category, uid) => !(uid === 3 && parseInt(category.cid, 10) === 42)
    });

    const hiddenPage = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 2 });
    assert.equal(hiddenPage.status, "ok");
    assert.equal(hiddenPage.node.page, null);
    assert.equal(hiddenPage.node.namespace.cid, 42);
    assert.equal(hiddenPage.node.isComposite, false);

    const hiddenNamespace = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 3 });
    assert.equal(hiddenNamespace.status, "ok");
    assert.equal(hiddenNamespace.node.page.tid, 77);
    assert.equal(hiddenNamespace.node.namespace, null);
    assert.equal(hiddenNamespace.node.isComposite, false);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 60, name: "Secret", parentCid: 0 },
        { cid: 61, name: "Child", parentCid: 60 }
      ],
      topics: [],
      canViewCategory: (category) => parseInt(category.cid, 10) !== 60
    });

    const child = await tree.resolveWikiNode("Secret/Child", { uid: 9, includeChildren: true });
    assert.equal(child.status, "not-found");
    assert.equal(Object.prototype.hasOwnProperty.call(child, "canonicalPath"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(child, "node"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(child, "ancestors"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(child, "children"), false);
    assert.doesNotMatch(JSON.stringify(child), /"cid"|"categoryChain"|"wikiPath"/);

    const parent = await tree.resolveWikiNode("Secret", { uid: 9, includeChildren: true });
    assert.equal(parent.status, "not-found");
    assert.equal(Object.prototype.hasOwnProperty.call(parent, "children"), false);

    assert.deepEqual((await tree.listWikiNodeChildren("Secret", { uid: 9 })).directNodes, []);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 70, name: "Secret", parentCid: 0 },
        { cid: 71, name: "Child", parentCid: 70 }
      ],
      topics: [
        { tid: 700, cid: 71, title: "Page", deleted: 0, scheduled: 0 }
      ],
      canViewCategory: (category) => parseInt(category.cid, 10) !== 70,
      canReadTopic: () => true
    });

    const result = await tree.resolveWikiNode("Secret/Child/Page", { uid: 9, includeChildren: true });
    assert.equal(result.status, "not-found");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "canonicalPath"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "node"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ancestors"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "children"), false);
    assert.doesNotMatch(JSON.stringify(result), /"tid"|"cid"|"categoryChain"|"wikiPath"/);

    assert.deepEqual((await tree.listWikiNodeChildren("Secret/Child", { uid: 9 })).directNodes, []);
  }

  {
    const categories = [
      { cid: 70, name: "Secret", parentCid: 0 },
      { cid: 71, name: "Child", parentCid: 70 }
    ];
    const topics = [
      { tid: 700, cid: 71, title: "Page", deleted: 0, scheduled: 0 }
    ];
    const tree = createTree({
      categories,
      topics,
      canViewCategory: (category, uid) => !(uid === 9 && parseInt(category.cid, 10) === 70),
      canReadTopic: () => true
    });

    assert.equal(await tree.getCanonicalNamespacePath(categories[1]), "Secret/Child");
    assert.equal(await tree.getCanonicalPagePath(topics[0]), "Secret/Child/Page");
    assert.equal(
      await tree.getCanonicalNamespacePath(categories[1], { uid: 9 }),
      "",
      "viewer-aware namespace canonical paths should be blank through unreadable ancestors"
    );
    assert.equal(
      await tree.getCanonicalPagePath(topics[0], { uid: 9 }),
      "",
      "viewer-aware page canonical paths should be blank through unreadable namespace ancestors"
    );
  }

  {
    const topics = [
      { tid: 77, cid: 20, title: "Gond", deleted: 0, scheduled: 0 }
    ];
    const tree = createTree({
      topics,
      canReadTopic: (topic, uid) => !(uid === 9 && parseInt(topic.tid, 10) === 77)
    });

    assert.equal(await tree.getCanonicalPagePath(topics[0]), "Lore/Deities/Gond");
    assert.equal(
      await tree.getCanonicalPagePath(topics[0], { uid: 9 }),
      "",
      "viewer-aware page canonical paths should be blank when the topic is unreadable"
    );
    assert.equal(
      await tree.getCanonicalNamespacePath(loreTreeCategories[1], { uid: 9 }),
      "Lore/Deities",
      "topic visibility should not hide an otherwise readable namespace canonical path"
    );
  }

  {
    const tree = createTree();
    const first = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 1 });
    first.node.page.topic.title = "Mutated Topic";
    first.node.namespace.category.name = "Mutated Category";
    first.node.namespace.categoryChain[0].name = "Mutated Chain";

    const second = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 1 });
    assert.equal(second.node.page.topic.title, "Gond");
    assert.equal(second.node.namespace.category.name, "Gond");
    assert.equal(second.node.namespace.categoryChain[0].name, "Lore");
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 }
      ],
      topics: [
        { tid: 91, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 },
        { tid: 92, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 }
      ],
      canReadTopic: (topic, uid) => !(uid === 9 && parseInt(topic.tid, 10) === 92)
    });
    const result = await tree.resolveWikiNode("Lore/Lantern", { uid: 9 });

    assert.equal(result.status, "ok");
    assert.equal(result.node.page.tid, 91);
    assert.doesNotMatch(JSON.stringify(result), /92/);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 }
      ],
      topics: [
        { tid: 91, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 },
        { tid: 92, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 }
      ],
      canReadTopic: () => true
    });
    const result = await tree.resolveWikiNode("Lore/Lantern", { uid: 9 });

    assert.equal(result.status, "page-collision");
    assert.deepEqual(result.tids, [91, 92]);
    assert.equal(result.hiddenBlockers, false);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Archives", parentCid: 10 },
        { cid: 12, name: "Archives", parentCid: 10 }
      ],
      topics: [],
      canViewCategory: (category, uid) => !(uid === 9 && parseInt(category.cid, 10) === 12)
    });
    const result = await tree.resolveWikiNode("Lore/Archives", { uid: 9 });

    assert.equal(result.status, "ok");
    assert.equal(result.node.namespace.cid, 11);
    assert.doesNotMatch(JSON.stringify(result), /12/);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Archives", parentCid: 10 },
        { cid: 12, name: "Archives", parentCid: 10 }
      ],
      topics: [],
      canViewCategory: () => true
    });
    const result = await tree.resolveWikiNode("Lore/Archives", { uid: 9 });

    assert.equal(result.status, "namespace-collision");
    assert.deepEqual(result.cids, [11, 12]);
    assert.equal(result.hiddenBlockers, false);
  }

  {
    const tree = createTree({
      topics: [
        { tid: 77, cid: 20, title: "Gond", deleted: 0, scheduled: 0 },
        { tid: 78, cid: 20, title: "gond", deleted: 0, scheduled: 0 }
      ],
      canReadTopic: (topic, uid) => !(uid === 9 && parseInt(topic.tid, 10) === 78)
    });
    const result = await tree.resolveWikiNode("lore/deities/gond", { uid: 9 });

    assert.equal(result.status, "ambiguous");
    assert.deepEqual(result.matches.map((row) => row.canonicalPath), ["Lore/Deities/Gond"]);
    assert.equal(result.hiddenBlockers, true);
    assert.doesNotMatch(JSON.stringify(result), /Lore\/Deities\/gond|78/);

    const exact = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 9 });
    assert.equal(exact.status, "ambiguous");
    assert.deepEqual(exact.matches.map((row) => row.canonicalPath), ["Lore/Deities/Gond"]);
    assert.equal(exact.hiddenBlockers, true);
    assert.doesNotMatch(JSON.stringify(exact), /Lore\/Deities\/gond|78/);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 20, name: "Deities", parentCid: 10 }
      ],
      topics: [
        { tid: 77, cid: 20, title: "Gond", deleted: 0, scheduled: 0 },
        { tid: 78, cid: 20, title: "gond", deleted: 0, scheduled: 0 }
      ],
      canReadTopic: () => false
    });

    const result = await tree.resolveWikiNode("lore/deities/gond", { uid: 9 });
    assert.equal(result.status, "not-found");
    assert.doesNotMatch(JSON.stringify(result), /ambiguous|hiddenBlockers|Lore\/Deities\/Gond|Lore\/Deities\/gond|77|78/);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 }
      ],
      topics: [
        { tid: 91, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 },
        { tid: 92, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 }
      ],
      canReadTopic: () => false
    });

    const result = await tree.resolveWikiNode("Lore/Lantern", { uid: 9 });
    assert.equal(result.status, "not-found");
    assert.doesNotMatch(JSON.stringify(result), /page-collision|hiddenBlockers|91|92/);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Lantern", parentCid: 10 }
      ],
      topics: [
        { tid: 91, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 },
        { tid: 92, cid: 10, title: "Lantern", deleted: 0, scheduled: 0 }
      ],
      canReadTopic: () => false
    });

    const result = await tree.resolveWikiNode("Lore/Lantern", { uid: 9 });
    assert.equal(result.status, "ok");
    assert.equal(result.node.page, null);
    assert.equal(result.node.namespace.cid, 11);
    assert.doesNotMatch(JSON.stringify(result), /page-collision|hiddenBlockers|91|92/);
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 11, name: "Archives", parentCid: 10 },
        { cid: 12, name: "Archives", parentCid: 10 }
      ],
      topics: [],
      canViewCategory: (category) => parseInt(category.cid, 10) === 10
    });

    const result = await tree.resolveWikiNode("Lore/Archives", { uid: 9 });
    assert.equal(result.status, "not-found");
    assert.doesNotMatch(JSON.stringify(result), /namespace-collision|hiddenBlockers|11|12/);
  }

  {
    const tree = createTree();

    assert.equal((await tree.validateCanonicalPagePlacement({ cid: 20, title: "Gond" })).status, "page-collision");
    assert.equal((await tree.validateCanonicalPagePlacement({ cid: 20, title: "Gond", omitTid: 77 })).status, "ok");
    assert.equal((await tree.validateCanonicalPagePlacement({ cid: 42, title: "Clerics" })).status, "ok");
    assert.equal((await tree.validateCanonicalNamespacePlacement({ category: { cid: 99, name: "Gond" }, parentCid: 20 })).status, "namespace-collision");
    assert.equal((await tree.validateCanonicalNamespacePlacement({ category: { cid: 99, name: "Tyr" }, parentCid: 20 })).status, "ok");
    assert.equal((await tree.validateCanonicalNamespacePlacement({ category: { cid: 99, name: "Child" }, parentCid: 999 })).status, "parent-namespace-not-found");
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 50, name: "!!!", parentCid: 10 },
        { cid: 51, name: "Gond", parentCid: 50 }
      ],
      topics: [
        { tid: 96, cid: 50, title: "Gond", deleted: 0, scheduled: 0 }
      ]
    });

    assert.equal((await tree.validateCanonicalNamespacePlacement({ category: { cid: 99, name: "Gond" }, parentCid: 10 })).status, "ok");
    assert.equal((await tree.validateCanonicalPagePlacement({ cid: 10, title: "Gond" })).status, "ok");
  }

  {
    const tree = createTree({ topics: [] });

    assert.equal((await tree.validateCanonicalPagePlacement({ cid: 20, title: "Gond" })).status, "ok");
    assert.equal((await tree.validateCanonicalPagePlacement({ cid: 20, title: "gond" })).status, "cross-facet-folded-collision");
  }

  {
    const tree = createTree({
      categories: [
        { cid: 10, name: "Lore", parentCid: 0 },
        { cid: 20, name: "Deities", parentCid: 10 }
      ],
      topics: [
        { tid: 77, cid: 20, title: "Gond", deleted: 0, scheduled: 0 }
      ]
    });

    assert.equal((await tree.validateCanonicalNamespacePlacement({ category: { cid: 99, name: "Gond" }, parentCid: 20 })).status, "ok");
    assert.equal((await tree.validateCanonicalNamespacePlacement({ category: { cid: 99, name: "gond" }, parentCid: 20 })).status, "cross-facet-folded-collision");
  }

  await withRuntimeStubs({
    "./src/categories": {
      getCategoryData: async (cid) => (parseInt(cid, 10) === 10 ? { cid: 10, name: "Lore", parentCid: 0 } : null),
      getChildrenCids: async () => []
    },
    "./src/database": {
      getSortedSetRange: async () => [100]
    },
    "./src/meta": {
      settings: {
        get: async () => ({ categoryIds: "10", includeChildCategories: "0" }),
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/privileges": {
      categories: {
        get: async (cid, uid) => ({
          read: parseInt(uid, 10) !== 1,
          "topics:read": parseInt(uid, 10) !== 1
        })
      },
      topics: {
        filterTids: async (privilege, tids, uid) => (parseInt(uid, 10) === 1 ? [] : tids)
      }
    },
    "./src/topics": {
      getTopicsFields: async () => [
        { tid: 100, cid: 10, title: "Hidden Runtime Page", deleted: 0, scheduled: 0 }
      ]
    }
  }, async () => {
    const result = await wikiTreeIndex.resolveWikiNode("Lore", { uid: 1 });
    assert.equal(result.status, "not-found");
    assert.equal(
      await wikiTreeIndex.getCanonicalNamespacePath({ cid: 10, name: "Lore", parentCid: 0 }),
      "Lore",
      "runtime namespace helper should keep internal no-viewer canonical behavior"
    );
    assert.equal(
      await wikiTreeIndex.getCanonicalNamespacePath({ cid: 10, name: "Lore", parentCid: 0 }, { uid: 1 }),
      "",
      "runtime namespace helper should pass uid options to the cached tree"
    );
    assert.equal(
      await wikiTreeIndex.getCanonicalPagePath({ tid: 100, cid: 10, title: "Hidden Runtime Page" }, { uid: 1 }),
      "",
      "runtime page helper should pass uid options to the cached tree"
    );
  });

  assert.equal(typeof wikiTreeIndex.resolveWikiNode, "function");
  assert.equal(typeof wikiTreeIndex.invalidateWikiTreeIndex, "function");

  console.log("wiki-tree-index tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
