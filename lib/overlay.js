(function exposeSubtleOverlay(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleOverlay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleOverlay() {
  "use strict";

  const HOST_ID = "subtle-caption-layer";

  function create(player) {
    if (!player) return null;
    let host = player.querySelector?.(`#${HOST_ID}`);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("aria-live", "off");
      const shadow = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = overlayCss();
      const windowLayer = document.createElement("div");
      windowLayer.className = "window";
      const line = document.createElement("div");
      line.className = "line";
      line.hidden = true;
      windowLayer.append(line);
      shadow.append(style, windowLayer);
      host._subtleWindow = windowLayer;
      host._subtleLine = line;
      player.append(host);
    }
    return host;
  }

  function render(host, cue, state) {
    if (!host?._subtleLine || !host?._subtleWindow) return false;
    const line = host._subtleLine;
    const windowLayer = host._subtleWindow;
    const text = String(cue?.text || "");
    const renderKey = overlayRenderKey(text, state);
    if (host._subtleRenderKey === renderKey) return false;
    host._subtleRenderKey = renderKey;

    line.replaceChildren(...captionRows(text));
    line.hidden = !text;
    windowLayer.hidden = !text;
    applyOverlayStyles(host, state);
    return true;
  }

  function overlayRenderKey(text, state) {
    return JSON.stringify([
      text,
      state.position,
      state.offset,
      state.fontSize,
      state.secondaryScale,
      state.secondaryColor,
      state.textOpacity,
      state.backgroundColor,
      state.backgroundOpacity,
      state.windowColor,
      state.windowOpacity,
      state.edgeStyle,
      state.outlineWidth,
      state.strokeColor,
      state.strokeOpacity,
      state.shadowIntensity,
      state.backgroundBlur,
      state.captionPadding,
      state.captionRadius,
      state.fontFamily,
      state.fontWeight,
      state.lineHeight,
      state.letterSpacing,
      state.textAlign,
      state.movieLike,
      state.movieWidth,
      state.readabilityMode,
      state.surface,
      state.shortsOptimised,
      state.shortsWidth
    ]);
  }

  function applyOverlayStyles(host, state) {
    host.dataset.position = state.position;
    host.dataset.movieLike = String(state.movieLike);
    host.dataset.surface = state.surface || "video";
    host.dataset.shortsOptimised = String(Boolean(state.shortsOptimised));
    host.style.setProperty("--subtle-overlay-shorts-width", `${state.shortsWidth || 78}%`);
    const offset = state.position === "top"
      ? `calc(${state.offset}% + ${Math.round(state.fontSize * 1.5)}px)`
      : `${state.offset}%`;
    host.style.setProperty("--subtle-overlay-offset", offset);
    host.style.setProperty("--subtle-overlay-size", `${Math.round(state.fontSize * state.secondaryScale / 100)}px`);
    host.style.setProperty("--subtle-overlay-colour", hexToRgba(state.secondaryColor, state.textOpacity));
    host.style.setProperty("--subtle-overlay-background", hexToRgba(state.backgroundColor, state.backgroundOpacity));
    host.style.setProperty("--subtle-overlay-window", hexToRgba(state.windowColor, state.windowOpacity));
    const type = typography(state);
    const edge = edgeTreatment(
      state.edgeStyle,
      state.outlineWidth,
      state.strokeColor,
      state.strokeOpacity,
      state.shadowIntensity
    );
    host.style.setProperty("--subtle-overlay-stroke", edge.stroke);
    host.style.setProperty("--subtle-overlay-shadow", edge.shadow);
    host.style.setProperty("--subtle-overlay-font", fontStack(type.fontFamily));
    host.style.setProperty("--subtle-overlay-variant", fontVariant(type.fontFamily));
    host.style.setProperty("--subtle-overlay-weight", String(type.fontWeight));
    host.style.setProperty("--subtle-overlay-line-height", String(type.lineHeight));
    host.style.setProperty("--subtle-overlay-letter-spacing", `${type.letterSpacing}px`);
    host.style.setProperty("--subtle-overlay-padding", `${state.captionPadding}px`);
    host.style.setProperty("--subtle-overlay-radius", `${state.captionRadius}px`);
    host.style.setProperty("--subtle-overlay-blur", `${state.backgroundBlur}px`);
    host.style.setProperty("--subtle-overlay-max-width", `${state.movieWidth}ch`);
    host.style.setProperty("--subtle-overlay-row-gap", `${captionRowGap(state)}px`);
    setOverlayAlignment(host, state.textAlign === "auto" ? "center" : state.textAlign, true);
  }

  function captionRows(text) {
    if (!text) return [];
    return text.split(/\r?\n/).filter((value) => value.trim()).map((value) => {
      const row = document.createElement("div");
      row.className = "row";
      const segment = document.createElement("span");
      segment.className = "segment";
      segment.textContent = value;
      row.append(segment);
      return row;
    });
  }

  function positionNearNative(host, player, nativeMeasurement, gap = 4) {
    if (!host?._subtleWindow || host._subtleWindow.hidden || !player || !nativeMeasurement) {
      clearAnchoring(host);
      return false;
    }
    const measurement = nativeMeasurement.rect
      ? nativeMeasurement
      : { rect: safeRect(nativeMeasurement), alignment: nativeTextAlignment(nativeMeasurement) };
    const alignment = measurement.alignment || "center";
    const placement = calculateAnchoredPlacement(
      safeRect(player),
      measurement.rect,
      safeRect(host._subtleWindow),
      gap,
      alignment
    );
    if (!placement) {
      clearAnchoring(host);
      return false;
    }
    const placementKey = `${placement.left}:${placement.top}:${alignment}`;
    if (host._subtlePlacementKey === placementKey) return true;
    host._subtlePlacementKey = placementKey;
    host.dataset.anchored = "true";
    host.style.setProperty("--subtle-anchor-left", `${placement.left}px`);
    host.style.setProperty("--subtle-anchor-top", `${placement.top}px`);
    host.style.setProperty("--subtle-anchor-transform", anchorTransform(alignment));
    setOverlayAlignment(host, alignment);
    return true;
  }

  function calculateAnchoredPlacement(playerRect, nativeRect, overlayRect, gap = 4, alignment = "center") {
    if (!validRect(playerRect) || !validRect(nativeRect) || !validSize(overlayRect)) return null;
    const nativeIntersectsPlayer = nativeRect.right > playerRect.left
      && nativeRect.left < playerRect.right
      && nativeRect.bottom > playerRect.top
      && nativeRect.top < playerRect.bottom;
    if (!nativeIntersectsPlayer) return null;

    const margin = 4;
    const left = horizontalAnchor(playerRect, nativeRect, overlayRect, margin, alignment);
    const below = nativeRect.bottom - playerRect.top + gap;
    const above = nativeRect.top - playerRect.top - overlayRect.height - gap;
    const desiredTop = below + overlayRect.height <= playerRect.height - margin ? below : above;
    const top = clamp(desiredTop, margin, Math.max(margin, playerRect.height - overlayRect.height - margin));
    return { left: snapToHalfPixel(left), top: snapToHalfPixel(top) };
  }

  function captionGap(fontSize) {
    return Math.max(8, Math.ceil((Number(fontSize) || 34) * 0.28));
  }

  function captionRowGap(state) {
    const padding = Math.max(0, Number(state?.captionPadding) || 0);
    const outline = Math.max(0, Number(state?.outlineWidth) || 0);
    const shadow = Math.max(0, Number(state?.shadowIntensity) || 0);
    return Math.max(2, Math.ceil((padding * 0.35) + (outline * 0.5) + (shadow * 0.05)));
  }

  function horizontalAnchor(playerRect, nativeRect, overlayRect, margin, alignment) {
    if (alignment === "left") {
      const desired = nativeRect.left - playerRect.left;
      return clamp(desired, margin, Math.max(margin, playerRect.width - overlayRect.width - margin));
    }
    if (alignment === "right") {
      const desired = nativeRect.right - playerRect.left;
      return clamp(desired, overlayRect.width + margin, playerRect.width - margin);
    }
    const halfWidth = overlayRect.width / 2;
    const desired = nativeRect.left - playerRect.left + (nativeRect.width / 2);
    return overlayRect.width + (margin * 2) >= playerRect.width
      ? playerRect.width / 2
      : clamp(desired, halfWidth + margin, playerRect.width - halfWidth - margin);
  }

  function nativeTextAlignment(nativeCaption) {
    let value = nativeCaption?.style?.textAlign || "";
    try {
      value = value || globalThis.getComputedStyle?.(nativeCaption)?.textAlign || "";
    } catch (_error) {
      value = "";
    }
    if (value === "left" || value === "start") return "left";
    if (value === "right" || value === "end") return "right";
    return "center";
  }

  function anchorTransform(alignment) {
    if (alignment === "left") return "none";
    if (alignment === "right") return "translateX(-100%)";
    return "translateX(-50%)";
  }

  function setOverlayAlignment(host, alignment, remember = false) {
    const value = alignment === "left" || alignment === "right" ? alignment : "center";
    if (remember) host._subtleDefaultAlignment = value;
    host.style.setProperty("--subtle-overlay-align", value);
    host.style.setProperty("--subtle-overlay-justify", value === "left" ? "flex-start" : value === "right" ? "flex-end" : "center");
  }

  function clearAnchoring(host) {
    if (!host || !host.dataset.anchored) return;
    host._subtlePlacementKey = "";
    delete host.dataset.anchored;
    host.style.removeProperty("--subtle-anchor-left");
    host.style.removeProperty("--subtle-anchor-top");
    host.style.removeProperty("--subtle-anchor-transform");
    setOverlayAlignment(host, host._subtleDefaultAlignment || "center");
  }

  function validRect(rect) {
    return rect && [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height]
      .every((value) => Number.isFinite(Number(value)))
      && rect.width > 0
      && rect.height > 0;
  }

  function validSize(rect) {
    return rect
      && Number.isFinite(Number(rect.width))
      && Number.isFinite(Number(rect.height))
      && rect.width > 0
      && rect.height > 0;
  }

  function safeRect(element) {
    try {
      return element?.getBoundingClientRect?.() || null;
    } catch (_error) {
      return null;
    }
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function snapToHalfPixel(value) {
    return Math.round(value * 2) / 2;
  }

  function remove(host) {
    host?.remove();
  }

  function hexToRgba(hex, opacity) {
    const number = Number.parseInt(String(hex).slice(1), 16);
    const red = (number >> 16) & 255;
    const green = (number >> 8) & 255;
    const blue = number & 255;
    return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`;
  }

  function fontStack(value) {
    return {
      monospaced_serif: '"Courier New", Courier, monospace',
      proportional_serif: '"Times New Roman", Iowan Old Style, Georgia, serif',
      monospaced_sans: '"DejaVu Sans Mono", "Lucida Console", Monaco, monospace',
      proportional_sans: '"Avenir Next", Avenir, "Segoe UI", sans-serif',
      casual: '"Chalkboard SE", "Comic Sans MS", fantasy',
      cursive: '"Apple Chancery", "URW Chancery L", cursive',
      small_caps: '"Avenir Next", Avenir, "Segoe UI", sans-serif',
      youtube_sans: '"YouTube Noto", Roboto, Arial, Helvetica, sans-serif',
      roboto: 'Roboto, "YouTube Noto", Arial, sans-serif',
      open_sans: '"Open Sans", "Segoe UI", Arial, sans-serif',
      montserrat: 'Montserrat, Avenir, "Avenir Next", sans-serif',
      lato: 'Lato, "Helvetica Neue", Arial, sans-serif',
      arial: 'Arial, Helvetica, sans-serif',
      typewriter: '"American Typewriter", "Courier Prime", "Courier New", monospace',
      tajawal: 'Tajawal, Cairo, "Noto Sans Arabic", "Geeza Pro", Arial, sans-serif',
      cairo: 'Cairo, Tajawal, "Noto Sans Arabic", "Geeza Pro", Arial, sans-serif',
      almarai: 'Almarai, Tajawal, "Noto Sans Arabic", "Geeza Pro", Arial, sans-serif',
      noto_kufi: '"Noto Kufi Arabic", "KufiStandardGK", "Geeza Pro", Arial, sans-serif'
    }[value] || '"Avenir Next", Avenir, sans-serif';
  }

  function fontVariant(value) {
    return value === "small_caps" ? "small-caps" : "normal";
  }

  function typography(state) {
    if (!state.readabilityMode) {
      return {
        fontFamily: state.fontFamily,
        fontWeight: state.fontWeight,
        lineHeight: state.lineHeight,
        letterSpacing: state.letterSpacing
      };
    }
    return {
      fontFamily: "proportional_sans",
      fontWeight: Math.max(600, state.fontWeight),
      lineHeight: Math.max(1.5, state.lineHeight),
      letterSpacing: Math.max(0.5, state.letterSpacing)
    };
  }

  function edgeTreatment(value, outlineWidth, colour = "#000000", opacity = 94, shadowIntensity = 0) {
    const dark = hexToRgba(colour, opacity);
    const light = "rgba(255, 255, 255, 0.72)";
    const softShadow = shadowIntensity > 0 ? `0 0 ${shadowIntensity / 100}em ${dark}` : "none";
    if (value === "none") return { stroke: "0 transparent", shadow: softShadow };
    if (value === "drop_shadow") {
      const amount = shadowIntensity > 0 ? shadowIntensity / 100 : 0.12;
      return { stroke: "0 transparent", shadow: `${amount}em ${amount}em ${amount}em ${dark}` };
    }
    if (value === "raised") return { stroke: "0 transparent", shadow: `-0.08em -0.08em 0 ${light}, 0.08em 0.08em 0 ${dark}` };
    if (value === "depressed") return { stroke: "0 transparent", shadow: `0.08em 0.08em 0 ${light}, -0.08em -0.08em 0 ${dark}` };
    return { stroke: `${outlineWidth}px ${dark}`, shadow: softShadow };
  }

  function overlayCss() {
    return `
      :host {
        position: absolute; inset: 0; z-index: 2147483000; display: block; overflow: hidden;
        pointer-events: none; container-type: size; contain: layout paint;
      }
      .window {
        position: absolute; left: 50%; bottom: var(--subtle-overlay-offset, 12%); box-sizing: border-box;
        width: max-content; max-width: min(84%, 980px);
        transform: translateX(-50%);
      }
      .line {
        width: max-content; max-width: 100%; color: var(--subtle-overlay-colour, #ffd36e);
        font: var(--subtle-overlay-weight, 650) var(--subtle-overlay-size, 28px)/var(--subtle-overlay-line-height, 1.24) var(--subtle-overlay-font, sans-serif);
        letter-spacing: var(--subtle-overlay-letter-spacing, 0.2px);
        font-variant: var(--subtle-overlay-variant, normal); text-align: var(--subtle-overlay-align, center);
        -webkit-text-stroke: var(--subtle-overlay-stroke, 3px rgba(0, 0, 0, 0.94));
        text-shadow: var(--subtle-overlay-shadow, none); paint-order: stroke fill;
      }
      .row { display: flex; width: 100%; justify-content: var(--subtle-overlay-justify, center); line-height: var(--subtle-overlay-line-height, 1.24); }
      .row + .row { margin-top: var(--subtle-overlay-row-gap, 4px); }
      .segment {
        display: inline-block;
        padding: var(--subtle-overlay-padding, 6px);
        border-radius: var(--subtle-overlay-radius, 4px);
        background: var(--subtle-overlay-background, rgba(11, 16, 19, 0.76));
        box-shadow: 0 0 0 0.2em var(--subtle-overlay-window, transparent);
        -webkit-backdrop-filter: blur(var(--subtle-overlay-blur, 0)); backdrop-filter: blur(var(--subtle-overlay-blur, 0));
        overflow-wrap: anywhere;
        -webkit-box-decoration-break: clone; box-decoration-break: clone;
      }
      :host([data-movie-like="true"]) .window {
        max-width: min(var(--subtle-overlay-max-width, 42ch), calc(100% - 32px));
      }
      :host([data-surface="shorts"][data-shorts-optimised="true"]) .window {
        max-width: min(var(--subtle-overlay-max-width, 42ch), var(--subtle-overlay-shorts-width, 78%));
      }
      :host([data-position="top"]) .window { top: var(--subtle-overlay-offset, 12%); bottom: auto; }
      :host([data-anchored="true"]) .window {
        left: var(--subtle-anchor-left); top: var(--subtle-anchor-top); bottom: auto;
        transform: var(--subtle-anchor-transform, translateX(-50%));
      }
      .window[hidden] { display: none; }
    `;
  }

  return {
    create,
    render,
    positionNearNative,
    calculateAnchoredPlacement,
    captionGap,
    captionRowGap,
    remove,
    fontStack,
    fontVariant,
    typography,
    edgeTreatment,
    hexToRgba
  };
});
