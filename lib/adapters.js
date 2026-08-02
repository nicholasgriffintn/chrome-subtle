(function exposeSubtitleAdapters(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./supported-sites.js"));
  else root.SubtitleAdapters = factory(root.SubtleSupportedSites);
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtitleAdapters(SubtleSupportedSites) {
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
  const BBC_CAPTION_SELECTORS = ["div[aria-live='polite'] [lang] p"];
  const DISNEY_CAPTION_SELECTORS = [
    ".dss-subtitle-renderer-line",
    ".hive-subtitle-renderer-line"
  ];

  function siteIdentity(siteId) {
    const site = SubtleSupportedSites.forId(siteId);
    return { id: site.id, label: site.label, hostnames: new Set(site.hostnames) };
  }

  const ADAPTERS = Object.freeze({
    youtube: {
      ...siteIdentity("youtube"),
      playerSelectors: ["#movie_player", "#shorts-player", ".html5-video-player"],
      videoSelector: "video.html5-main-video, video",
      nativeCaptionSelectors: YOUTUBE_CAPTION_SELECTORS,
      nativeCaptionFilterSelectors: [".ytp-caption-segment"]
    },
    netflix: {
      ...siteIdentity("netflix"),
      playerSelectors: [".watch-video", "[data-uia='video-canvas']", ".VideoContainer"],
      videoSelector: "video",
      nativeCaptionSelectors: NETFLIX_CAPTION_SELECTORS,
      nativeCaptionFilterSelectors: [
        ".player-timedtext-text-container span:not(:has(*))",
        "[data-uia='timed-text-container'] span:not(:has(*))"
      ]
    },
    bbc: {
      ...siteIdentity("bbc"),
      videoSelector: "video",
      nativeCaptionSelectors: BBC_CAPTION_SELECTORS,
      shadowHostSelectors: ["smp-toucan-player"],
      nativeCaptionFilterSelectors: [
        "div[aria-live='polite'] [lang] p > span > span:not(:has(*))"
      ]
    },
    disney: {
      ...siteIdentity("disney"),
      videoSelector: "video.hive-video, video.btm-media-client-element, video",
      nativeCaptionSelectors: DISNEY_CAPTION_SELECTORS,
      shadowHostSelectors: [
        "disney-web-player",
        "disney-web-player-ui",
        "timed-text-override-region"
      ],
      nativeCaptionFilterSelectors: DISNEY_CAPTION_SELECTORS
    },
    prime: {
      ...siteIdentity("prime"),
      videoSelector: ".atvwebplayersdk-video-surface video, video",
      nativeCaptionSelectors: [
        ".atvwebplayersdk-captions-text",
        ".atvwebplayersdk-captions-overlay p"
      ],
      nativeCaptionFilterSelectors: [
        ".atvwebplayersdk-captions-text span:not(:has(*))",
        ".atvwebplayersdk-captions-text"
      ]
    }
  });

  function forHostname(hostname) {
    const normalised = String(hostname || "").toLowerCase();
    return Object.values(ADAPTERS).find((adapter) => adapter.hostnames.has(normalised)) || null;
  }

  function findPlayer(adapter, root, options = {}) {
    if (!adapter || !root) return null;
    if (adapter.id === "bbc") {
      const video = options.video || findVideo(adapter, root);
      return findBbcPlayer(root, video);
    }
    if (adapter.id === "disney") {
      const video = options.video || findVideo(adapter, root);
      return safeClosest(video, ".btm-media-client, .media-element-container, [data-testid='disney-web-player-container']")
        || video?.getRootNode?.()?.host
        || video?.parentElement
        || null;
    }
    if (adapter.id === "netflix" || adapter.id === "prime") {
      const video = options.video || findVideo(adapter, root);
      const container = safeClosest(
        video,
        adapter.id === "prime"
          ? ".dv-web-player, .atvwebplayersdk-player-container, [aria-label='Web Player']"
          : ".watch-video, .VideoContainer, [data-uia*='player'], [data-uia='video-canvas']"
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
    if (adapter.id === "netflix" || adapter.id === "bbc" || adapter.id === "disney" || adapter.id === "prime") {
      const candidates = queryAll(adapter, root, adapter.videoSelector);
      return pickVideoCandidate(candidates);
    }
    if (!root.querySelector) return null;
    const player = findPlayer(adapter, root, options);
    return player?.querySelector(adapter.videoSelector) || root.querySelector(adapter.videoSelector);
  }

  function findBbcPlayer(root, video) {
    if (!video) return null;
    const captionLayer = findBbcCaptionLayer(root, video);
    let container = video.parentElement;
    while (captionLayer && container && container !== root.body && container !== root.documentElement) {
      if (container.contains?.(captionLayer)) return container;
      container = container.parentElement;
    }
    return safeClosest(video, "[data-testid*='player' i], [data-component*='player' i], [class*='player' i]")
      || video.parentElement
      || null;
  }

  function findBbcCaptionLayer(root, video) {
    const videoRect = safeRect(video);
    if (!videoRect) return null;
    return queryAll(ADAPTERS.bbc, root, "div[aria-live='polite']").find((candidate) => {
      const rect = safeRect(candidate);
      return rectsOverlap(videoRect, rect)
        && Number(rect?.width) >= Number(videoRect.width) * 0.5
        && Number(rect?.height) >= Number(videoRect.height) * 0.5;
    }) || null;
  }

  function rectsOverlap(first, second) {
    if (!first || !second) return false;
    return Number(second.right) > Number(first.left)
      && Number(second.left) < Number(first.right)
      && Number(second.bottom) > Number(first.top)
      && Number(second.top) < Number(first.bottom);
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
      const candidates = queryAll(adapter, root, selector);
      const match = candidates.reverse().find((candidate) => isVisibleCaption(adapter, candidate, options.player));
      if (match) return match;
    }
    return null;
  }

  function measureNativeCaption(adapter, root, options = {}) {
    if (!adapter || !root) return null;
    for (const selector of adapter.nativeCaptionSelectors || []) {
      const candidates = queryAll(adapter, root, selector);
      const visible = candidates.filter((candidate) => isVisibleCaption(adapter, candidate, options.player));
      if (!visible.length) continue;
      const rect = unionRects(visible.map(safeRect).filter(Boolean));
      if (!rect) continue;
      return { rect, alignment: sharedTextAlignment(visible) };
    }
    return null;
  }

  function nativeCaptionElements(adapter, root, options = {}) {
    if (!adapter || !root) return [];
    const filterCandidates = captionElementsForSelectors(
      adapter,
      root,
      adapter.nativeCaptionFilterSelectors || [],
      options.player
    );
    return filterCandidates.length
      ? filterCandidates
      : captionElementsForSelectors(adapter, root, adapter.nativeCaptionSelectors || [], options.player);
  }

  function captionElementsForSelectors(adapter, root, selectors, player) {
    for (const selector of selectors) {
      const candidates = queryAll(adapter, root, selector).filter((candidate) => {
        if (!candidate || candidate.isConnected === false) return false;
        if (adapter.id === "netflix" && safeClosest(candidate, "[class*='billboard'], [data-uia*='billboard'], [class*='previewModal'], [data-uia*='previewModal']")) return false;
        const owner = adapter.id === "youtube" ? safeClosest(candidate, ".html5-video-player") : null;
        if (adapter.id === "bbc" && player?.contains && !player.contains(candidate)) return false;
        return !player || !owner || owner === player;
      });
      if (candidates.length) return candidates;
    }
    return [];
  }

  function queryAll(adapter, root, selector) {
    return captionRoots(adapter, root).flatMap((queryRoot) => {
      if (queryRoot.querySelectorAll) return Array.from(queryRoot.querySelectorAll(selector));
      return [queryRoot.querySelector?.(selector)].filter(Boolean);
    });
  }

  function captionRoots(adapter, root) {
    if (!root) return [];
    const roots = [root];
    const hostSelectors = adapter?.shadowHostSelectors || [];
    if (!hostSelectors.length) return roots;
    const pending = hostSelectors.flatMap((selector) => Array.from(root.querySelectorAll?.(selector) || []))
      .map((host) => host.shadowRoot)
      .filter(Boolean);
    const seen = new Set(roots);
    let pendingIndex = 0;
    while (pendingIndex < pending.length) {
      const current = pending[pendingIndex];
      pendingIndex += 1;
      if (!current || seen.has(current)) continue;
      seen.add(current);
      roots.push(current);
      for (const element of current.querySelectorAll?.("*") || []) {
        if (element.shadowRoot && !seen.has(element.shadowRoot)) pending.push(element.shadowRoot);
      }
    }
    return roots;
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
    if (adapter.id === "bbc" && player?.contains && !player.contains(candidate)) return false;
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
    captionRoots,
    hasNativeCaptions,
    mutationsContainVideo,
    mutationsContainNativeCaptions
  };
});
