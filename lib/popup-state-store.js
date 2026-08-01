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
    let writeInProgress = false;
    const writeQueue = [];

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
      return persist(state, version);
    }

    function persist(state, version) {
      return new Promise((resolve, reject) => {
        writeQueue.push({ state, version, resolve, reject });
        drainWrites();
      });
    }

    function drainWrites() {
      if (writeInProgress || !writeQueue.length) return;
      writeInProgress = true;
      const entry = writeQueue.shift();
      let write;
      try {
        write = options.storageArea.set({ [options.storageKey]: entry.state });
      } catch (error) {
        finishWrite(entry, error);
        return;
      }
      return Promise.resolve(write).then(() => {
        if (entry.version === pendingVersion) {
          showStatus("Saved");
          statusTimer = timers.setTimeout(() => {
            if (entry.version === pendingVersion) options.onStatus("");
          }, statusDurationMs);
        }
        finishWrite(entry);
      }, (error) => finishWrite(entry, error));
    }

    function finishWrite(entry, error) {
      if (error) {
        if (entry.version === pendingVersion) showStatus(error?.message || "Unable to save settings.");
        entry.reject(error);
      } else {
        entry.resolve();
      }
      writeInProgress = false;
      drainWrites();
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
