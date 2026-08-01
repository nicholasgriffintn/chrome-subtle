(function exposeSubtleRuntime(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleRuntime(root) {
  "use strict";

  const TRACK_EVENT = "subtle:youtube-tracks";
  const TRACK_REQUEST_EVENT = "subtle:request-youtube-tracks";

  function start() {
    const controller = createController();
    controller.initialise().catch(controller.reportError);
    return controller;
  }

  function createController() {
    const adapter = root.SubtitleAdapters.forHostname(location.hostname);
    let state = root.SubtleState.createDefaultState();
    let player;
    let video;
    let nativeCaption;
    let nativeCaptionSearchAfter = 0;
    let overlay;
    let cues = [];
    let tracks = [];
    let cueSourceKey = "";
    let cueError = "";
    let frame;
    let refreshTimer;
    let observer;
    let eventController;
    let stopped = false;

    async function initialise() {
      if (!adapter || stopped) return;
      await waitForDocumentRoot();
      const stored = await chrome.storage.local.get(root.SubtleState.STORAGE_KEY);
      state = root.SubtleState.normaliseState(stored[root.SubtleState.STORAGE_KEY]);
      bindEvents();
      applyState();
      refreshPageTargets();
      if (adapter.id !== "youtube") await loadCues();
      if (adapter.id === "youtube") document.dispatchEvent(new CustomEvent(TRACK_REQUEST_EVENT));
    }

    function bindEvents() {
      eventController = new AbortController();
      const signal = eventController.signal;
      chrome.storage.onChanged.addListener(handleStorageChange);
      chrome.runtime.onMessage.addListener(handleStatusMessage);
      document.addEventListener(TRACK_EVENT, handleYouTubeTracks, { signal });
      document.addEventListener("play", scheduleRefresh, { capture: true, signal });
      window.addEventListener("popstate", scheduleRefresh, { signal });
      window.addEventListener("hashchange", scheduleRefresh, { signal });
      document.addEventListener("yt-navigate-finish", scheduleRefresh, { signal });
      observer = new MutationObserver((mutations) => {
        const targetsConnected = player?.isConnected && video?.isConnected;
        if (targetsConnected && !root.SubtitleAdapters.mutationsContainVideo(mutations)) return;
        scheduleRefresh();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function handleStorageChange(changes, areaName) {
      if (stopped) return;
      const change = changes[root.SubtleState.STORAGE_KEY];
      if (areaName !== "local" || !change) return;
      state = root.SubtleState.normaliseState(change.newValue);
      applyState();
      loadCues();
    }

    function handleStatusMessage(message, _sender, sendResponse) {
      if (stopped || message?.type !== "GET_SUBTLE_STATUS") return;
      sendResponse(status());
    }

    function scheduleRefresh() {
      if (stopped || !hasLiveContext() || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (stopped) return;
        refreshPageTargets();
      }, 250);
    }

    function refreshPageTargets() {
      if (stopped) return;
      const options = { pathname: location.pathname };
      const nextVideo = root.SubtitleAdapters.findVideo(adapter, document, options);
      const nextPlayer = root.SubtitleAdapters.findPlayer(adapter, document, { ...options, video: nextVideo });
      if (nextPlayer !== player) {
        root.SubtleOverlay.remove(overlay);
        overlay = null;
        player = nextPlayer;
        nativeCaption = undefined;
        nativeCaptionSearchAfter = 0;
      }
      if (nextVideo !== video) {
        video?.removeEventListener("timeupdate", renderCurrentCue);
        video?.removeEventListener("play", startFrameLoop);
        video = nextVideo;
        video?.addEventListener("timeupdate", renderCurrentCue, { passive: true });
        video?.addEventListener("play", startFrameLoop, { passive: true });
      }
      ensureOverlay();
      if (adapter.id === "youtube") document.dispatchEvent(new CustomEvent(TRACK_REQUEST_EVENT));
      reportStatus();
    }

    function applyState() {
      const rootElement = document.documentElement;
      rootElement.toggleAttribute("data-subtle-enabled", state.enabled);
      rootElement.dataset.subtleMode = state.mode;
      rootElement.dataset.subtlePosition = state.position;
      const edge = root.SubtleOverlay.edgeTreatment(state.edgeStyle, state.outlineWidth);
      rootElement.style.setProperty("--subtle-font-size", `${state.fontSize}px`);
      rootElement.style.setProperty("--subtle-text-colour", root.SubtleOverlay.hexToRgba(state.textColor, state.textOpacity));
      rootElement.style.setProperty("--subtle-caption-background", root.SubtleOverlay.hexToRgba(state.backgroundColor, state.backgroundOpacity));
      rootElement.style.setProperty("--subtle-window-background", root.SubtleOverlay.hexToRgba(state.windowColor, state.windowOpacity));
      rootElement.style.setProperty("--subtle-edge-stroke", edge.stroke);
      rootElement.style.setProperty("--subtle-edge-shadow", edge.shadow);
      rootElement.style.setProperty("--subtle-font-family", root.SubtleOverlay.fontStack(state.fontFamily));
      rootElement.style.setProperty("--subtle-font-variant", root.SubtleOverlay.fontVariant(state.fontFamily));
      rootElement.style.setProperty("--subtle-offset", `${state.offset}%`);
      rootElement.style.setProperty("--subtle-primary-offset", `calc(${state.offset}% + ${Math.round(state.fontSize * 1.5)}px)`);
      ensureOverlay();
      renderCurrentCue();
    }

    function ensureOverlay() {
      const shouldShow = state.enabled && state.mode === "dual" && Boolean(player);
      if (!shouldShow) {
        root.SubtleOverlay.remove(overlay);
        overlay = null;
        stopFrameLoop();
        return;
      }
      overlay = overlay || root.SubtleOverlay.create(player);
      startFrameLoop();
    }

    async function handleYouTubeTracks(event) {
      if (stopped || adapter.id !== "youtube") return;
      tracks = root.SubtleYouTubeCaptions.normaliseTracks(event.detail?.tracks);
      cueSourceKey = "";
      await loadCues();
      reportStatus();
    }

    async function loadCues() {
      if (stopped) return;
      const secondarySource = root.SubtleState.effectiveSecondarySource(state, adapter.id);
      const sourceKey = JSON.stringify([
        secondarySource,
        state.targetLanguage,
        state.uploadedTrack?.name,
        root.SubtleCues.fingerprintText(state.uploadedTrack?.text || ""),
        tracks.map((track) => [track.languageCode, track.baseUrl])
      ]);
      if (sourceKey === cueSourceKey) return;
      try {
        if (secondarySource === "upload") {
          cues = root.SubtleCues.parseTimedText(state.uploadedTrack?.text || "");
        } else if (adapter.id === "youtube") {
          const track = root.SubtleYouTubeCaptions.selectTrack(tracks, navigator.language);
          cues = track ? await root.SubtleYouTubeCaptions.loadTrack(track, state.targetLanguage, fetch) : [];
        } else {
          cues = [];
        }
        cueSourceKey = sourceKey;
        cueError = "";
      } catch (error) {
        cues = [];
        cueSourceKey = "";
        cueError = error instanceof Error ? error.message : "The second subtitle line is unavailable.";
      }
      renderCurrentCue();
      reportStatus();
    }

    function renderCurrentCue() {
      if (stopped || !overlay || !video || !state.enabled || state.mode !== "dual") return;
      const time = video.currentTime - (state.delayMs / 1000);
      let cue = root.SubtleCues.cueAtTime(cues, time);
      if (cue && state.hideSoundCues && root.SubtleCues.isSoundCue(cue.text)) cue = null;
      root.SubtleOverlay.render(overlay, cue, state);
      if (!cue) {
        root.SubtleOverlay.positionNearNative(overlay, player, null);
        return;
      }
      const now = performance.now();
      if ((!nativeCaption?.isConnected || !String(nativeCaption.textContent || "").trim()) && now >= nativeCaptionSearchAfter) {
        nativeCaption = root.SubtitleAdapters.findNativeCaption(adapter, document, { player });
        nativeCaptionSearchAfter = now + 400;
      }
      if (nativeCaption && !root.SubtleOverlay.positionNearNative(overlay, player, nativeCaption)) {
        nativeCaption = undefined;
        nativeCaptionSearchAfter = 0;
      }
    }

    function startFrameLoop() {
      if (stopped || !hasLiveContext() || frame || !video) return;
      const tick = () => {
        frame = undefined;
        if (!hasLiveContext()) return;
        renderCurrentCue();
        if (overlay && !video.paused && !video.ended) frame = requestAnimationFrame(tick);
      };
      if (!video.paused) frame = requestAnimationFrame(tick);
    }

    function stopFrameLoop() {
      if (frame) cancelAnimationFrame(frame);
      frame = undefined;
    }

    function status() {
      const secondarySource = root.SubtleState.effectiveSecondarySource(state, adapter.id);
      return {
        ok: true,
        platformId: adapter.id,
        platform: adapter.label,
        playerFound: Boolean(player),
        nativeCaptionsFound: root.SubtitleAdapters.hasNativeCaptions(adapter, document),
        cueCount: cues.length,
        trackCount: tracks.length,
        secondarySource,
        sourceAvailable: secondarySource === "upload" ? Boolean(state.uploadedTrack) : tracks.length > 0,
        error: cueError
      };
    }

    function reportStatus() {
      if (stopped) return;
      root.SubtleRuntimeContext.sendMessageSafely(
        chrome.runtime,
        { type: "SUBTLE_STATUS", status: status() },
        stop
      );
    }

    function hasLiveContext() {
      if (root.SubtleRuntimeContext.hasContext(chrome.runtime)) return true;
      stop();
      return false;
    }

    function reportError(error) {
      if (root.SubtleRuntimeContext.isInvalidated(error, chrome.runtime)) {
        stop();
        return;
      }
      console.debug("Subtle:", error);
      cues = [];
      cueError = error instanceof Error ? error.message : "Subtle could not initialise.";
      reportStatus();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
      stopFrameLoop();
      observer?.disconnect();
      eventController?.abort();
      video?.removeEventListener("timeupdate", renderCurrentCue);
      video?.removeEventListener("play", startFrameLoop);
      try {
        chrome.storage.onChanged.removeListener(handleStorageChange);
        chrome.runtime.onMessage.removeListener(handleStatusMessage);
      } catch (_error) {
        // Invalidated contexts cannot unregister Chrome listeners; they are already detached by Chrome.
      }
      root.SubtleOverlay.remove(overlay);
      overlay = null;
      player = undefined;
      video = undefined;
      nativeCaption = undefined;
      nativeCaptionSearchAfter = 0;
    }

    function waitForDocumentRoot() {
      if (document.documentElement) return Promise.resolve();
      return new Promise((resolve) => document.addEventListener("readystatechange", resolve, { once: true }));
    }

    return { initialise, reportError, status };
  }

  return { start };
});
