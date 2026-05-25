"use strict";

// ── Popup element ──────────────────────────────────────────────────────────────
const popup = document.createElement("div");
popup.id = "word-hover-popup";
document.body.appendChild(popup);

// ── 20-color palette ───────────────────────────────────────────────────────────
const COLORS = [
  "#ef4444","#3b82f6","#10b981","#f59e0b","#8b5cf6",
  "#06b6d4","#f97316","#64748b","#14b8a6","#dc2626",
  "#2563eb","#16a34a","#7c3aed","#ea580c","#0891b2",
  "#e11d48","#0ea5e9","#65a30d","#d946ef","#ca8a04",
];

// ── Themes ─────────────────────────────────────────────────────────────────────
const THEMES = {
  dark:  { bg: "#1f2937", fg: "#f9fafb", shadow: "rgba(0,0,0,0.40)" },
  light: { bg: "#ffffff", fg: "#1f2937", shadow: "rgba(0,0,0,0.15)" },
};

// ── Settings ───────────────────────────────────────────────────────────────────
const SETTING_KEYS = ["fontSize","letterSpacing","padding","verticalOffset","theme","useDefault"];
const DEFAULTS     = { fontSize: 22, letterSpacing: 2, padding: 10, verticalOffset: 8, theme: "dark", useDefault: true };
let settings = { ...DEFAULTS };

function resolveTheme() {
  if (settings.theme !== "auto") return settings.theme;
  const cs = getComputedStyle(document.documentElement).colorScheme;
  if (cs === "dark" || cs === "light") return cs;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applySettings() {
  const th = THEMES[resolveTheme()];
  popup.style.background    = th.bg;
  popup.style.color         = th.fg;
  popup.style.boxShadow     = `0 4px 20px ${th.shadow}`;
  popup.style.fontSize      = settings.fontSize + "px";
  popup.style.letterSpacing = settings.letterSpacing + "px";
  popup.style.padding       = settings.padding + "px";
}

chrome.storage.sync.get(SETTING_KEYS, r => {
  for (const k of SETTING_KEYS) {
    if (r[k] != null) settings[k] = r[k];
  }
  applySettings();
  rebuildDictionary();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    let dirty = false;
    for (const k of SETTING_KEYS) {
      if (k in changes) { settings[k] = changes[k].newValue ?? DEFAULTS[k]; dirty = true; }
    }
    if (dirty) { applySettings(); rebuildDictionary(); }
  }
  if (area === "local" && ("dictRev" in changes || "customDict" in changes)) {
    loadCustomDict().then(rebuildDictionary);
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (settings.theme === "auto") applySettings();
});

// ── Dictionary ─────────────────────────────────────────────────────────────────
let defaultDict = null;
let customDict  = null;
let dictionary  = null;

function parseDict(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 1) continue;
    const word = line.slice(0, tab).toLowerCase().trim();
    const raw  = line.slice(tab + 1).trim();
    if (!word || !raw) continue;
    const m = raw.match(/^\/(.+?)\/?$/);
    map.set(word, m ? m[1] : raw);
  }
  return map;
}

// custom entries override default ones for the same word
function rebuildDictionary() {
  if (settings.useDefault && defaultDict) {
    dictionary = customDict ? new Map([...defaultDict, ...customDict]) : defaultDict;
  } else {
    dictionary = customDict;
  }
  lastWord = null; // force re-render on next tick
}

function loadDefaultDict() {
  return fetch(chrome.runtime.getURL("default-dict.txt"))
    .then(r => r.text())
    .then(text => { defaultDict = parseDict(text); })
    .catch(() => { defaultDict = null; });
}

function loadCustomDict() {
  return new Promise(resolve => {
    chrome.storage.local.get("customDict", r => {
      customDict = r.customDict ? parseDict(r.customDict) : null;
      resolve();
    });
  });
}

Promise.all([loadDefaultDict(), loadCustomDict()]).then(rebuildDictionary);

// ── IPA rendering ──────────────────────────────────────────────────────────────
function charColor(ch) {
  return COLORS[ch.codePointAt(0) % COLORS.length];
}

function renderIPA(ipa) {
  const frag = document.createDocumentFragment();
  let stress = 0;

  for (const ch of ipa) {
    if (ch === "ˈ") { stress = 2; continue; }
    if (ch === "ˌ") { stress = 1; continue; }
    if (ch === "." || ch === " ") stress = 0;

    const span = document.createElement("span");
    span.textContent      = ch;
    span.style.color      = charColor(ch);
    span.style.fontWeight = stress === 2 ? "700" : stress === 1 ? "500" : "300";
    frag.appendChild(span);
  }

  return frag;
}

// ── Word extraction ────────────────────────────────────────────────────────────
const WORD_CHAR = /[\p{L}\p{N}'-]/u;

function getWordAt(x, y) {
  let node, offset;

  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    node   = pos.offsetNode;
    offset = pos.offset;
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return null;
    node   = range.startContainer;
    offset = range.startOffset;
  } else {
    return null;
  }

  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent;

  let start = offset, end = offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end]))  end++;

  const raw = text.slice(start, end).replace(/^[-']+|[-']+$/g, "").toLowerCase();
  return raw || null;
}

// ── Mouse tracking + RAF ───────────────────────────────────────────────────────
let mouseX = 0, mouseY = 0, pendingFrame = false, lastWord = null;

document.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!pendingFrame) {
    pendingFrame = true;
    requestAnimationFrame(tick);
  }
});

document.addEventListener("mouseleave", () => {
  popup.classList.remove("visible");
  lastWord = null;
});

document.addEventListener("scroll", () => {
  popup.classList.remove("visible");
  lastWord = null;
}, { capture: true, passive: true });

function tick() {
  pendingFrame = false;

  const word = getWordAt(mouseX, mouseY);

  if (!word || !dictionary || !dictionary.has(word)) {
    popup.classList.remove("visible");
    lastWord = null;
    return;
  }

  if (word !== lastWord) {
    popup.textContent = "";
    popup.appendChild(renderIPA(dictionary.get(word)));
    lastWord = word;
  }

  const vw   = window.innerWidth;
  const pw   = popup.offsetWidth;
  const left = Math.max(8, Math.min(mouseX - pw / 2, vw - pw - 8));
  popup.style.left = left + "px";
  popup.style.top  = (mouseY - settings.verticalOffset) + "px";
  popup.classList.add("visible");
}
