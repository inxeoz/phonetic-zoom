"use strict";
// Open settings as a full tab so OS drag-and-drop into the drop zone works.
// Extension popups are sandboxed windows that reject file manager drags.
chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("popup.html");
  chrome.tabs.query({ url }, existing => {
    if (existing.length) {
      chrome.tabs.update(existing[0].id, { active: true });
    } else {
      chrome.tabs.create({ url });
    }
  });
});
