(function exposeSubtlePresets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePresets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtlePresets() {
  "use strict";

  const BASE_VISUAL_PATCH = Object.freeze({
    secondaryScale: 82,
    textOpacity: 100,
    windowColor: "#000000",
    windowOpacity: 0,
    strokeColor: "#000000",
    strokeOpacity: 94,
    shadowIntensity: 0,
    backgroundBlur: 0,
    captionPadding: 6,
    captionRadius: 4,
    textAlign: "auto"
  });

  const presets = Object.freeze({
    cinema: preset("Cinema", {
      fontFamily: "proportional_sans", fontSize: 34, fontWeight: 650, lineHeight: 1.24,
      letterSpacing: 0.2, textColor: "#fffaf0", secondaryColor: "#ffd36e",
      backgroundColor: "#0b1013", backgroundOpacity: 76, edgeStyle: "outline", outlineWidth: 3,
      movieLike: true, movieWidth: 42, readabilityMode: false
    }),
    minimal: preset("Minimal", {
      fontFamily: "proportional_sans", fontSize: 31, fontWeight: 500, lineHeight: 1.28,
      letterSpacing: 0.1, textColor: "#ffffff", secondaryColor: "#d7e8ff",
      backgroundColor: "#000000", backgroundOpacity: 34, edgeStyle: "drop_shadow", outlineWidth: 1,
      movieLike: true, movieWidth: 46, readabilityMode: false
    }),
    contrast: preset("Contrast", {
      fontFamily: "monospaced_sans", fontSize: 38, fontWeight: 700, lineHeight: 1.35,
      letterSpacing: 0.4, textColor: "#ffffff", secondaryColor: "#fff06a",
      backgroundColor: "#000000", backgroundOpacity: 92, edgeStyle: "outline", outlineWidth: 5,
      movieLike: true, movieWidth: 40, readabilityMode: false
    }),
    soft: preset("Soft", {
      fontFamily: "casual", fontSize: 31, fontWeight: 600, lineHeight: 1.32,
      letterSpacing: 0.2, textColor: "#f7f2e8", secondaryColor: "#aee8d7",
      backgroundColor: "#172226", backgroundOpacity: 58, edgeStyle: "drop_shadow", outlineWidth: 2,
      movieLike: true, movieWidth: 44, readabilityMode: false
    }),
    documentary: preset("Documentary", {
      fontFamily: "proportional_serif", fontSize: 33, fontWeight: 600, lineHeight: 1.3,
      letterSpacing: 0.1, textColor: "#fff8e8", secondaryColor: "#e5c98a",
      backgroundColor: "#15120d", backgroundOpacity: 72, edgeStyle: "drop_shadow", outlineWidth: 2,
      movieLike: true, movieWidth: 44, readabilityMode: false
    }),
    anime: preset("Anime", {
      fontFamily: "proportional_sans", fontSize: 36, fontWeight: 800, lineHeight: 1.2,
      letterSpacing: 0, textColor: "#ffffff", secondaryColor: "#8ee7ff",
      backgroundColor: "#18152b", backgroundOpacity: 42, edgeStyle: "outline", outlineWidth: 4,
      movieLike: true, movieWidth: 40, readabilityMode: false
    }),
    news: preset("News", {
      fontFamily: "proportional_sans", fontSize: 30, fontWeight: 700, lineHeight: 1.22,
      letterSpacing: 0.3, textColor: "#ffffff", secondaryColor: "#ffe082",
      backgroundColor: "#0c2240", backgroundOpacity: 86, edgeStyle: "none", outlineWidth: 0,
      movieLike: false, movieWidth: 54, readabilityMode: false
    }),
    night: preset("Night", {
      fontFamily: "proportional_sans", fontSize: 32, fontWeight: 550, lineHeight: 1.32,
      letterSpacing: 0.2, textColor: "#e5e8ea", secondaryColor: "#9db8c8",
      backgroundColor: "#080b0e", backgroundOpacity: 64, edgeStyle: "drop_shadow", outlineWidth: 2,
      movieLike: true, movieWidth: 46, readabilityMode: false
    }),
    readable: preset("Readable", {
      fontFamily: "proportional_sans", fontSize: 38, fontWeight: 650, lineHeight: 1.5,
      letterSpacing: 0.6, textColor: "#ffffff", secondaryColor: "#ffe275",
      backgroundColor: "#000000", backgroundOpacity: 88, edgeStyle: "outline", outlineWidth: 3,
      movieLike: true, movieWidth: 38, readabilityMode: true
    })
  });

  function preset(label, patch) {
    return Object.freeze({ label, patch: Object.freeze({ ...BASE_VISUAL_PATCH, ...patch }) });
  }

  function all() {
    return presets;
  }

  function find(id) {
    return presets[id] || null;
  }

  return { all, find };
});
