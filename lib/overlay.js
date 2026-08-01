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
    const renderKey = JSON.stringify([
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
      state.fontFamily
    ]);
    if (host._subtleRenderKey === renderKey) return false;
    host._subtleRenderKey = renderKey;

    line.replaceChildren(...captionRows(text));
    line.hidden = !text;
    windowLayer.hidden = !text;
    host.dataset.position = state.position;
    const offset = state.position === "top"
      ? `calc(${state.offset}% + ${Math.round(state.fontSize * 1.5)}px)`
      : `${state.offset}%`;
    host.style.setProperty("--subtle-overlay-offset", offset);
    host.style.setProperty("--subtle-overlay-size", `${Math.round(state.fontSize * state.secondaryScale / 100)}px`);
    host.style.setProperty("--subtle-overlay-colour", hexToRgba(state.secondaryColor, state.textOpacity));
    host.style.setProperty("--subtle-overlay-background", hexToRgba(state.backgroundColor, state.backgroundOpacity));
    host.style.setProperty("--subtle-overlay-window", hexToRgba(state.windowColor, state.windowOpacity));
    const edge = edgeTreatment(state.edgeStyle, state.outlineWidth);
    host.style.setProperty("--subtle-overlay-stroke", edge.stroke);
    host.style.setProperty("--subtle-overlay-shadow", edge.shadow);
    host.style.setProperty("--subtle-overlay-font", fontStack(state.fontFamily));
    host.style.setProperty("--subtle-overlay-variant", fontVariant(state.fontFamily));
    return true;
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
    host.style.setProperty("--subtle-overlay-align", alignment);
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

  function clearAnchoring(host) {
    if (!host || !host.dataset.anchored) return;
    host._subtlePlacementKey = "";
    delete host.dataset.anchored;
    host.style.removeProperty("--subtle-anchor-left");
    host.style.removeProperty("--subtle-anchor-top");
    host.style.removeProperty("--subtle-anchor-transform");
    host.style.removeProperty("--subtle-overlay-align");
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
      small_caps: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
    }[value] || '"Avenir Next", Avenir, sans-serif';
  }

  function fontVariant(value) {
    return value === "small_caps" ? "small-caps" : "normal";
  }

  function edgeTreatment(value, outlineWidth) {
    const dark = "rgba(0, 0, 0, 0.94)";
    const light = "rgba(255, 255, 255, 0.72)";
    if (value === "none") return { stroke: "0 transparent", shadow: "none" };
    if (value === "drop_shadow") return { stroke: "0 transparent", shadow: `0.12em 0.12em 0.12em ${dark}` };
    if (value === "raised") return { stroke: "0 transparent", shadow: `-0.08em -0.08em 0 ${light}, 0.08em 0.08em 0 ${dark}` };
    if (value === "depressed") return { stroke: "0 transparent", shadow: `0.08em 0.08em 0 ${light}, -0.08em -0.08em 0 ${dark}` };
    return { stroke: `${outlineWidth}px ${dark}`, shadow: "none" };
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
        font: 650 var(--subtle-overlay-size, 28px)/1.24 var(--subtle-overlay-font, sans-serif); letter-spacing: 0.005em;
        font-variant: var(--subtle-overlay-variant, normal); text-align: var(--subtle-overlay-align, center);
        -webkit-text-stroke: var(--subtle-overlay-stroke, 3px rgba(0, 0, 0, 0.94));
        text-shadow: var(--subtle-overlay-shadow, none); paint-order: stroke fill;
      }
      .row { width: 100%; line-height: 1.24; }
      .row + .row { margin-top: 0.2em; }
      .segment {
        background: var(--subtle-overlay-background, rgba(11, 16, 19, 0.76));
        box-shadow: 0 0 0 0.2em var(--subtle-overlay-window, transparent);
        overflow-wrap: anywhere;
        -webkit-box-decoration-break: clone; box-decoration-break: clone;
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
    remove,
    fontStack,
    fontVariant,
    edgeTreatment,
    hexToRgba
  };
});
