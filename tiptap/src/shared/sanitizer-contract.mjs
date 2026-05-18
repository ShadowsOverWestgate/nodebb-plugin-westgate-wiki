import DOMPurify from "dompurify";

import sanitizerConfig from "../../../shared/wiki-html-sanitizer-config.json" with { type: "json" };

export function compileAllowedStylesMap(configMap) {
  return Object.fromEntries(
    Object.entries(configMap || {}).map(function ([tagName, properties]) {
      return [
        tagName,
        Object.fromEntries(
          Object.entries(properties || {}).map(function ([propertyName, patterns]) {
            return [propertyName, (patterns || []).map(function (pattern) { return new RegExp(pattern, "i"); })];
          })
        )
      ];
    })
  );
}

function getAllowedAttributesList() {
  const attrs = new Set(["href", "target", "rel", "src", "alt", "title", "width", "height", "type", "checked", "disabled"]);
  Object.values(sanitizerConfig.allowedAttributes || {}).forEach(function (list) {
    (list || []).forEach(function (name) {
      if (!name.endsWith("*")) {
        attrs.add(name);
      }
    });
  });
  return Array.from(attrs);
}

export const COMPILED_ALLOWED_STYLES = compileAllowedStylesMap(sanitizerConfig.allowedStyles);
const BORDER_SHORTHAND_SIDE_PROPERTIES = {
  "border-color": [
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color"
  ],
  "border-width": [
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width"
  ]
};

export const DOMPURIFY_OPTIONS = {
  ALLOWED_TAGS: sanitizerConfig.allowedTags,
  ALLOWED_ATTR: getAllowedAttributesList(),
  ALLOW_DATA_ATTR: true
};

export function sanitizeAnchorTargets(root) {
  root.querySelectorAll("a[href]").forEach(function (link) {
    if (link.getAttribute("target") === "_blank" && !link.getAttribute("rel")) {
      link.setAttribute("rel", "noopener noreferrer");
    }
  });
}

export function sanitizeStyleAttribute(styleValue, tagName) {
  const probe = document.createElement("span");
  probe.setAttribute("style", String(styleValue || ""));

  const allowedForAnyTag = COMPILED_ALLOWED_STYLES["*"] || {};
  const allowedForTag = COMPILED_ALLOWED_STYLES[String(tagName || "").toLowerCase()] || {};
  const entries = [];
  const borderSideValues = new Map(Object.keys(BORDER_SHORTHAND_SIDE_PROPERTIES).map(function (propertyName) {
    return [propertyName, new Map()];
  }));
  const emittedBorderShorthands = new Set();

  for (let i = 0; i < probe.style.length; i += 1) {
    const propertyName = String(probe.style[i] || "").trim().toLowerCase();
    if (!propertyName) {
      continue;
    }

    const rawValue = probe.style.getPropertyValue(propertyName).trim();
    const propertyAllowlist = allowedForTag[propertyName] || allowedForAnyTag[propertyName];
    const borderShorthandName = Object.keys(BORDER_SHORTHAND_SIDE_PROPERTIES).find(function (shorthandName) {
      return BORDER_SHORTHAND_SIDE_PROPERTIES[shorthandName].includes(propertyName);
    });
    const borderShorthandAllowlist = borderShorthandName ? allowedForTag[borderShorthandName] || allowedForAnyTag[borderShorthandName] : null;
    if (!propertyAllowlist || !rawValue) {
      if (borderShorthandName && borderShorthandAllowlist && rawValue) {
        const normalizedValue = rawValue.replace(/\s+/g, " ").trim();
        const allowed = borderShorthandAllowlist.some(function (pattern) {
          return pattern.test(normalizedValue);
        });
        if (allowed) {
          borderSideValues.get(borderShorthandName).set(propertyName, normalizedValue);
        }
      }
      continue;
    }

    const normalizedValue = rawValue.replace(/\s+/g, " ").trim();
    const allowed = propertyAllowlist.some(function (pattern) {
      return pattern.test(normalizedValue);
    });
    if (allowed) {
      entries.push(`${propertyName}: ${normalizedValue}`);
      if (BORDER_SHORTHAND_SIDE_PROPERTIES[propertyName]) {
        emittedBorderShorthands.add(propertyName);
      }
    }
  }

  Object.entries(BORDER_SHORTHAND_SIDE_PROPERTIES).forEach(function ([shorthandName, sideProperties]) {
    const sideValues = borderSideValues.get(shorthandName);
    if (emittedBorderShorthands.has(shorthandName) || sideValues.size !== sideProperties.length) {
      return;
    }
    const values = sideProperties.map(function (propertyName) {
      return sideValues.get(propertyName);
    });
    const [firstValue] = values;
    if (firstValue && values.every(function (value) { return value === firstValue; })) {
      entries.push(`${shorthandName}: ${firstValue}`);
    }
  });

  return entries.join("; ");
}

export function sanitizeInlineStyles(root) {
  root.querySelectorAll("[style]").forEach(function (element) {
    const sanitizedStyle = sanitizeStyleAttribute(element.getAttribute("style"), element.tagName.toLowerCase());
    if (sanitizedStyle) {
      element.setAttribute("style", sanitizedStyle);
    } else {
      element.removeAttribute("style");
    }
  });
}

function isIgnorableTopLevelNode(node) {
  return node && (
    node.nodeType === Node.COMMENT_NODE ||
    (node.nodeType === Node.TEXT_NODE && !String(node.nodeValue || "").trim())
  );
}

function isTopLevelInfoboxElement(node) {
  return !!(
    node &&
    node.nodeType === Node.ELEMENT_NODE &&
    node.matches &&
    node.matches('aside.wiki-infobox, aside[data-wiki-node="infobox"]')
  );
}

export function hoistTopLevelInfoboxes(root) {
  if (!root) {
    return;
  }

  const infoboxes = Array.from(root.children || []).filter(isTopLevelInfoboxElement);
  if (!infoboxes.length) {
    return;
  }

  let anchor = root.firstChild;
  while (anchor && isIgnorableTopLevelNode(anchor)) {
    anchor = anchor.nextSibling;
  }

  infoboxes.forEach(function (infobox) {
    if (infobox === anchor) {
      anchor = infobox.nextSibling;
      return;
    }
    root.insertBefore(infobox, anchor);
    anchor = infobox.nextSibling;
  });
}

export function sanitizeHtml(html) {
  const clean = DOMPurify.sanitize(String(html || ""), DOMPURIFY_OPTIONS);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${clean}</div>`, "text/html");
  sanitizeAnchorTargets(doc.body);
  sanitizeInlineStyles(doc.body);
  hoistTopLevelInfoboxes(doc.body.firstElementChild);
  return doc.body.innerHTML.trim();
}
