(function exposeSubtleLearnLauncher(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleLearnLauncher = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleLearnLauncher() {
  "use strict";

  function start(documentRef = document, chromeApi = chrome) {
    const button = documentRef.querySelector("#open-learn");
    const status = documentRef.querySelector("#learn-launcher-status");
    if (!button || !chromeApi?.sidePanel?.open) return;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await chromeApi.sidePanel.open({ windowId: chromeApi.windows.WINDOW_ID_CURRENT });
        window.close();
      } catch (_error) {
        status.textContent = "Learn could not open. Try Chrome 120 or newer.";
        button.disabled = false;
      }
    });
  }

  return { start };
});
