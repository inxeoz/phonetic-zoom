"use strict";

const DEFAULTS = { fontSize: 22, letterSpacing: 2, padding: 10, verticalOffset: 8, theme: "dark" };
const SLIDER_KEYS = ["fontSize", "letterSpacing", "padding", "verticalOffset"];

// ── Slider + number input binding ──────────────────────────────────────────────
function bindSlider(key) {
  const slider   = document.getElementById(key);
  const numInput = document.getElementById(key + "Input");
  const display  = document.getElementById(key + "Val");

  function commit(raw) {
    const v = Math.min(parseFloat(numInput.max), Math.max(parseFloat(numInput.min), parseFloat(raw)));
    if (isNaN(v)) return;
    slider.value        = v;
    numInput.value      = v;
    display.textContent = v;
    chrome.storage.sync.set({ [key]: v });
  }

  slider.addEventListener("input", () => {
    display.textContent = slider.value;
    numInput.value = slider.value;
  });
  slider.addEventListener("change", () => commit(slider.value));

  numInput.addEventListener("input", () => {
    const v = parseFloat(numInput.value);
    if (!isNaN(v)) { slider.value = v; display.textContent = v; }
  });
  numInput.addEventListener("change", () => commit(numInput.value));
}

// ── Load saved settings ────────────────────────────────────────────────────────
chrome.storage.sync.get(Object.keys(DEFAULTS), result => {
  const theme = result.theme || DEFAULTS.theme;
  const themeEl = document.getElementById("theme" + theme.charAt(0).toUpperCase() + theme.slice(1));
  if (themeEl) themeEl.checked = true;

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked) chrome.storage.sync.set({ theme: radio.value });
    });
  });

  for (const key of SLIDER_KEYS) {
    const val = result[key] ?? DEFAULTS[key];
    document.getElementById(key).value               = val;
    document.getElementById(key + "Val").textContent = val;
    document.getElementById(key + "Input").value     = val;
    bindSlider(key);
  }
});

// ── Dictionary ─────────────────────────────────────────────────────────────────
const statusEl  = document.getElementById("dictStatus");
const resetBtn  = document.getElementById("resetBtn");
const dictUrlEl = document.getElementById("dictUrl");

function showDictStatus(name) {
  if (name) {
    statusEl.textContent   = "Using: " + name;
    statusEl.className     = "status active";
    resetBtn.style.display = "block";
  } else {
    statusEl.textContent   = "No dictionary loaded";
    statusEl.className     = "status";
    resetBtn.style.display = "none";
  }
}

// Restore last-used URL and dict name on open
chrome.storage.local.get(["customDictUrl", "customDictName"], r => {
  if (r.customDictUrl) dictUrlEl.value = r.customDictUrl;
  showDictStatus(r.customDictName || null);
});

// ── URL loader ─────────────────────────────────────────────────────────────────
// Chrome blocks tabs.create() for file:// URLs from extension pages.
// Workaround: query an already-open tab at that URL and inject into it.
// Also requires "Allow access to file URLs" enabled in chrome://extensions.
function readFileViaTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url }, tabs => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!tabs.length) {
        reject(new Error(
          "File not open in Chrome — open it in a tab first, and enable " +
          '"Allow access to file URLs" in chrome://extensions'
        ));
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => document.body.innerText,
      }).then(([{ result }]) => resolve(result))
        .catch(err => reject(new Error(err.message)));
    });
  });
}

// Rewrite github.com blob URLs → raw.githubusercontent.com to avoid redirect
// CORS failures (e.g. github.com/.../blob/master/file.txt?raw=true).
function normalizeUrl(url) {
  const m = url.match(/^https?:\/\/github\.com\/([^/?#]+\/[^/?#]+)\/blob\/([^?#]+)/);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}`;
  return url;
}

function loadUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (url !== rawUrl) dictUrlEl.value = url;
  if (url.startsWith("file://")) return readFileViaTab(url);
  return fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
}

// ── Save helper ────────────────────────────────────────────────────────────────
function saveDict(text, name, url) {
  chrome.storage.local.get("dictRev", r => {
    chrome.storage.local.set({
      customDict:     text,
      customDictName: name,
      customDictUrl:  url,
      dictRev:        (r.dictRev || 0) + 1,
    }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Save failed: " + chrome.runtime.lastError.message;
        statusEl.className   = "status";
      } else {
        if (url) dictUrlEl.value = url;
        showDictStatus(name);
      }
    });
  });
}

// ── Load button ────────────────────────────────────────────────────────────────
document.getElementById("loadBtn").addEventListener("click", () => {
  const url = dictUrlEl.value.trim();
  if (!url) return;

  statusEl.textContent = "Loading…";
  statusEl.className   = "status";

  loadUrl(url)
    .then(text => saveDict(text, url.split("/").pop() || url, url))
    .catch(err => {
      statusEl.textContent = "Load failed: " + err.message;
      statusEl.className   = "status";
    });
});

// ── Drag & drop ────────────────────────────────────────────────────────────────
const dropZone = document.getElementById("dropZone");

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));

dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  const file = e.dataTransfer.files[0];
  if (file) {
    statusEl.textContent = "Loading…";
    statusEl.className   = "status";
    const reader = new FileReader();
    reader.onload  = () => saveDict(reader.result, file.name, "");
    reader.onerror = () => { statusEl.textContent = "Error reading file"; statusEl.className = "status"; };
    reader.readAsText(file);
    return;
  }

  const url = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")).trim();
  if (url) {
    dictUrlEl.value      = url;
    statusEl.textContent = "Loading…";
    statusEl.className   = "status";
    loadUrl(url)
      .then(text => saveDict(text, url.split("/").pop() || url, url))
      .catch(err => { statusEl.textContent = "Load failed: " + err.message; statusEl.className = "status"; });
  }
});

// ── Reset ──────────────────────────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  chrome.storage.local.get("dictRev", r => {
    chrome.storage.local.set({ dictRev: (r.dictRev || 0) + 1 }, () => {
      chrome.storage.local.remove(["customDict", "customDictName", "customDictUrl"], () => {
        if (chrome.runtime.lastError) {
          statusEl.textContent = "Reset failed: " + chrome.runtime.lastError.message;
          statusEl.className   = "status";
        } else {
          dictUrlEl.value = "";
          showDictStatus(null);
        }
      });
    });
  });
});
