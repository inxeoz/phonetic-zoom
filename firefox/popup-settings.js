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
  // Theme toggle
  const theme = result.theme || DEFAULTS.theme;
  const themeEl = document.getElementById("theme" + theme.charAt(0).toUpperCase() + theme.slice(1));
  if (themeEl) themeEl.checked = true;

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked) browser.storage.sync.set({ theme: radio.value });
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

browser.storage.local.get("customDictName").then(r => showDictStatus(r.customDictName || null));

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
    browser.storage.local.get("dictRev").then(r => {
      browser.storage.local.set({
        customDict:     reader.result,
        customDictName: file.name,
        dictRev:        (r.dictRev || 0) + 1,
      }).then(() => showDictStatus(file.name))
        .catch(err => {
          statusEl.textContent = "Save failed: " + err.message;
          statusEl.className   = "status";
        });
    }).catch(err => {
      statusEl.textContent = "Save failed: " + err.message;
      statusEl.className   = "status";
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
  browser.storage.local.get("dictRev").then(r => {
    // Bump rev first so content scripts reload, then remove the data
    browser.storage.local.set({ dictRev: (r.dictRev || 0) + 1 })
      .then(() => browser.storage.local.remove(["customDict", "customDictName"]))
      .then(() => showDictStatus(null))
      .catch(err => {
        statusEl.textContent = "Reset failed: " + err.message;
        statusEl.className   = "status";
      });
  }).catch(err => {
    statusEl.textContent = "Reset failed: " + err.message;
    statusEl.className   = "status";
  });
});
