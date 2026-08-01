(function exposeSubtlePreviewLayout(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePreviewLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtlePreviewLayout() {
  "use strict";

  function fit(stage, windowLayer, content) {
    if (!stage || !windowLayer || !content) return 1;
    windowLayer.style.setProperty("--preview-content-scale", "1");
    const clearance = windowLayer.classList.contains("is-top") ? 46 : 36;
    const scale = scaleForBounds(content.scrollHeight, stage.clientHeight - clearance);
    windowLayer.style.setProperty("--preview-content-scale", String(scale));
    return scale;
  }

  function scaleForBounds(contentHeight, availableHeight) {
    const content = Number(contentHeight);
    const available = Number(availableHeight);
    if (!Number.isFinite(content) || !Number.isFinite(available) || content <= 0 || available <= 0) return 1;
    return Math.min(1, Math.max(0.25, available / content));
  }

  return { fit, scaleForBounds };
});
