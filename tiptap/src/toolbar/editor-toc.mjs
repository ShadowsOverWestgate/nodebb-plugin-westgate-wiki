function slugPart(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "heading";
}

function isPositionInsideNode(editor, pos, nodeTypeName) {
  if (!editor || !editor.state || !editor.state.doc) {
    return false;
  }

  const doc = editor.state.doc;
  const resolvedPos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    if (resolvedPos.node(depth).type.name === nodeTypeName) {
      return true;
    }
  }
  return false;
}

export function buildHeadingToc(editor) {
  const roots = [];
  const stack = [];

  editor.state.doc.descendants(function (node, pos) {
    if (node.type.name !== "heading") {
      return true;
    }
    if (isPositionInsideNode(editor, pos, "wikiInfobox")) {
      return true;
    }

    const level = node.attrs && node.attrs.level ? parseInt(node.attrs.level, 10) : 1;
    const item = {
      id: `wiki-editor-heading-${pos}-${slugPart(node.textContent)}`,
      level,
      pos,
      text: node.textContent || "Untitled heading",
      children: []
    };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length) {
      stack[stack.length - 1].children.push(item);
    } else {
      roots.push(item);
    }

    stack.push(item);
    return true;
  });

  return roots;
}

export function flattenHeadingToc(items) {
  const flattened = [];

  function visit(children) {
    children.forEach(function (item) {
      flattened.push(item);
      visit(item.children || []);
    });
  }

  visit(items || []);
  return flattened;
}

function escapeSelectorId(id) {
  if (typeof window !== "undefined" && window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(id);
  }
  return String(id).replace(/"/g, '\\"');
}

function getHeadingElement({ item, surface, editor }) {
  if (!item || !surface) {
    return null;
  }

  if (editor && editor.view && typeof editor.view.nodeDOM === "function") {
    const node = editor.view.nodeDOM(item.pos);
    if (node && node.nodeType === 1 && surface.contains(node)) {
      return node;
    }
  }

  if (typeof surface.querySelector === "function") {
    const node = surface.querySelector(`#${escapeSelectorId(item.id)}`);
    if (node) {
      return node;
    }
  }

  return null;
}

function getScrollParent(element) {
  let node = element && element.parentElement;

  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
    const overflowY = style ? style.overflowY : "";
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }

  return window;
}

function getTopOffset() {
  const toolbar = document.querySelector(".wiki-editor__toolbar-mount");
  if (!toolbar || typeof toolbar.getBoundingClientRect !== "function") {
    return 12;
  }

  const rect = toolbar.getBoundingClientRect();
  return Math.max(12, Math.ceil(rect.height + 12));
}

export function navigateToHeading({ item, surface, editor }) {
  const heading = getHeadingElement({ item, surface, editor });
  if (!heading || typeof heading.getBoundingClientRect !== "function") {
    return false;
  }

  const scrollParent = getScrollParent(heading);
  const offset = getTopOffset();
  const headingRect = heading.getBoundingClientRect();

  if (scrollParent === window) {
    const currentTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    window.scrollTo({
      top: Math.max(0, Math.round(currentTop + headingRect.top - offset)),
      behavior: "smooth"
    });
    return true;
  }

  const parentRect = scrollParent.getBoundingClientRect();
  scrollParent.scrollTo({
    top: Math.max(0, Math.round(scrollParent.scrollTop + headingRect.top - parentRect.top - offset)),
    behavior: "smooth"
  });
  return true;
}
