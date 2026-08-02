(function exposeSubtleNativeCaptionStyles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleNativeCaptionStyles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleNativeCaptionStyles() {
  "use strict";

  const BBC_CAPTION = "div[aria-live='polite'] [lang] p";
  const BBC_CAPTION_LEAF = `${BBC_CAPTION} > span > span:not(:has(*))`;
  const DISNEY_CUE = ".dss-subtitle-renderer-cue, .hive-subtitle-renderer-cue";
  const DISNEY_WINDOW = ".dss-subtitle-renderer-cue-window, .hive-subtitle-renderer-cue-window";
  const DISNEY_LINE = ".dss-subtitle-renderer-line, .hive-subtitle-renderer-line";
  const YOUTUBE_LAYOUT_SEGMENT_CLASS = "subtle-layout-caption-segment";
  const DEFINITIONS = Object.freeze({
    bbc: Object.freeze({
      styleAttribute: "data-subtle-bbc-caption-styles",
      enabledAttribute: "data-subtle-bbc-enabled",
      alignAttribute: "data-subtle-bbc-align",
      stylesheet: bbcStylesheet
    }),
    disney: Object.freeze({
      styleAttribute: "data-subtle-disney-caption-styles",
      enabledAttribute: "data-subtle-disney-enabled",
      alignAttribute: "data-subtle-disney-align",
      stylesheet: disneyStylesheet
    })
  });

  function apply(platformId, roots, state) {
    const definition = DEFINITIONS[platformId];
    if (!definition) return;
    for (const root of roots || []) {
      if (!root) continue;
      configureShadowHost(root.host, state, definition);
      if (root.querySelector?.(`[${definition.styleAttribute}]`)) continue;
      const documentRef = root.ownerDocument || root.host?.ownerDocument || globalThis.document;
      const style = documentRef?.createElement?.("style");
      const container = root.host ? root : root.head || root.documentElement;
      if (!style || !container?.append) continue;
      style.setAttribute?.(definition.styleAttribute, "");
      style.textContent = definition.stylesheet(Boolean(root.host), definition);
      container.append(style);
    }
  }

  function clear(platformId, roots) {
    if (platformId === "youtube") clearYouTubeSegments(roots);
    const definition = DEFINITIONS[platformId];
    if (!definition) return;
    for (const root of roots || []) {
      root?.host?.removeAttribute?.(definition.enabledAttribute);
      root?.host?.removeAttribute?.(definition.alignAttribute);
      root?.querySelector?.(`[${definition.styleAttribute}]`)?.remove?.();
    }
  }

  function syncYouTubeSegments(elements) {
    for (const element of elements || []) {
      element?.classList?.toggle(YOUTUBE_LAYOUT_SEGMENT_CLASS, isLayoutOnlySegment(element.textContent));
    }
  }

  function clearYouTubeSegments(roots) {
    for (const root of roots || []) {
      for (const element of root?.querySelectorAll?.(`.${YOUTUBE_LAYOUT_SEGMENT_CLASS}`) || []) {
        element.classList?.remove(YOUTUBE_LAYOUT_SEGMENT_CLASS);
      }
    }
  }

  function isLayoutOnlySegment(value) {
    return !String(value || "").replace(/[\u200b\u2060\ufeff]/g, "").trim();
  }

  function configureShadowHost(host, state, definition) {
    if (!host) return;
    host.toggleAttribute?.(definition.enabledAttribute, Boolean(state?.enabled));
    if (state?.textAlign && state.textAlign !== "auto") host.setAttribute?.(definition.alignAttribute, state.textAlign);
    else host.removeAttribute?.(definition.alignAttribute);
  }

  function selectors(inShadowRoot, definition) {
    const enabled = inShadowRoot
      ? `:host([${definition.enabledAttribute}])`
      : ":root[data-subtle-enabled]";
    const alignment = (value) => inShadowRoot
      ? `:host([${definition.alignAttribute}="${value}"])`
      : `:root[data-subtle-enabled][data-subtle-align="${value}"]`;
    return { enabled, alignment };
  }

  function bbcStylesheet(inShadowRoot, definition) {
    const { enabled, alignment } = selectors(inShadowRoot, definition);
    return `
      ${enabled} ${BBC_CAPTION} {
        font-family: var(--subtle-font-family) !important;
        font-variant: var(--subtle-font-variant) !important;
        font-size: var(--subtle-font-size) !important;
        font-weight: var(--subtle-font-weight) !important;
        line-height: var(--subtle-native-line-height) !important;
        letter-spacing: var(--subtle-letter-spacing) !important;
      }
      ${enabled} ${BBC_CAPTION} > span,
      ${enabled} ${BBC_CAPTION_LEAF} {
        font-family: inherit !important;
        font-variant: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        letter-spacing: inherit !important;
      }
      ${enabled} ${BBC_CAPTION_LEAF} {
        background: var(--subtle-caption-background) !important;
        box-shadow: 0 0 0 var(--subtle-window-padding) var(--subtle-window-background) !important;
        padding: 0 var(--subtle-window-padding) !important;
        margin-inline: 0 !important;
        border-radius: var(--subtle-caption-radius) !important;
        -webkit-backdrop-filter: blur(var(--subtle-background-blur)) !important;
        backdrop-filter: blur(var(--subtle-background-blur)) !important;
        -webkit-text-stroke: var(--subtle-edge-stroke) !important;
        paint-order: stroke fill !important;
        text-shadow: var(--subtle-edge-shadow) !important;
        box-decoration-break: clone !important;
      }
      ${alignment("left")} ${BBC_CAPTION} { text-align: left !important; }
      ${alignment("center")} ${BBC_CAPTION} { text-align: center !important; }
      ${alignment("right")} ${BBC_CAPTION} { text-align: right !important; }
    `;
  }

  function disneyStylesheet(inShadowRoot, definition) {
    const { enabled, alignment } = selectors(inShadowRoot, definition);
    return `
      ${enabled} video::cue {
        color: var(--subtle-text-colour) !important;
        background-color: var(--subtle-caption-background) !important;
        font-family: var(--subtle-font-family) !important;
        font-variant: var(--subtle-font-variant) !important;
        font-size: var(--subtle-font-size) !important;
        font-weight: var(--subtle-font-weight) !important;
        line-height: var(--subtle-native-line-height) !important;
        letter-spacing: var(--subtle-letter-spacing) !important;
        -webkit-text-stroke: var(--subtle-edge-stroke) !important;
        text-shadow: var(--subtle-edge-shadow) !important;
      }
      ${enabled} video::-webkit-media-text-track-display {
        background-color: var(--subtle-window-background) !important;
      }
      ${enabled} :is(${DISNEY_CUE}),
      ${enabled} :is(${DISNEY_WINDOW}) {
        background: transparent !important;
      }
      ${enabled} :is(${DISNEY_LINE}) {
        color: var(--subtle-text-colour) !important;
        background: var(--subtle-caption-background) !important;
        box-shadow: 0 0 0 var(--subtle-window-padding) var(--subtle-window-background) !important;
        font-family: var(--subtle-font-family) !important;
        font-variant: var(--subtle-font-variant) !important;
        font-size: var(--subtle-font-size) !important;
        font-weight: var(--subtle-font-weight) !important;
        line-height: var(--subtle-native-line-height) !important;
        letter-spacing: var(--subtle-letter-spacing) !important;
        padding: 0 var(--subtle-window-padding) !important;
        border-radius: var(--subtle-caption-radius) !important;
        -webkit-backdrop-filter: blur(var(--subtle-background-blur)) !important;
        backdrop-filter: blur(var(--subtle-background-blur)) !important;
        -webkit-text-stroke: var(--subtle-edge-stroke) !important;
        paint-order: stroke fill !important;
        text-shadow: var(--subtle-edge-shadow) !important;
        box-decoration-break: clone !important;
      }
      ${alignment("left")} :is(${DISNEY_CUE}) { text-align: left !important; }
      ${alignment("center")} :is(${DISNEY_CUE}) { text-align: center !important; }
      ${alignment("right")} :is(${DISNEY_CUE}) { text-align: right !important; }
    `;
  }

  return { apply, clear, syncYouTubeSegments };
});
