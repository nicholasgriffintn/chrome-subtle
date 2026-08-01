(function exposeSubtleState(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleState() {
  "use strict";

  const STORAGE_KEY = "subtleState";
  const MODES = new Set(["single", "dual"]);
  const SOURCES = new Set(["platform", "upload"]);
  const POSITIONS = new Set(["top", "bottom"]);
  const FONT_FAMILIES = new Set([
    "monospaced_serif",
    "proportional_serif",
    "monospaced_sans",
    "proportional_sans",
    "casual",
    "cursive",
    "small_caps"
  ]);
  const LEGACY_FONT_FAMILIES = Object.freeze({
    humanist: "proportional_sans",
    rounded: "casual",
    serif: "proportional_serif",
    mono: "monospaced_sans"
  });
  const EDGE_STYLES = new Set(["none", "drop_shadow", "raised", "depressed", "outline"]);

  const DEFAULT_STATE = Object.freeze({
    enabled: true,
    mode: "single",
    secondarySource: "platform",
    targetLanguage: "en",
    fontFamily: "proportional_sans",
    fontSize: 34,
    secondaryScale: 82,
    textColor: "#fffaf0",
    textOpacity: 100,
    secondaryColor: "#ffd36e",
    backgroundColor: "#0b1013",
    backgroundOpacity: 76,
    windowColor: "#000000",
    windowOpacity: 0,
    edgeStyle: "outline",
    outlineWidth: 3,
    position: "bottom",
    offset: 12,
    delayMs: 0,
    hideSoundCues: false,
    uploadedTrack: null
  });

  function createDefaultState() {
    return { ...DEFAULT_STATE };
  }

  function normaliseState(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_STATE.enabled,
      mode: pick(input.mode, MODES, DEFAULT_STATE.mode),
      secondarySource: normaliseSecondarySource(input.secondarySource),
      targetLanguage: normaliseLanguage(input.targetLanguage),
      fontFamily: normaliseFontFamily(input.fontFamily),
      fontSize: clampNumber(input.fontSize, 18, 64, DEFAULT_STATE.fontSize),
      secondaryScale: clampNumber(input.secondaryScale, 55, 110, DEFAULT_STATE.secondaryScale),
      textColor: normaliseColour(input.textColor, DEFAULT_STATE.textColor),
      textOpacity: clampNumber(input.textOpacity, 0, 100, DEFAULT_STATE.textOpacity),
      secondaryColor: normaliseColour(input.secondaryColor, DEFAULT_STATE.secondaryColor),
      backgroundColor: normaliseColour(input.backgroundColor, DEFAULT_STATE.backgroundColor),
      backgroundOpacity: clampNumber(input.backgroundOpacity, 0, 100, DEFAULT_STATE.backgroundOpacity),
      windowColor: normaliseColour(input.windowColor, DEFAULT_STATE.windowColor),
      windowOpacity: clampNumber(input.windowOpacity, 0, 100, DEFAULT_STATE.windowOpacity),
      edgeStyle: pick(input.edgeStyle, EDGE_STYLES, DEFAULT_STATE.edgeStyle),
      outlineWidth: clampNumber(input.outlineWidth, 0, 8, DEFAULT_STATE.outlineWidth),
      position: pick(input.position, POSITIONS, DEFAULT_STATE.position),
      offset: clampNumber(input.offset, 0, 40, DEFAULT_STATE.offset),
      delayMs: clampNumber(input.delayMs, -5000, 5000, DEFAULT_STATE.delayMs),
      hideSoundCues: typeof input.hideSoundCues === "boolean" ? input.hideSoundCues : DEFAULT_STATE.hideSoundCues,
      uploadedTrack: normaliseUploadedTrack(input.uploadedTrack)
    };
  }

  function withPatch(state, patch) {
    return normaliseState({ ...normaliseState(state), ...patch });
  }

  function availableSecondarySources(platformId) {
    return platformId === "youtube" || platformId === "netflix"
      ? ["platform", "upload"]
      : ["upload"];
  }

  function effectiveSecondarySource(state, platformId) {
    const source = normaliseState(state).secondarySource;
    return availableSecondarySources(platformId).includes(source) ? source : "upload";
  }

  function normaliseUploadedTrack(value) {
    if (!value || typeof value !== "object") return null;
    const name = String(value.name || "").slice(0, 180).trim();
    const text = String(value.text || "");
    if (!name || !text || text.length > 2_000_000) return null;
    return { name, text };
  }

  function normaliseFontFamily(value) {
    if (FONT_FAMILIES.has(value)) return value;
    return LEGACY_FONT_FAMILIES[value] || DEFAULT_STATE.fontFamily;
  }

  function normaliseSecondarySource(value) {
    if (value === "youtube") return "platform";
    return pick(value, SOURCES, DEFAULT_STATE.secondarySource);
  }

  function normaliseLanguage(value) {
    const language = String(value || "").trim().toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language)
      ? language
      : DEFAULT_STATE.targetLanguage;
  }

  function normaliseColour(value, fallback) {
    const colour = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : fallback;
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function pick(value, options, fallback) {
    return options.has(value) ? value : fallback;
  }

  return {
    STORAGE_KEY,
    DEFAULT_STATE,
    createDefaultState,
    normaliseState,
    withPatch,
    availableSecondarySources,
    effectiveSecondarySource
  };
});
