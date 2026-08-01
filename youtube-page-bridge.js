(function initialiseYouTubeBridge() {
  "use strict";

  if (globalThis.__subtleYouTubeBridgeLoaded) return;
  globalThis.__subtleYouTubeBridgeLoaded = true;

  const TRACK_EVENT = "subtle:youtube-tracks";
  const TRACK_REQUEST_EVENT = "subtle:request-youtube-tracks";
  const TIMED_TEXT_PATH = "/api/timedtext";
  const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);
  const xhrUrl = Symbol("subtleTimedTextUrl");
  let capturedUrl = "";
  let capturedVideoId = "";

  function parseTimedTextUrl(value) {
    if (!value) return null;
    let url;
    try {
      url = new URL(String(value), location.href);
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
        tracks: [{
          baseUrl: url.href,
          languageCode,
          label: url.searchParams.get("name") || languageCode,
          kind: url.searchParams.get("kind") || "standard"
        }]
      }
    }));
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
  document.addEventListener("yt-navigate-finish", () => {
    if (capturedVideoId !== currentVideoId()) {
      capturedUrl = "";
      capturedVideoId = "";
    }
    scanResourceTiming();
  });
})();
