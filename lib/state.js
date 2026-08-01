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
  const TEXT_ALIGNMENTS = new Set(["auto", "left", "center", "right"]);
  const FONT_FAMILIES = new Set([
    "monospaced_serif",
    "proportional_serif",
    "monospaced_sans",
    "proportional_sans",
    "casual",
    "cursive",
    "small_caps",
    "youtube_sans",
    "roboto",
    "open_sans",
    "montserrat",
    "lato",
    "arial",
    "typewriter",
    "tajawal",
    "cairo",
    "almarai",
    "noto_kufi"
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
    fontWeight: 650,
    lineHeight: 1.24,
    letterSpacing: 0.2,
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
    strokeColor: "#000000",
    strokeOpacity: 94,
    shadowIntensity: 0,
    backgroundBlur: 0,
    captionPadding: 6,
    captionRadius: 4,
    textAlign: "auto",
    movieLike: true,
    movieWidth: 42,
    readabilityMode: false,
    position: "bottom",
    offset: 12,
    followNativePosition: true,
    shortsOptimised: true,
    shortsScale: 82,
    shortsWidth: 78,
    shortsOffset: 18,
    delayMs: 0,
    hideSoundCues: false,
    blockMusic: false,
    blockSpeakerLabels: false,
    customBlockedTerms: "",
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
      ...normaliseTypography(input),
      ...normaliseSurfaces(input),
      ...normalisePlacement(input),
      ...normaliseFilters(input),
      uploadedTrack: normaliseUploadedTrack(input.uploadedTrack)
    };
  }

  function normaliseTypography(input) {
    return {
      fontFamily: normaliseFontFamily(input.fontFamily),
      fontSize: clampNumber(input.fontSize, 18, 64, DEFAULT_STATE.fontSize),
      fontWeight: clampNumber(input.fontWeight, 400, 900, DEFAULT_STATE.fontWeight),
      lineHeight: clampNumber(input.lineHeight, 1, 2, DEFAULT_STATE.lineHeight),
      letterSpacing: clampNumber(input.letterSpacing, -1, 4, DEFAULT_STATE.letterSpacing),
      secondaryScale: clampNumber(input.secondaryScale, 55, 110, DEFAULT_STATE.secondaryScale),
      textAlign: pick(input.textAlign, TEXT_ALIGNMENTS, DEFAULT_STATE.textAlign),
      readabilityMode: booleanOr(input.readabilityMode, DEFAULT_STATE.readabilityMode)
    };
  }

  function normaliseSurfaces(input) {
    return {
      textColor: normaliseColour(input.textColor, DEFAULT_STATE.textColor),
      textOpacity: clampNumber(input.textOpacity, 0, 100, DEFAULT_STATE.textOpacity),
      secondaryColor: normaliseColour(input.secondaryColor, DEFAULT_STATE.secondaryColor),
      backgroundColor: normaliseColour(input.backgroundColor, DEFAULT_STATE.backgroundColor),
      backgroundOpacity: clampNumber(input.backgroundOpacity, 0, 100, DEFAULT_STATE.backgroundOpacity),
      windowColor: normaliseColour(input.windowColor, DEFAULT_STATE.windowColor),
      windowOpacity: clampNumber(input.windowOpacity, 0, 100, DEFAULT_STATE.windowOpacity),
      edgeStyle: pick(input.edgeStyle, EDGE_STYLES, DEFAULT_STATE.edgeStyle),
      outlineWidth: clampNumber(input.outlineWidth, 0, 8, DEFAULT_STATE.outlineWidth),
      strokeColor: normaliseColour(input.strokeColor, DEFAULT_STATE.strokeColor),
      strokeOpacity: clampNumber(input.strokeOpacity, 0, 100, DEFAULT_STATE.strokeOpacity),
      shadowIntensity: clampNumber(input.shadowIntensity, 0, 20, DEFAULT_STATE.shadowIntensity),
      backgroundBlur: clampNumber(input.backgroundBlur, 0, 20, DEFAULT_STATE.backgroundBlur),
      captionPadding: clampNumber(input.captionPadding, 0, 20, DEFAULT_STATE.captionPadding),
      captionRadius: clampNumber(input.captionRadius, 0, 20, DEFAULT_STATE.captionRadius)
    };
  }

  function normalisePlacement(input) {
    return {
      movieLike: booleanOr(input.movieLike, DEFAULT_STATE.movieLike),
      movieWidth: clampNumber(input.movieWidth, 28, 64, DEFAULT_STATE.movieWidth),
      position: pick(input.position, POSITIONS, DEFAULT_STATE.position),
      offset: clampNumber(input.offset, 0, 40, DEFAULT_STATE.offset),
      followNativePosition: normaliseFollowNativePosition(input),
      shortsOptimised: booleanOr(input.shortsOptimised, DEFAULT_STATE.shortsOptimised),
      shortsScale: clampNumber(input.shortsScale, 60, 110, DEFAULT_STATE.shortsScale),
      shortsWidth: clampNumber(input.shortsWidth, 55, 92, DEFAULT_STATE.shortsWidth),
      shortsOffset: clampNumber(input.shortsOffset, 0, 40, DEFAULT_STATE.shortsOffset)
    };
  }

  function normaliseFilters(input) {
    return {
      delayMs: clampNumber(input.delayMs, -5000, 5000, DEFAULT_STATE.delayMs),
      hideSoundCues: booleanOr(input.hideSoundCues, DEFAULT_STATE.hideSoundCues),
      blockMusic: booleanOr(input.blockMusic, DEFAULT_STATE.blockMusic),
      blockSpeakerLabels: booleanOr(input.blockSpeakerLabels, DEFAULT_STATE.blockSpeakerLabels),
      customBlockedTerms: normaliseCustomBlockedTerms(input.customBlockedTerms)
    };
  }

  function withPatch(state, patch) {
    return normaliseState({ ...normaliseState(state), ...patch });
  }

  function availableSecondarySources(platformId) {
    return platformId === "youtube" || platformId === "netflix" || platformId === "disney"
      ? ["platform", "upload"]
      : ["upload"];
  }

  function effectiveSecondarySource(state, platformId) {
    const source = normaliseState(state).secondarySource;
    return availableSecondarySources(platformId).includes(source) ? source : "upload";
  }

  function surfaceForPathname(pathname) {
    return /^\/shorts(?:\/|$)/.test(String(pathname || "")) ? "shorts" : "video";
  }

  function surfaceForUrl(value) {
    try {
      return surfaceForPathname(new URL(value).pathname);
    } catch (_error) {
      return "video";
    }
  }

  function effectiveSurfaceState(state, surface) {
    const effective = { ...state, surface };
    if (surface !== "shorts" || !state.shortsOptimised) return effective;
    return {
      ...effective,
      fontSize: Math.round(state.fontSize * state.shortsScale / 100),
      captionPadding: Math.min(state.captionPadding, 8),
      movieLike: true,
      movieWidth: Math.min(state.movieWidth, 44),
      textAlign: state.textAlign === "auto" ? "center" : state.textAlign,
      offset: state.shortsOffset
    };
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

  function normaliseFollowNativePosition(input) {
    if (typeof input.followNativePosition === "boolean") return input.followNativePosition;
    return input.position !== "top";
  }

  function normaliseCustomBlockedTerms(value) {
    return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 1000);
  }

  function booleanOr(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
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
    effectiveSecondarySource,
    surfaceForPathname,
    surfaceForUrl,
    effectiveSurfaceState
  };
});
