"use strict";
// Open settings as a full tab so OS drag-and-drop into the drop zone works.
// Extension popups are sandboxed windows that reject file manager drags.
browser.action.onClicked.addListener(() => {
  const url = browser.runtime.getURL("popup.html");
  browser.tabs.query({ url }).then(existing => {
    if (existing.length) {
      browser.tabs.update(existing[0].id, { active: true });
    } else {
      browser.tabs.create({ url });
    }
  });
});
