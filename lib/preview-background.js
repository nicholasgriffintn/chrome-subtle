(function exposeSubtlePreviewBackground(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePreviewBackground = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtlePreviewBackground() {
  "use strict";

  const MAX_CAPTURE_LENGTH = 8_000_000;

  async function capture(tabsApi, windowId) {
    if (!tabsApi?.captureVisibleTab || !Number.isInteger(windowId)) return null;
    try {
      const image = await tabsApi.captureVisibleTab(windowId, { format: "jpeg", quality: 45 });
      return isLocalImage(image) ? image : null;
    } catch (_error) {
      return null;
    }
  }

  function isLocalImage(value) {
    return typeof value === "string"
      && value.length <= MAX_CAPTURE_LENGTH
      && /^data:image\/(?:jpeg|png);base64,[a-z0-9+/=]+$/i.test(value);
  }

  return { capture };
});
