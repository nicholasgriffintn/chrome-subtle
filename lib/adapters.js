(function exposeSubtitleAdapters(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtitleAdapters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtitleAdapters() {
  "use strict";

  const YOUTUBE_CAPTION_SELECTORS = [
    ".caption-window",
    ".ytp-caption-window-bottom",
    ".ytp-caption-window-container"
  ];
  const NETFLIX_CAPTION_SELECTORS = [
    ".player-timedtext-text-container",
    "[data-uia='timed-text-container']",
    ".player-timedtext",
    "[data-uia*='timed-text']"
  ];

  const ADAPTERS = Object.freeze({
    youtube: {
      id: "youtube",
      label: "YouTube",
      hostnames: new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]),
      playerSelectors: ["#movie_player", "#shorts-player", ".html5-video-player"],
      videoSelector: "video.html5-main-video, video",
      nativeCaptionSelectors: YOUTUBE_CAPTION_SELECTORS
    },
    netflix: {
      id: "netflix",
      label: "Netflix",
      hostnames: new Set(["netflix.com", "www.netflix.com"]),
      playerSelectors: [".watch-video", "[data-uia='video-canvas']", ".VideoContainer"],
      videoSelector: "video",
      nativeCaptionSelectors: NETFLIX_CAPTION_SELECTORS
    }
  });

  function forHostname(hostname) {
    const normalised = String(hostname || "").toLowerCase();
    return Object.values(ADAPTERS).find((adapter) => adapter.hostnames.has(normalised)) || null;
  }

  function findPlayer(adapter, root, options = {}) {
    if (!adapter || !root) return null;
    if (adapter.id === "netflix") {
      const video = options.video || findVideo(adapter, root);
      const container = safeClosest(
        video,
        ".watch-video, .VideoContainer, [data-uia*='player'], [data-uia='video-canvas']"
      );
      return (container && container !== video ? container : null) || video?.parentElement || null;
    }
    if (!root.querySelector) return null;

    const selectors = adapter.id === "youtube" && String(options.pathname || "").startsWith("/shorts/")
      ? ["#shorts-player", "#movie_player", ".html5-video-player"]
      : adapter.playerSelectors;
    return selectors.map((selector) => root.querySelector(selector)).find(Boolean) || null;
  }

  function findVideo(adapter, root, options = {}) {
    if (!adapter || !root) return null;
    if (adapter.id === "netflix") {
      const candidates = root.querySelectorAll?.(adapter.videoSelector) || [];
      return pickVideoCandidate(candidates);
    }
    if (!root.querySelector) return null;
    const player = findPlayer(adapter, root, options);
    return player?.querySelector(adapter.videoSelector) || root.querySelector(adapter.videoSelector);
  }

  function pickVideoCandidate(candidates) {
    return Array.from(candidates || []).reduce((best, candidate) => {
      const score = scoreVideoCandidate(candidate);
      if (!Number.isFinite(score)) return best;
      return !best || score > best.score ? { candidate, score } : best;
    }, null)?.candidate || null;
  }

  function scoreVideoCandidate(video) {
    if (!video || video.isConnected === false || video.ended) return Number.NEGATIVE_INFINITY;
    let score = video.paused === false ? 2_000 : 0;
    if (safeClosest(video, "[class*='billboard'], [data-uia*='billboard']")) score -= 20_000;
    if (safeClosest(video, "[class*='previewModal'], [data-uia*='previewModal']")) score -= 10_000;

    const rect = safeRect(video);
    const width = Number(rect?.width || video.clientWidth || 0);
    const height = Number(rect?.height || video.clientHeight || 0);
    if (width > 0 && height > 0) score += Math.min((width * height) / 1_000, 1_500);
    return score;
  }

  function mutationsContainVideo(mutations) {
    return Array.from(mutations || []).some((mutation) => {
      const nodes = [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])];
      return nodes.some((node) => String(node?.nodeName || "").toUpperCase() === "VIDEO" || Boolean(node?.querySelector?.("video")));
    });
  }

  function mutationsContainNativeCaptions(adapter, mutations) {
    const selectors = adapter?.nativeCaptionSelectors || [];
    if (!selectors.length) return false;
    return Array.from(mutations || []).some((mutation) => {
      const nodes = [mutation.target, ...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])];
      return nodes.some((node) => nodeMatchesSelectors(node, selectors));
    });
  }

  function nodeMatchesSelectors(node, selectors) {
    const element = node?.nodeType === 3 ? node.parentElement : node;
    return selectors.some((selector) => {
      try {
        return Boolean(element?.matches?.(selector) || element?.closest?.(selector) || element?.querySelector?.(selector));
      } catch (_error) {
        return false;
      }
    });
  }

  function findNativeCaption(adapter, root, options = {}) {
    if (!adapter || !root) return null;
    for (const selector of adapter.nativeCaptionSelectors || []) {
      const candidates = root.querySelectorAll
        ? Array.from(root.querySelectorAll(selector))
        : [root.querySelector?.(selector)].filter(Boolean);
      const match = candidates.reverse().find((candidate) => isVisibleCaption(adapter, candidate, options.player));
      if (match) return match;
    }
    return null;
  }

  function measureNativeCaption(adapter, root, options = {}) {
    if (!adapter || !root) return null;
    for (const selector of adapter.nativeCaptionSelectors || []) {
      const candidates = root.querySelectorAll
        ? Array.from(root.querySelectorAll(selector))
        : [root.querySelector?.(selector)].filter(Boolean);
      const visible = candidates.filter((candidate) => isVisibleCaption(adapter, candidate, options.player));
      if (!visible.length) continue;
      const rect = unionRects(visible.map(safeRect).filter(Boolean));
      if (!rect) continue;
      return { rect, alignment: sharedTextAlignment(visible) };
    }
    return null;
  }

  function nativeCaptionElements(adapter, root, options = {}) {
    if (!adapter || !root?.querySelectorAll) return [];
    for (const selector of adapter.nativeCaptionSelectors || []) {
      const candidates = Array.from(root.querySelectorAll(selector)).filter((candidate) => {
        if (!candidate || candidate.isConnected === false) return false;
        if (adapter.id === "netflix" && safeClosest(candidate, "[class*='billboard'], [data-uia*='billboard'], [class*='previewModal'], [data-uia*='previewModal']")) return false;
        const owner = adapter.id === "youtube" ? safeClosest(candidate, ".html5-video-player") : null;
        return !options.player || !owner || owner === options.player;
      });
      if (candidates.length) return candidates;
    }
    return [];
  }

  function unionRects(rects) {
    if (!rects.length) return null;
    const left = Math.min(...rects.map((rect) => Number(rect.left)));
    const top = Math.min(...rects.map((rect) => Number(rect.top)));
    const right = Math.max(...rects.map((rect) => Number(rect.right)));
    const bottom = Math.max(...rects.map((rect) => Number(rect.bottom)));
    if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function sharedTextAlignment(candidates) {
    const alignments = new Set(candidates.map(nativeTextAlignment));
    return alignments.size === 1 ? alignments.values().next().value : "center";
  }

  function nativeTextAlignment(candidate) {
    let value = candidate?.style?.textAlign || "";
    try {
      value = value || globalThis.getComputedStyle?.(candidate)?.textAlign || "";
    } catch (_error) {
      value = "";
    }
    if (value === "left" || value === "start") return "left";
    if (value === "right" || value === "end") return "right";
    return "center";
  }

  function isVisibleCaption(adapter, candidate, player) {
    if (!candidate || candidate.isConnected === false || candidate.hidden || !String(candidate.textContent || "").trim()) return false;
    if (candidate.getAttribute?.("aria-hidden") === "true" || isVisuallyHidden(candidate)) return false;
    if (adapter.id === "netflix" && safeClosest(candidate, "[class*='billboard'], [data-uia*='billboard'], [class*='previewModal'], [data-uia*='previewModal']")) return false;
    const owner = adapter.id === "youtube" ? safeClosest(candidate, ".html5-video-player") : null;
    if (player && owner && owner !== player) return false;
    const rect = safeRect(candidate);
    return Number(rect?.width) > 0 && Number(rect?.height) > 0;
  }

  function isVisuallyHidden(element) {
    let style = element?.style || {};
    try {
      style = globalThis.getComputedStyle?.(element) || style;
    } catch (_error) {
      // Inline visibility remains usable when a detached or synthetic node cannot be measured.
    }
    return style.display === "none"
      || style.visibility === "hidden"
      || (style.opacity !== "" && Number(style.opacity) <= 0.01);
  }

  function safeClosest(element, selector) {
    try {
      return element?.closest?.(selector) || null;
    } catch (_error) {
      return null;
    }
  }

  function safeRect(element) {
    try {
      return element?.getBoundingClientRect?.() || null;
    } catch (_error) {
      return null;
    }
  }

  function hasNativeCaptions(adapter, root) {
    return Boolean(findNativeCaption(adapter, root));
  }

  return {
    ADAPTERS,
    forHostname,
    findPlayer,
    findVideo,
    findNativeCaption,
    nativeCaptionElements,
    measureNativeCaption,
    hasNativeCaptions,
    mutationsContainVideo,
    mutationsContainNativeCaptions
  };
});
