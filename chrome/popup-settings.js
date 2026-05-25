"use strict";

const DEFAULTS = { fontSize: 22, letterSpacing: 2, padding: 10, verticalOffset: 8, theme: "dark" };
const SLIDER_KEYS = ["fontSize", "letterSpacing", "padding", "verticalOffset"];

// ── Slider + number input binding ──────────────────────────────────────────────
function bindSlider(key) {
  const slider  = document.getElementById(key);
  const numInput = document.getElementById(key + "Input");
  const display = document.getElementById(key + "Val");

  function commit(raw) {
    const v = Math.min(parseFloat(numInput.max), Math.max(parseFloat(numInput.min), parseFloat(raw)));
    if (isNaN(v)) return;
    slider.value    = v;
    numInput.value  = v;
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
  // Theme toggle
  const theme = result.theme || DEFAULTS.theme;
  const themeEl = document.getElementById("theme" + theme.charAt(0).toUpperCase() + theme.slice(1));
  if (themeEl) themeEl.checked = true;

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked) chrome.storage.sync.set({ theme: radio.value });
    });
  });

  // Sliders
  for (const key of SLIDER_KEYS) {
    const val = result[key] ?? DEFAULTS[key];
    document.getElementById(key).value           = val;
    document.getElementById(key + "Val").textContent = val;
    document.getElementById(key + "Input").value = val;
    bindSlider(key);
  }
});

// ── Dictionary status ──────────────────────────────────────────────────────────
const statusEl = document.getElementById("dictStatus");
const resetBtn  = document.getElementById("resetBtn");

function showDictStatus(name) {
  if (name) {
    statusEl.textContent = "Using: " + name;
    statusEl.className   = "status active";
    resetBtn.style.display = "block";
  } else {
    statusEl.textContent = "No dictionary loaded";
    statusEl.className   = "status";
    resetBtn.style.display = "none";
  }
}

chrome.storage.local.get("customDictName", r => showDictStatus(r.customDictName || null));

// ── Upload ─────────────────────────────────────────────────────────────────────
document.getElementById("uploadBtn").addEventListener("click", () => {
  document.getElementById("dictFile").click();
});

document.getElementById("dictFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  statusEl.textContent = "Loading…";
  statusEl.className   = "status";

  const reader = new FileReader();
  reader.onload = () => {
    chrome.storage.local.get("dictRev", r => {
      chrome.storage.local.set({
        customDict:     reader.result,
        customDictName: file.name,
        dictRev:        (r.dictRev || 0) + 1,
      }, () => {
        if (chrome.runtime.lastError) {
          statusEl.textContent = "Save failed: " + chrome.runtime.lastError.message;
          statusEl.className   = "status";
        } else {
          showDictStatus(file.name);
        }
      });
    });
  };
  reader.onerror = () => {
    statusEl.textContent = "Error reading file";
    statusEl.className   = "status";
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ── Reset ──────────────────────────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  chrome.storage.local.get("dictRev", r => {
    // Bump rev first so content scripts reload, then remove the data
    chrome.storage.local.set({ dictRev: (r.dictRev || 0) + 1 }, () => {
      chrome.storage.local.remove(["customDict", "customDictName"], () => {
        showDictStatus(null);
      });
    });
  });
});
