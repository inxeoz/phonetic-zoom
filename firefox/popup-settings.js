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
    browser.storage.sync.set({ [key]: v });
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
browser.storage.sync.get(Object.keys(DEFAULTS)).then(result => {
  const theme = result.theme || DEFAULTS.theme;
  const themeEl = document.getElementById("theme" + theme.charAt(0).toUpperCase() + theme.slice(1));
  if (themeEl) themeEl.checked = true;

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked) browser.storage.sync.set({ theme: radio.value });
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
browser.storage.local.get(["customDictUrl", "customDictName"]).then(r => {
  if (r.customDictUrl) dictUrlEl.value = r.customDictUrl;
  showDictStatus(r.customDictName || null);
});

// ── URL loader ─────────────────────────────────────────────────────────────────
// Firefox blocks both fetch() and tabs.create() for file:// URLs from extension
// pages. Only way in: find an already-open tab at that URL and inject into it.
// The user must open the file in Firefox once (drag to address bar, or
// File → Open File), then click Load.
function readFileViaTab(url) {
  return browser.tabs.query({ url }).then(tabs => {
    if (!tabs.length) {
      throw new Error(
        "File not open in Firefox — drag it to the address bar (or File → Open File), then click Load"
      );
    }
    return browser.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => document.body.innerText,
    }).then(([{ result }]) => result);
  });
}

function loadUrl(url) {
  if (url.startsWith("file://")) return readFileViaTab(url);
  return fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
}

// ── Save helper ────────────────────────────────────────────────────────────────
function saveDict(text, name, url) {
  return browser.storage.local.get("dictRev").then(r =>
    browser.storage.local.set({
      customDict:     text,
      customDictName: name,
      customDictUrl:  url,
      dictRev:        (r.dictRev || 0) + 1,
    }).then(() => {
      if (url) dictUrlEl.value = url;
      showDictStatus(name);
    })
  ).catch(err => {
    statusEl.textContent = "Save failed: " + err.message;
    statusEl.className   = "status";
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
  browser.storage.local.get("dictRev").then(r =>
    browser.storage.local.set({ dictRev: (r.dictRev || 0) + 1 })
      .then(() => browser.storage.local.remove(["customDict", "customDictName", "customDictUrl"]))
      .then(() => {
        dictUrlEl.value = "";
        showDictStatus(null);
      })
      .catch(err => {
        statusEl.textContent = "Reset failed: " + err.message;
        statusEl.className   = "status";
      })
  ).catch(err => {
    statusEl.textContent = "Reset failed: " + err.message;
    statusEl.className   = "status";
  });
});
