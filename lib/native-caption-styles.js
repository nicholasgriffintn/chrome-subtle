(function exposeSubtleNativeCaptionStyles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleNativeCaptionStyles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleNativeCaptionStyles() {
  "use strict";

  const STYLE_ATTRIBUTE = "data-subtle-bbc-caption-styles";
  const ENABLED_ATTRIBUTE = "data-subtle-bbc-enabled";
  const ALIGN_ATTRIBUTE = "data-subtle-bbc-align";
  const CAPTION = "div[aria-live='polite'] [lang] p";
  const CAPTION_LEAF = `${CAPTION} > span > span:not(:has(*))`;

  function apply(platformId, roots, state) {
    if (platformId !== "bbc") return;
    for (const root of roots || []) {
      if (!root) continue;
      configureShadowHost(root.host, state);
      if (root.querySelector?.(`[${STYLE_ATTRIBUTE}]`)) continue;
      const documentRef = root.ownerDocument || root.host?.ownerDocument || globalThis.document;
      const style = documentRef?.createElement?.("style");
      const container = root.host ? root : root.head || root.documentElement;
      if (!style || !container?.append) continue;
      style.setAttribute?.(STYLE_ATTRIBUTE, "");
      if (style.dataset) style.dataset.subtleBbcCaptionStyles = "";
      style.textContent = stylesheet(Boolean(root.host));
      container.append(style);
    }
  }

  function clear(platformId, roots) {
    if (platformId !== "bbc") return;
    for (const root of roots || []) {
      root?.host?.removeAttribute?.(ENABLED_ATTRIBUTE);
      root?.host?.removeAttribute?.(ALIGN_ATTRIBUTE);
      root?.querySelector?.(`[${STYLE_ATTRIBUTE}]`)?.remove?.();
    }
  }

  function configureShadowHost(host, state) {
    if (!host) return;
    host.toggleAttribute?.(ENABLED_ATTRIBUTE, Boolean(state?.enabled));
    if (state?.textAlign && state.textAlign !== "auto") host.setAttribute?.(ALIGN_ATTRIBUTE, state.textAlign);
    else host.removeAttribute?.(ALIGN_ATTRIBUTE);
  }

  function stylesheet(inShadowRoot) {
    const enabled = inShadowRoot
      ? `:host([${ENABLED_ATTRIBUTE}])`
      : ":root[data-subtle-enabled]";
    const alignment = (value) => inShadowRoot
      ? `:host([${ALIGN_ATTRIBUTE}="${value}"])`
      : `:root[data-subtle-enabled][data-subtle-align="${value}"]`;
    return `
      ${enabled} ${CAPTION} {
        font-family: var(--subtle-font-family) !important;
        font-variant: var(--subtle-font-variant) !important;
        font-size: var(--subtle-font-size) !important;
        font-weight: var(--subtle-font-weight) !important;
        line-height: var(--subtle-native-line-height) !important;
        letter-spacing: var(--subtle-letter-spacing) !important;
      }
      ${enabled} ${CAPTION} > span,
      ${enabled} ${CAPTION_LEAF} {
        font-family: inherit !important;
        font-variant: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        letter-spacing: inherit !important;
      }
      ${enabled} ${CAPTION_LEAF} {
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
      ${alignment("left")} ${CAPTION} { text-align: left !important; }
      ${alignment("center")} ${CAPTION} { text-align: center !important; }
      ${alignment("right")} ${CAPTION} { text-align: right !important; }
    `;
  }

  return { apply, clear };
});
