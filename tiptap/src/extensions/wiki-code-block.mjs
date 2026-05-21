import { mergeAttributes, textblockTypeInputRule } from "@tiptap/core";
import { backtickInputRegex, tildeInputRegex } from "@tiptap/extension-code-block";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import powershell from "highlight.js/lib/languages/powershell";
import { common, createLowlight } from "lowlight";

export const codeBlockLowlight = createLowlight(common);
codeBlockLowlight.register({ powershell });

export const CODE_BLOCK_LANGUAGE_OPTIONS = [
  { value: "", label: "Plain text" },
  { value: "bash", label: "Bash / shell" },
  { value: "powershell", label: "PowerShell" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML / XML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "csharp", label: "C#" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "diff", label: "Diff" },
  { value: "ini", label: "INI / TOML" },
  { value: "lua", label: "Lua" },
  { value: "plaintext", label: "Plain text" }
];

const CODE_BLOCK_LANGUAGE_ALIASES = new Map([
  ["text", "plaintext"],
  ["txt", "plaintext"],
  ["plain", "plaintext"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["zsh", "bash"],
  ["pwsh", "powershell"],
  ["ps", "powershell"],
  ["ps1", "powershell"],
  ["js", "javascript"],
  ["jsx", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["htm", "html"],
  ["xhtml", "html"],
  ["xml", "html"],
  ["svg", "html"],
  ["cs", "csharp"],
  ["c#", "csharp"],
  ["cc", "cpp"],
  ["c++", "cpp"],
  ["cxx", "cpp"],
  ["hpp", "cpp"],
  ["py", "python"],
  ["rb", "ruby"],
  ["rs", "rust"],
  ["golang", "go"],
  ["yml", "yaml"],
  ["md", "markdown"],
  ["mkd", "markdown"],
  ["patch", "diff"],
  ["toml", "ini"]
]);

CODE_BLOCK_LANGUAGE_OPTIONS.forEach(function (option) {
  if (option.value) {
    CODE_BLOCK_LANGUAGE_ALIASES.set(option.value, option.value);
  }
});

export function normalizeCodeBlockLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) {
    return null;
  }

  const language = CODE_BLOCK_LANGUAGE_ALIASES.get(key) || key;
  return codeBlockLowlight.registered(language) ? language : null;
}

function readLanguageFromElement(element, prefix) {
  const candidates = [
    element && element.firstElementChild,
    element
  ].filter(Boolean);

  for (const candidate of candidates) {
    const classNames = Array.from(candidate.classList || []);
    const languageClass = classNames.find(function (className) {
      return className.startsWith(prefix);
    });
    const language = languageClass ? normalizeCodeBlockLanguage(languageClass.slice(prefix.length)) : null;
    if (language) {
      return language;
    }
  }
  return null;
}

const WikiCodeBlock = CodeBlockLowlight.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight: codeBlockLowlight,
      languageClassPrefix: "language-",
      enableTabIndentation: true,
      tabSize: 2
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: null,
        parseHTML: element => readLanguageFromElement(element, this.options.languageClassPrefix),
        rendered: false
      }
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const language = normalizeCodeBlockLanguage(node.attrs.language);
    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      [
        "code",
        {
          class: language ? `${this.options.languageClassPrefix}${language}` : null
        },
        0
      ]
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCodeBlockLanguage: language => ({ commands, editor }) => {
        if (!editor.isActive(this.name)) {
          return false;
        }
        return commands.updateAttributes(this.name, {
          language: normalizeCodeBlockLanguage(language)
        });
      }
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: backtickInputRegex,
        type: this.type,
        getAttributes: match => ({
          language: normalizeCodeBlockLanguage(match[1])
        })
      }),
      textblockTypeInputRule({
        find: tildeInputRegex,
        type: this.type,
        getAttributes: match => ({
          language: normalizeCodeBlockLanguage(match[1])
        })
      })
    ];
  }
});

export default WikiCodeBlock;
