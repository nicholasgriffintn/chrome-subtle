(function exposePopupStateStore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePopupStateStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPopupStateStore() {
  "use strict";

  function create(options) {
    const delayMs = Number(options.delayMs) || 160;
    const statusDurationMs = Number(options.statusDurationMs) || 900;
    const timers = options.timers || globalThis;
    let pendingState;
    let pendingVersion = 0;
    let saveTimer;
    let statusTimer;

    function queue(state) {
      pendingState = state;
      pendingVersion += 1;
      showStatus("Saving…");
      timers.clearTimeout(saveTimer);
      saveTimer = timers.setTimeout(() => flush().catch(() => {}), delayMs);
    }

    function save(state) {
      pendingState = state;
      pendingVersion += 1;
      return flush();
    }

    function flush() {
      timers.clearTimeout(saveTimer);
      saveTimer = undefined;
      if (pendingState === undefined) return Promise.resolve();
      const state = pendingState;
      const version = pendingVersion;
      pendingState = undefined;
      showStatus("Saving…");

      let write;
      try {
        write = options.storageArea.set({ [options.storageKey]: state });
      } catch (error) {
        return fail(error, version);
      }
      return Promise.resolve(write).then(() => {
        if (version !== pendingVersion) return;
        showStatus("Saved");
        statusTimer = timers.setTimeout(() => {
          if (version === pendingVersion) options.onStatus("");
        }, statusDurationMs);
      }).catch((error) => fail(error, version));
    }

    function fail(error, version) {
      if (version === pendingVersion) showStatus(error?.message || "Unable to save settings.");
      return Promise.reject(error);
    }

    function showStatus(status) {
      timers.clearTimeout(statusTimer);
      statusTimer = undefined;
      options.onStatus(status);
    }

    return { queue, save, flush };
  }

  return { create };
});
