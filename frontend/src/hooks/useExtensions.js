import { useEffect, useRef, useState } from "react";

// A web page can't list the browser's extensions. What it can see is what extensions
// do to the page: elements, styles and attributes they inject (writing assistants,
// AI sidebars, translators, dark-mode tools...). Extensions that never touch the page
// stay invisible, so this is a best-effort check.

const EXTENSION_URL = /^(chrome|moz|safari-web|ms-browser)-extension:\/\//i;

// Substrings seen in the elements/attributes of common extensions -> a readable name.
const KNOWN = [
  [/grammarly|data-gr-|gr-c-s/, "Grammarly"],
  [/languagetool|data-lt-|lt-toolbar/, "LanguageTool"],
  [/quillbot/, "QuillBot"],
  [/darkreader/, "Dark Reader"],
  [/monica/, "Monica"],
  [/sider/, "Sider"],
  [/merlin/, "Merlin"],
  [/maxai|max-ai/, "MaxAI"],
  [/harpa/, "HARPA AI"],
  [/chatgpt|openai/, "a ChatGPT extension"],
  [/copilot/, "a Copilot extension"],
  [/gemini|bard/, "a Gemini extension"],
  [/claude/, "a Claude extension"],
  [/wordtune/, "Wordtune"],
  [/loom/, "Loom"],
  [/cz-shortcut|colorzilla/, "ColorZilla"],
  [/goog-gt|translated-ltr|translated-rtl|skiptranslate/, "page translation"],
];

// Our own page: what is allowed at the top level of <html> and <body>.
const OWN_BODY_TAGS = new Set(["SCRIPT", "NOSCRIPT", "STYLE", "LINK", "TEMPLATE", "VITE-ERROR-OVERLAY"]);
const OWN_ATTRS = new Set(["lang", "class", "style", "dir"]);

function describe(el) {
  const attrs = [...(el.attributes || [])].map((a) => `${a.name}=${a.value}`).join(" ");
  return `${el.tagName} ${attrs}`.toLowerCase();
}

function nameFor(text) {
  for (const [re, name] of KNOWN) if (re.test(text)) return name;
  return null;
}

/** Names of extensions that have left traces in the page (empty when none were found). */
export function detectExtensions() {
  if (typeof document === "undefined") return [];
  const found = new Set();
  const add = (text) => found.add(nameFor(text) || "an unknown browser extension");

  // 1. Anything loaded from an extension's own URL.
  for (const el of document.querySelectorAll("[src],[href]")) {
    const url = el.getAttribute("src") || el.getAttribute("href") || "";
    if (EXTENSION_URL.test(url)) add(describe(el) + " " + url);
  }

  // 2. Elements added next to the app instead of inside it.
  const root = document.getElementById("root");
  const tops = [...document.documentElement.children, ...(document.body?.children || [])];
  for (const el of tops) {
    if (el === document.head || el === document.body || el === root || OWN_BODY_TAGS.has(el.tagName)) continue;
    add(describe(el));
  }

  // 3. Custom elements anywhere (the app uses none; extensions often build their UI from them).
  for (const el of document.querySelectorAll("*")) {
    if (el.tagName.includes("-") && !OWN_BODY_TAGS.has(el.tagName)) add(describe(el));
  }

  // 4. Marks extensions leave on <html>/<body>, and styles they inject into <head>.
  for (const el of [document.documentElement, document.body].filter(Boolean)) {
    for (const a of el.attributes) {
      if (OWN_ATTRS.has(a.name)) {
        const name = nameFor(`${a.name}=${a.value}`.toLowerCase());
        if (name) found.add(name);
      } else if (a.name !== "data-theme") {
        add(`${a.name}=${a.value}`.toLowerCase());
      }
    }
  }
  for (const el of document.head?.children || []) {
    const name = el.tagName === "META" ? null : nameFor(describe(el));
    if (name) found.add(name);
  }

  return [...found];
}

/**
 * Watches the page for extensions. `found` is the current list; `onNew(names)` (optional)
 * is called with the extensions not reported before, once per scan that finds any.
 */
export function useExtensionWatch({ onNew, enabled = true } = {}) {
  const [found, setFound] = useState(detectExtensions);
  const seenRef = useRef(new Set());
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    if (!enabled) return;
    let queued = null;
    const scan = () => {
      queued = null;
      const now = detectExtensions();
      setFound((prev) => (prev.join("|") === now.join("|") ? prev : now));
      const fresh = now.filter((name) => !seenRef.current.has(name));
      fresh.forEach((name) => seenRef.current.add(name));
      if (fresh.length) onNewRef.current?.(fresh);
    };
    // Watch the top of the page (where extensions inject; the app's own animations stay
    // inside #root), scanning once per burst, plus a slow sweep for anything deeper.
    const observer = new MutationObserver(() => {
      if (!queued) queued = setTimeout(scan, 250);
    });
    for (const el of [document.documentElement, document.head, document.body].filter(Boolean)) {
      observer.observe(el, { childList: true, attributes: el !== document.head });
    }
    const sweep = setInterval(scan, 4000);
    scan();
    return () => {
      observer.disconnect();
      clearTimeout(queued);
      clearInterval(sweep);
    };
  }, [enabled]);

  const recheck = () => setFound(detectExtensions());
  return { found, recheck };
}
