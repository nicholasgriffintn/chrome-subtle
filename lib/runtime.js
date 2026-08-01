(function exposeSubtleRuntime(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleRuntime(root) {
  "use strict";

  function start() {
    const controller = createController();
    controller.initialise().catch(controller.reportError);
    return controller;
  }

  function createController() {
    const adapter = root.SubtitleAdapters.forHostname(location.hostname);
    const captionProvider = root.SubtlePlatformCaptions.forPlatform(adapter?.id);
    let state = root.SubtleState.createDefaultState();
    let player;
    let video;
    let nativeLayoutAfter = 0;
    let nativeLayoutMissingSince = 0;
    let overlay;
    let cues = [];
    let tracks = [];
    let contentKey = "";
    let cueSourceKey = "";
    let pendingCueSourceKey = "";
    let cueError = "";
    let cueLoadId = 0;
    let frame;
    let refreshTimer;
    let observer;
    let eventController;
    let stopped = false;

    async function initialise() {
      if (!adapter || !captionProvider || stopped) return;
      await waitForDocumentRoot();
      const stored = await chrome.storage.local.get(root.SubtleState.STORAGE_KEY);
      state = root.SubtleState.normaliseState(stored[root.SubtleState.STORAGE_KEY]);
      bindEvents();
      applyState();
      refreshPageTargets();
      if (root.SubtleState.effectiveSecondarySource(state, adapter.id) === "upload") await loadCues();
    }

    function bindEvents() {
      eventController = new AbortController();
      const signal = eventController.signal;
      chrome.storage.onChanged.addListener(handleStorageChange);
      chrome.runtime.onMessage.addListener(handleStatusMessage);
      document.addEventListener(captionProvider.trackEvent, handlePlatformTracks, { signal });
      document.addEventListener("play", scheduleRefresh, { capture: true, signal });
      window.addEventListener("popstate", scheduleRefresh, { signal });
      window.addEventListener("hashchange", scheduleRefresh, { signal });
      document.addEventListener("yt-navigate-finish", scheduleRefresh, { signal });
      observer = new MutationObserver((mutations) => {
        const targetsConnected = player?.isConnected && video?.isConnected;
        if (!targetsConnected || root.SubtitleAdapters.mutationsContainVideo(mutations)) {
          scheduleRefresh();
          return;
        }
        if (root.SubtitleAdapters.mutationsContainNativeCaptions(adapter, mutations)) {
          nativeLayoutAfter = 0;
          renderCurrentCue();
        }
      });
      observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
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
      const nextContentKey = captionProvider.contentKey(location);
      if (nextContentKey !== contentKey) {
        contentKey = nextContentKey;
        tracks = [];
        cues = [];
        cueSourceKey = "";
        pendingCueSourceKey = "";
        cueError = "";
        cueLoadId += 1;
        renderCurrentCue();
      }
      const options = { pathname: location.pathname };
      const nextVideo = root.SubtitleAdapters.findVideo(adapter, document, options);
      const nextPlayer = root.SubtitleAdapters.findPlayer(adapter, document, { ...options, video: nextVideo });
      if (nextPlayer !== player) {
        root.SubtleOverlay.remove(overlay);
        overlay = null;
        player = nextPlayer;
        nativeLayoutAfter = 0;
        nativeLayoutMissingSince = 0;
      }
      if (nextVideo !== video) {
        video?.removeEventListener("timeupdate", renderCurrentCue);
        video?.removeEventListener("play", startFrameLoop);
        video = nextVideo;
        video?.addEventListener("timeupdate", renderCurrentCue, { passive: true });
        video?.addEventListener("play", startFrameLoop, { passive: true });
      }
      ensureOverlay();
      root.SubtlePlatformCaptions.requestTracks(captionProvider, document);
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

    async function handlePlatformTracks(event) {
      if (stopped) return;
      const nextTracks = captionProvider.tracksFromEvent(event.detail, location);
      if (nextTracks === null) return;
      tracks = nextTracks;
      contentKey = captionProvider.contentKey(location);
      await loadCues();
      reportStatus();
    }

    async function loadCues() {
      if (stopped) return;
      const secondarySource = root.SubtleState.effectiveSecondarySource(state, adapter.id);
      const sourceKey = JSON.stringify([
        secondarySource,
        contentKey,
        state.targetLanguage,
        state.uploadedTrack?.name,
        root.SubtleCues.fingerprintText(state.uploadedTrack?.text || ""),
        tracks.map((track) => [
          track.id,
          track.languageCode,
          track.baseUrl,
          (track.availableLanguages || []).map((language) => language.languageCode)
        ])
      ]);
      if (sourceKey === cueSourceKey || sourceKey === pendingCueSourceKey) return;
      pendingCueSourceKey = sourceKey;
      const loadId = ++cueLoadId;
      try {
        let nextCues;
        if (secondarySource === "upload") {
          nextCues = root.SubtleCues.parseTimedText(state.uploadedTrack?.text || "");
        } else {
          const track = captionProvider.selectTrack(tracks, state, navigator.language);
          nextCues = track ? await captionProvider.loadCues(track, state, {
            fetchImpl: fetch,
            documentRef: document,
            createEvent: (type, detail) => new CustomEvent(type, { detail })
          }) : [];
        }
        if (stopped || loadId !== cueLoadId) return;
        cues = nextCues;
        cueSourceKey = sourceKey;
        pendingCueSourceKey = "";
        cueError = "";
      } catch (error) {
        if (stopped || loadId !== cueLoadId) return;
        cues = [];
        cueSourceKey = Number(error?.status) === 429 ? sourceKey : "";
        pendingCueSourceKey = "";
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
      const overlayChanged = root.SubtleOverlay.render(overlay, cue, state);
      if (!cue) {
        root.SubtleOverlay.positionNearNative(overlay, player, null);
        nativeLayoutAfter = 0;
        nativeLayoutMissingSince = 0;
        return;
      }
      const now = performance.now();
      if (!overlayChanged && now < nativeLayoutAfter) return;
      nativeLayoutAfter = now + 50;
      const measurement = root.SubtitleAdapters.measureNativeCaption(adapter, document, { player });
      if (measurement) {
        nativeLayoutMissingSince = 0;
        root.SubtleOverlay.positionNearNative(overlay, player, measurement);
        return;
      }
      nativeLayoutMissingSince = nativeLayoutMissingSince || now;
      if (now - nativeLayoutMissingSince >= 500) root.SubtleOverlay.positionNearNative(overlay, player, null);
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
      const selectedTrack = secondarySource === "platform"
        ? captionProvider.selectTrack(tracks, state, navigator.language)
        : null;
      return {
        ok: true,
        platformId: adapter.id,
        platform: adapter.label,
        playerFound: Boolean(player),
        nativeCaptionsFound: root.SubtitleAdapters.hasNativeCaptions(adapter, document),
        cueCount: cues.length,
        trackCount: tracks.length,
        secondarySource,
        sourceLabel: captionProvider.sourceLabel,
        languageMode: captionProvider.languageMode,
        availableTracks: captionProvider.availableLanguages(tracks),
        selectedTrack: selectedTrack ? {
          languageCode: adapter.id === "youtube" ? selectedTrack.targetLanguage : selectedTrack.languageCode,
          label: adapter.id === "youtube" ? selectedTrack.targetLabel : selectedTrack.label
        } : null,
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
      nativeLayoutAfter = 0;
      nativeLayoutMissingSince = 0;
    }

    function waitForDocumentRoot() {
      if (document.documentElement) return Promise.resolve();
      return new Promise((resolve) => document.addEventListener("readystatechange", resolve, { once: true }));
    }

    return { initialise, reportError, status };
  }

  return { start };
});
