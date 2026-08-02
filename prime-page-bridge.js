(function initialisePrimeBridge() {
  "use strict";

  if (globalThis.__subtlePrimeBridgeLoaded) return;
  globalThis.__subtlePrimeBridgeLoaded = true;

  const TRACK_EVENT = "subtle:prime-tracks";
  const TRACK_REQUEST_EVENT = "subtle:request-prime-tracks";
  const CONTENT_REQUEST_EVENT = "subtle:request-prime-track-content";
  const CONTENT_EVENT = "subtle:prime-track-content";
  const MAX_RESPONSE_BYTES = 5_000_000;
  const MEDIA_DOMAINS = Object.freeze([
    "pv-cdn.net",
    "amazonvideo.com",
    "media-amazon.com",
    "ssl-images-amazon.com",
    "amazonaws.com"
  ]);
  const PRIME_SERVICE_DOMAINS = Object.freeze([
    "amazon.ae", "amazon.ca", "amazon.co.jp", "amazon.co.uk", "amazon.co.za", "amazon.com",
    "amazon.com.au", "amazon.com.be", "amazon.com.br", "amazon.com.mx", "amazon.com.tr",
    "amazon.de", "amazon.eg", "amazon.es", "amazon.fr", "amazon.ie", "amazon.in", "amazon.it",
    "amazon.nl", "amazon.pl", "amazon.sa", "amazon.se", "amazon.sg", "primevideo.com"
  ]);
  const playbacks = new Map();
  const cueCache = new Map();

  function currentPageContentKey() {
    try {
      const url = new URL(location.href);
      const parameter = ["asin", "entityId", "titleId"]
        .map((name) => url.searchParams.get(name))
        .find(Boolean);
      if (parameter) return boundedText(parameter, 240);
    } catch (_error) {
      // Prime's ordinary detail path remains available below.
    }
    return boundedText(/\/(?:detail|dp)\/([^/?#]+)/i.exec(location.pathname)?.[1], 240);
  }

  function capturePlaybackPayload(value, requestUrl) {
    const resources = value?.timedTextUrls?.result || value?.resources?.playbackResources;
    if (!resources) return;
    const pageContentKey = currentPageContentKey();
    const contentId = playbackContentId(value, requestUrl) || pageContentKey;
    if (!pageContentKey || !contentId) return;
    const subtitles = Array.isArray(resources.subtitleUrls) ? resources.subtitleUrls : [];
    const forced = Array.isArray(resources.forcedNarrativeUrls) ? resources.forcedNarrativeUrls : [];
    const tracks = normaliseTracks(subtitles, forced, contentId);
    if (!tracks.length) return;
    playbacks.set(pageContentKey, { contentId, tracks, capturedAt: Date.now() });
    trimMap(playbacks, 8);
    publishTracks(pageContentKey);
  }

  function normaliseTracks(subtitles, forced, contentId) {
    const seenUrls = new Set();
    return [
      ...subtitles.map((track) => ({ track, isForced: false })),
      ...forced.map((track) => ({ track, isForced: true }))
    ].slice(0, 120).flatMap(({ track, isForced }) => {
      const url = validPrimeMediaUrl(track?.url);
      if (!url || seenUrls.has(url.href)) return [];
      seenUrls.add(url.href);
      const languageCode = boundedText(track?.languageCode || track?.language || "und", 35);
      const label = boundedText(track?.displayName || track?.languageName || languageCode, 120);
      const type = boundedText(track?.type, 40);
      return [{
        id: `prime-track-${seenUrls.size}`,
        contentId,
        languageCode,
        label: captionLabel(label, type),
        isCaption: /(?:caption|sdh|cc)/i.test(`${type} ${label}`),
        isForced,
        format: timedTextFormat(track, url),
        url: url.href
      }];
    });
  }

  function publishTracks(pageContentKey = currentPageContentKey()) {
    const playback = playbacks.get(pageContentKey);
    if (!playback) return false;
    const tracks = playback.tracks.map(({ url: _url, ...track }) => track);
    document.dispatchEvent(new CustomEvent(TRACK_EVENT, { detail: { pageContentKey, tracks } }));
    return true;
  }

  async function handleContentRequest(event) {
    const requestId = boundedText(event.detail?.requestId, 120);
    const contentId = boundedText(event.detail?.contentId, 240);
    const trackId = boundedText(event.detail?.trackId, 120);
    if (!requestId || !contentId || !trackId) return;
    const playback = playbacks.get(currentPageContentKey());
    const track = playback?.contentId === contentId
      ? playback.tracks.find((candidate) => candidate.id === trackId)
      : null;
    if (!track) {
      publishContent({ requestId, contentId, trackId, error: "That Prime Video caption track is no longer available." });
      return;
    }
    const cacheKey = `${contentId}:${trackId}`;
    try {
      let text = cueCache.get(cacheKey);
      if (!text) {
        text = await fetchText(track.url);
        cueCache.set(cacheKey, text);
        trimMap(cueCache, 4);
      }
      publishContent({ requestId, contentId, trackId, format: track.format, text });
    } catch (_error) {
      publishContent({ requestId, contentId, trackId, error: "Prime Video did not return that caption track." });
    }
  }

  async function fetchText(value) {
    const url = validPrimeMediaUrl(value);
    if (!url) throw new Error("Invalid Prime Video caption URL.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url.href, { credentials: "omit", signal: controller.signal });
      if (!response.ok) throw new Error(`Prime Video caption request failed (${response.status}).`);
      const text = await response.text();
      if (!text.trim() || text.length > MAX_RESPONSE_BYTES) {
        throw new Error("Prime Video returned an unreadable caption response.");
      }
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  function inspectResponse(response, requestUrl) {
    if (!response?.clone || !isPlaybackRequest(requestUrl)) return;
    response.clone().text().then((text) => {
      if (!text || text.length > MAX_RESPONSE_BYTES) return;
      try {
        capturePlaybackPayload(JSON.parse(text), requestUrl);
      } catch (_error) {
        // Prime's response remains authoritative when it is not JSON playback metadata.
      }
    }).catch(() => {});
  }

  function installFetchHook() {
    const originalFetch = globalThis.fetch;
    if (typeof originalFetch !== "function") return;
    globalThis.fetch = function subtlePrimeFetch(input) {
      const requestUrl = requestUrlFrom(input);
      const pending = Reflect.apply(originalFetch, this, arguments);
      if (!isPlaybackRequest(requestUrl)) return pending;
      return Promise.resolve(pending).then((response) => {
        inspectResponse(response, requestUrl);
        return response;
      });
    };
  }

  function installXhrHook() {
    const prototype = globalThis.XMLHttpRequest?.prototype;
    if (!prototype?.open || !prototype?.send) return;
    const originalOpen = prototype.open;
    const originalSend = prototype.send;
    prototype.open = function subtlePrimeOpen(_method, url) {
      this.__subtlePrimeUrl = requestUrlFrom(url);
      return Reflect.apply(originalOpen, this, arguments);
    };
    prototype.send = function subtlePrimeSend() {
      const requestUrl = this.__subtlePrimeUrl;
      if (isPlaybackRequest(requestUrl)) {
        this.addEventListener("load", () => inspectXhr(this, requestUrl), { once: true });
      }
      return Reflect.apply(originalSend, this, arguments);
    };
  }

  function inspectXhr(request, requestUrl) {
    try {
      if (request.responseType === "json") capturePlaybackPayload(request.response, requestUrl);
      else if (!request.responseType || request.responseType === "text") {
        const text = String(request.responseText || "");
        if (text && text.length <= MAX_RESPONSE_BYTES) capturePlaybackPayload(JSON.parse(text), requestUrl);
      }
    } catch (_error) {
      // Prime owns the request lifecycle; inspection must never affect playback.
    }
  }

  function playbackContentId(value, requestUrl) {
    const fromPayload = value?.id
      || value?.entityId
      || value?.catalogId
      || value?.videoId
      || value?.resources?.playbackRestrictions?.identifier
      || value?.resources?.catalogMetadataV2?.catalog?.id
      || value?.catalogMetadataV2?.catalog?.id;
    if (fromPayload) return boundedText(fromPayload, 240);
    try {
      const url = new URL(requestUrl, location.href);
      return boundedText(["asin", "entityId", "titleId"]
        .map((name) => url.searchParams.get(name))
        .find(Boolean), 240);
    } catch (_error) {
      return "";
    }
  }

  function isPlaybackRequest(value) {
    if (!/(?:GetVodPlaybackResources|playerChromeResources)/i.test(String(value || ""))) return false;
    try {
      const url = new URL(String(value || ""), location.href);
      const hostname = url.hostname.toLowerCase();
      return url.protocol === "https:" && PRIME_SERVICE_DOMAINS.some((domain) => (
        hostname === domain || hostname.endsWith(`.${domain}`)
      ));
    } catch (_error) {
      return false;
    }
  }

  function requestUrlFrom(value) {
    if (typeof value === "string") return value;
    if (value instanceof URL) return value.href;
    return String(value?.url || "");
  }

  function validPrimeMediaUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      const hostname = url.hostname.toLowerCase();
      const trustedAmazonHost = /^(?:www[.])?amazon[.](?:ae|ca|co[.]jp|co[.]uk|co[.]za|com|com[.]au|com[.]be|com[.]br|com[.]mx|com[.]tr|de|eg|es|fr|ie|in|it|nl|pl|sa|se|sg)$/.test(hostname);
      return url.protocol === "https:"
        && url.href.length <= 16_384
        && (trustedAmazonHost || MEDIA_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)))
        ? url
        : null;
    } catch (_error) {
      return null;
    }
  }

  function timedTextFormat(track, url) {
    const declared = boundedText(track?.format, 20).toLowerCase();
    if (declared.includes("vtt") || /[.]vtt(?:$|[?#])/i.test(url.href)) return "webvtt";
    return "ttml";
  }

  function captionLabel(value, type) {
    const label = boundedText(value, 120) || "Unknown";
    return /(?:caption|sdh|cc)/i.test(type) && !/\b(?:cc|sdh)\b/i.test(label) ? `${label} [CC]` : label;
  }

  function publishContent(detail) {
    document.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail }));
  }

  function boundedText(value, maximumLength) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  }

  function trimMap(map, maximumSize) {
    while (map.size > maximumSize) map.delete(map.keys().next().value);
  }

  installFetchHook();
  installXhrHook();
  document.addEventListener(TRACK_REQUEST_EVENT, () => publishTracks());
  document.addEventListener(CONTENT_REQUEST_EVENT, handleContentRequest);
})();
