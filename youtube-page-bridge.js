(function initialiseYouTubeBridge() {
  "use strict";

  if (globalThis.__subtleYouTubeBridgeLoaded) return;
  globalThis.__subtleYouTubeBridgeLoaded = true;

  const TRACK_EVENT = "subtle:youtube-tracks";
  const TRACK_REQUEST_EVENT = "subtle:request-youtube-tracks";
  const CONTENT_REQUEST_EVENT = "subtle:request-youtube-track-content";
  const CONTENT_EVENT = "subtle:youtube-track-content";
  const TIMED_TEXT_PATH = "/api/timedtext";
  const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);
  const xhrUrl = Symbol("subtleTimedTextUrl");
  let capturedUrl = "";
  let capturedVideoId = "";
  const pageFetch = globalThis.fetch;

  function parseTimedTextUrl(value) {
    if (!value) return null;
    const source = String(value);
    if (!source.includes(TIMED_TEXT_PATH)) return null;
    let url;
    try {
      url = new URL(source, location.href);
    } catch (_error) {
      return null;
    }
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.pathname !== TIMED_TEXT_PATH) return null;
    if (url.searchParams.has("tlang") || url.searchParams.has("subtle_client")) return null;
    if (!url.searchParams.get("pot")) return null;
    return url;
  }

  function currentVideoId() {
    const page = new URL(location.href);
    if (page.pathname.startsWith("/shorts/")) return page.pathname.split("/")[2] || "";
    if (page.pathname.startsWith("/embed/")) return page.pathname.split("/")[2] || "";
    return page.searchParams.get("v") || "";
  }

  function capture(value) {
    const url = parseTimedTextUrl(value);
    if (!url) return;
    const requestVideoId = url.searchParams.get("v") || currentVideoId();
    const pageVideoId = currentVideoId();
    if (pageVideoId && requestVideoId && pageVideoId !== requestVideoId) return;
    if (url.href === capturedUrl && requestVideoId === capturedVideoId) return;
    capturedUrl = url.href;
    capturedVideoId = requestVideoId;
    publish();
  }

  function publish() {
    if (!capturedUrl) return;
    const pageVideoId = currentVideoId();
    if (pageVideoId && capturedVideoId && pageVideoId !== capturedVideoId) return;
    const url = new URL(capturedUrl);
    const languageCode = url.searchParams.get("lang") || "und";
    document.dispatchEvent(new CustomEvent(TRACK_EVENT, {
      detail: {
        videoId: capturedVideoId || pageVideoId,
        availableLanguages: currentCaptionTracks().map(({ sourceUrl: _sourceUrl, kind: _kind, ...language }) => language),
        tracks: [{
          baseUrl: url.href,
          languageCode,
          label: url.searchParams.get("name") || languageCode,
          kind: url.searchParams.get("kind") || "standard"
        }]
      }
    }));
  }

  function activePlayer() {
    const selector = String(location.pathname || "").startsWith("/shorts/")
      ? "#shorts-player"
      : "#movie_player";
    return document.querySelector?.(selector) || null;
  }

  function currentCaptionTracks() {
    try {
      const player = activePlayer();
      const response = player?.getPlayerResponse?.();
      if (response?.videoDetails?.videoId && response.videoDetails.videoId !== currentVideoId()) return [];
      const playerTracks = player?.getOption?.("captions", "tracklist");
      const input = Array.isArray(playerTracks) && playerTracks.length
        ? playerTracks
        : response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(input)) return [];
      const seen = new Set();
      return input.slice(0, 200).flatMap((language) => {
        const languageCode = String(language?.languageCode || "").trim().slice(0, 35);
        const key = languageCode.toLowerCase();
        if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(languageCode) || seen.has(key)) return [];
        seen.add(key);
        const name = language?.name || language?.languageName;
        const displayName = language?.displayName;
        const label = name?.simpleText
          || name?.runs?.map((run) => run?.text || "").join("")
          || (typeof displayName === "string" ? displayName : displayName?.simpleText)
          || displayName?.runs?.map((run) => run?.text || "").join("")
          || languageCode;
        return [{
          languageCode,
          label: String(label).replace(/\s+/g, " ").trim().slice(0, 120) || languageCode,
          kind: language?.kind === "asr" ? "asr" : "standard",
          sourceUrl: String(language?.baseUrl || language?.url || "").slice(0, 16_384)
        }];
      });
    } catch (_error) {
      return [];
    }
  }

  async function handleContentRequest(event) {
    const requestId = String(event.detail?.requestId || "").trim().slice(0, 120);
    const requestedLanguage = String(event.detail?.targetLanguage || "").trim().slice(0, 35);
    const language = currentCaptionTracks().find((candidate) => (
      candidate.languageCode.toLowerCase() === requestedLanguage.toLowerCase()
    ));
    if (!requestId || !language || !capturedUrl || typeof pageFetch !== "function") return;
    if (capturedVideoId && capturedVideoId !== currentVideoId()) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = directTrackUrl(language);
      if (!url) throw new Error("invalid track URL");
      url.searchParams.set("fmt", "json3");
      url.searchParams.delete("tlang");
      const response = await pageFetch(url.href, {
        method: "GET",
        credentials: "include",
        signal: controller.signal
      });
      if (!response.ok) {
        const error = response.status === 429
          ? "YouTube is rate-limiting this caption track. Waiting for the player's next caption request."
          : `YouTube captions returned ${response.status}.`;
        publishContent({ requestId, status: response.status, error });
        return;
      }
      const text = await response.text();
      if (text.length > 5_000_000) throw new Error("oversized response");
      publishContent({ requestId, status: response.status, text });
    } catch (_error) {
      publishContent({ requestId, error: "YouTube did not return translated captions." });
    } finally {
      clearTimeout(timeout);
    }
  }

  function publishContent(detail) {
    document.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail }));
  }

  function directTrackUrl(track) {
    try {
      const captured = new URL(capturedUrl);
      const url = track.sourceUrl ? new URL(track.sourceUrl, location.href) : new URL(captured.href);
      if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.pathname !== TIMED_TEXT_PATH) return null;
      const proof = captured.searchParams.get("pot");
      if (proof) url.searchParams.set("pot", proof);
      if (!track.sourceUrl) {
        url.searchParams.set("lang", track.languageCode);
        if (track.kind === "asr") url.searchParams.set("kind", "asr");
        else url.searchParams.delete("kind");
      }
      return url.searchParams.get("pot") ? url : null;
    } catch (_error) {
      return null;
    }
  }

  function scanResourceTiming() {
    try {
      const entries = performance.getEntriesByType?.("resource") || [];
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (parseTimedTextUrl(entries[index]?.name)) {
          capture(entries[index].name);
          return;
        }
      }
    } catch (_error) {
      // Resource timing is a fallback; the request hooks remain active.
    }
  }

  function hookXhr() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function subtleOpen(_method, url) {
      this[xhrUrl] = url;
      return Reflect.apply(originalOpen, this, arguments);
    };
    XMLHttpRequest.prototype.send = function subtleSend() {
      capture(this[xhrUrl]);
      return Reflect.apply(originalSend, this, arguments);
    };
  }

  function hookFetch() {
    const originalFetch = globalThis.fetch;
    if (typeof originalFetch !== "function") return;
    globalThis.fetch = function subtleFetch(input) {
      capture(typeof input === "string" || input instanceof URL ? input : input?.url);
      return Reflect.apply(originalFetch, this, arguments);
    };
  }

  function observeResources() {
    if (typeof PerformanceObserver !== "function") return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) capture(entry?.name);
      });
      observer.observe({ type: "resource", buffered: true });
    } catch (_error) {
      // Older Chromium versions are covered by the request hooks.
    }
  }

  hookXhr();
  hookFetch();
  observeResources();
  scanResourceTiming();

  document.addEventListener(TRACK_REQUEST_EVENT, () => {
    scanResourceTiming();
    publish();
  });
  document.addEventListener(CONTENT_REQUEST_EVENT, handleContentRequest);
  document.addEventListener("yt-navigate-finish", () => {
    if (capturedVideoId !== currentVideoId()) {
      capturedUrl = "";
      capturedVideoId = "";
    }
    scanResourceTiming();
  });
})();
