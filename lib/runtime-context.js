(function exposeRuntimeContext(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleRuntimeContext = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRuntimeContext() {
  "use strict";

  function hasContext(runtime) {
    try {
      return Boolean(runtime?.id);
    } catch (_error) {
      return false;
    }
  }

  function isInvalidated(error, runtime) {
    if (!hasContext(runtime)) return true;
    return /extension context invalidated/i.test(String(error?.message || error || ""));
  }

  async function sendMessageSafely(runtime, message, onInvalidated) {
    if (!hasContext(runtime)) {
      onInvalidated?.();
      return false;
    }
    try {
      await runtime.sendMessage(message);
      return true;
    } catch (error) {
      if (isInvalidated(error, runtime)) onInvalidated?.();
      return false;
    }
  }

  return { hasContext, isInvalidated, sendMessageSafely };
});
