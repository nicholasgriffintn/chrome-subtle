(function initialiseDisneyBridge() {
  "use strict";

  if (globalThis.__subtleDisneyBridgeLoaded) return;
  globalThis.__subtleDisneyBridgeLoaded = true;

  const TRACK_EVENT = "subtle:disney-tracks";
  const TRACK_REQUEST_EVENT = "subtle:request-disney-tracks";
  const CONTENT_REQUEST_EVENT = "subtle:request-disney-track-content";
  const CONTENT_EVENT = "subtle:disney-track-content";
  const MAX_TRACK_BYTES = 5_000_000;
  const MEDIA_DOMAINS = Object.freeze(["dssott.com", "dssedge.com", "bamgrid.com", "disneyplus.com"]);
  const manifests = new Map();
  const cueCache = new Map();
  const pendingManifests = new Map();

  function currentContentId() {
    return /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?play\/([a-f\d-]{36})(?:\/|$)/i.exec(location.pathname)?.[1] || "";
  }

  function capturePlaybackPayload(value) {
    const sources = value?.stream?.sources;
    if (!Array.isArray(sources)) return;
    const manifestUrl = sources.map((source) => source?.complete?.url).find(validDisneyMediaUrl);
    const contentId = currentContentId();
    if (manifestUrl && contentId) void captureManifest(manifestUrl, contentId);
  }

  async function captureManifest(manifestUrl, contentId) {
    const key = `${contentId}:${manifestUrl}`;
    if (pendingManifests.has(key)) return pendingManifests.get(key);
    const pending = (async () => {
      try {
        const source = await fetchText(manifestUrl, 2_000_000);
        const rawTracks = globalThis.SubtleHlsCaptions.subtitleTracks(source, manifestUrl);
        if (!rawTracks.length) return [];
        const tracks = rawTracks.map((track, index) => ({
          ...track,
          id: `disney-track-${index + 1}`,
          contentId,
          format: "webvtt"
        }));
        manifests.set(contentId, { manifestUrl, tracks, capturedAt: Date.now() });
        trimMap(manifests, 8);
        if (contentId === currentContentId()) publishTracks(contentId);
        return tracks;
      } catch (_error) {
        return [];
      } finally {
        pendingManifests.delete(key);
      }
    })();
    pendingManifests.set(key, pending);
    return pending;
  }

  function publishTracks(contentId = currentContentId()) {
    const manifest = manifests.get(contentId);
    if (!manifest) return false;
    const tracks = manifest.tracks.map((track) => ({
      id: track.id,
      contentId: track.contentId,
      languageCode: track.languageCode,
      label: captionLabel(track.label, track.isCaption),
      isCaption: track.isCaption,
      format: track.format
    }));
    document.dispatchEvent(new CustomEvent(TRACK_EVENT, { detail: { contentId, tracks } }));
    return true;
  }

  async function handleTrackRequest() {
    if (publishTracks()) return;
    const candidates = Array.from(performance.getEntriesByType?.("resource") || [])
      .map((entry) => String(entry?.name || ""))
      .filter((url) => /[.]m3u8(?:[?#]|$)/i.test(url) && validDisneyMediaUrl(url))
      .toReversed()
      .slice(0, 20);
    const contentId = currentContentId();
    for (const url of candidates) {
      if ((await captureManifest(url, contentId)).length) break;
    }
    publishTracks(contentId);
  }

  async function handleContentRequest(event) {
    const requestId = boundedText(event.detail?.requestId, 120);
    const contentId = boundedText(event.detail?.contentId, 80);
    const trackId = boundedText(event.detail?.trackId, 120);
    if (!requestId || contentId !== currentContentId() || !trackId) return;
    const track = manifests.get(contentId)?.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      publishContent({ requestId, contentId, trackId, error: "That Disney+ caption track is no longer available." });
      return;
    }
    const cacheKey = `${contentId}:${trackId}`;
    try {
      let text = cueCache.get(cacheKey);
      if (!text) {
        text = await fetchTrack(track);
        cueCache.set(cacheKey, text);
        trimMap(cueCache, 4);
      }
      publishContent({ requestId, contentId, trackId, format: "webvtt", text });
    } catch (_error) {
      publishContent({ requestId, contentId, trackId, error: "Disney+ did not return that caption track." });
    }
  }

  async function fetchTrack(track) {
    const playlist = await fetchText(track.playlistUrl, 2_000_000);
    const segments = globalThis.SubtleHlsCaptions.mediaSegments(playlist, track.playlistUrl);
    if (!segments.length) throw new Error("Disney+ returned an empty caption playlist.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let totalBytes = 0;
    try {
      const payloads = [];
      for (let index = 0; index < segments.length; index += 6) {
        const batch = segments.slice(index, index + 6);
        const texts = await Promise.all(batch.map((segment) => fetchText(segment.url, 500_000, controller.signal)));
        for (let offset = 0; offset < batch.length; offset += 1) {
          totalBytes += texts[offset].length;
          if (totalBytes > MAX_TRACK_BYTES) throw new Error("Disney+ caption track is too large.");
          payloads.push({ start: batch[offset].start, text: texts[offset] });
        }
      }
      const text = globalThis.SubtleHlsCaptions.assembleWebVtt(payloads);
      if (!text.includes("-->")) throw new Error("Disney+ returned no readable captions.");
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchText(url, maximumLength, signal) {
    if (!validDisneyMediaUrl(url)) throw new Error("Invalid Disney+ caption URL.");
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Disney+ caption request failed (${response.status}).`);
    const text = await response.text();
    if (!text.trim() || text.length > maximumLength) throw new Error("Disney+ returned an unreadable caption response.");
    return text;
  }

  function publishContent(detail) {
    document.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail }));
  }

  function captionLabel(value, isCaption) {
    const label = boundedText(value, 120) || "Unknown";
    return isCaption && !/\b(?:cc|sdh)\b/i.test(label) ? `${label} [CC]` : label;
  }

  function validDisneyMediaUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      const hostname = url.hostname.toLowerCase();
      return url.protocol === "https:"
        && url.href.length <= 16_384
        && MEDIA_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch (_error) {
      return false;
    }
  }

  function boundedText(value, maximumLength) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  }

  function trimMap(map, maximumSize) {
    while (map.size > maximumSize) map.delete(map.keys().next().value);
  }

  const originalParse = JSON.parse;
  JSON.parse = function subtleDisneyParse(value) {
    const result = Reflect.apply(originalParse, this, arguments);
    try {
      capturePlaybackPayload(result);
    } catch (_error) {
      // Disney's original parser result remains authoritative.
    }
    return result;
  };

  document.addEventListener(TRACK_REQUEST_EVENT, handleTrackRequest);
  document.addEventListener(CONTENT_REQUEST_EVENT, handleContentRequest);
})();
