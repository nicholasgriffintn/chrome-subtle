(function exposeSubtleNativeCaptionFilters(root, factory) {
  const api = factory(root.SubtleCues);
  if (typeof module === "object" && module.exports) module.exports = factory(require("./cues.js"));
  else root.SubtleNativeCaptionFilters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleNativeCaptionFilters(SubtleCues) {
  "use strict";

  function create() {
    let trackedCaptions = new Map();

    function apply(captions, filters) {
      const nextTrackedCaptions = new Map();
      for (const caption of captions || []) {
        if (!caption || caption.isConnected === false) continue;
        const currentText = String(caption.textContent || "");
        const previous = trackedCaptions.get(caption);
        const sourceText = previous && currentText === previous.renderedText
          ? previous.sourceText
          : currentText;
        const filteredText = SubtleCues.filterCueText(sourceText, filters);
        const canReplaceText = !Number(caption.childElementCount);
        const blocked = Boolean(sourceText.trim()) && !filteredText.trim();
        const renderedText = blocked || !canReplaceText ? sourceText : filteredText;

        caption.classList?.toggle("subtle-blocked-caption", blocked);
        if (blocked || (canReplaceText && renderedText !== sourceText)) {
          nextTrackedCaptions.set(caption, { sourceText, renderedText });
          if (currentText !== renderedText) caption.textContent = renderedText;
        } else if (previous && currentText === previous.renderedText) {
          caption.textContent = sourceText;
        }
      }

      for (const [caption, previous] of trackedCaptions) {
        if (nextTrackedCaptions.has(caption)) continue;
        restoreCaption(caption, previous);
      }
      trackedCaptions = nextTrackedCaptions;
    }

    function clear() {
      for (const [caption, previous] of trackedCaptions) restoreCaption(caption, previous);
      trackedCaptions.clear();
    }

    return { apply, clear };
  }

  function restoreCaption(caption, previous) {
    if (caption?.isConnected !== false && String(caption?.textContent || "") === previous.renderedText) {
      caption.textContent = previous.sourceText;
    }
    caption?.classList?.remove("subtle-blocked-caption");
  }

  return { create };
});
