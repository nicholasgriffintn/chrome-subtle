(function exposeSubtleImports(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleImports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleImports() {
  "use strict";

  const MAX_FILE_BYTES = 2_000_000;
  const ACCEPTED_EXTENSION = /\.(srt|vtt)$/i;

  function getFileError(file) {
    if (!file) return "Choose an SRT or VTT subtitle file.";
    if (!ACCEPTED_EXTENSION.test(file.name || "")) return "Use an .srt or .vtt file.";
    if (file.size > MAX_FILE_BYTES) return "Subtitle files must be smaller than 2 MB.";
    return "";
  }

  async function trackFromFile(file) {
    const error = getFileError(file);
    if (error) throw new Error(error);
    const text = await file.text();
    if (!text.trim()) throw new Error("That subtitle file is empty.");
    return { name: String(file.name).slice(0, 180), text };
  }

  return { MAX_FILE_BYTES, getFileError, trackFromFile };
});
