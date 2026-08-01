(function initialiseNetflixBridge() {
  "use strict";

  if (globalThis.__subtleNetflixBridgeLoaded) return;
  globalThis.__subtleNetflixBridgeLoaded = true;

  const TRACK_EVENT = "subtle:netflix-tracks";
  const TRACK_REQUEST_EVENT = "subtle:request-netflix-tracks";
  const CONTENT_REQUEST_EVENT = "subtle:request-netflix-track-content";
  const CONTENT_EVENT = "subtle:netflix-track-content";
  const WEBVTT_PROFILES = ["webvtt-lssdh-ios8", "webvtt-lssdh-ios"];
  const RECOGNISED_REQUEST_PROFILES = new Set(["dfxp-ls-sdh", "simplesdh", "imsc1.1"]);
  const manifests = new Map();

  function currentContentId() {
    return /^\/watch\/(\d+)/.exec(location.pathname)?.[1] || "";
  }

  function visitObjects(value, visitor, maximumDepth = 6, maximumObjects = 500) {
    if (!value || typeof value !== "object") return;
    const seen = new WeakSet();
    const queue = [{ value, depth: 0 }];
    let queueIndex = 0;
    let visited = 0;
    while (queueIndex < queue.length && visited < maximumObjects) {
      const next = queue[queueIndex];
      queueIndex += 1;
      const object = next.value;
      if (!object || typeof object !== "object" || seen.has(object)) continue;
      seen.add(object);
      try {
        if (typeof object.toJSON === "function") continue;
      } catch (_error) {
        continue;
      }
      visited += 1;
      try {
        visitor(object);
      } catch (_error) {
        // Netflix request objects can contain getters that disappear between reads.
      }
      if (next.depth >= maximumDepth) continue;
      try {
        const values = Array.isArray(object) ? object.slice(0, 120) : Object.values(object).slice(0, 120);
        for (const child of values) {
          if (child && typeof child === "object") queue.push({ value: child, depth: next.depth + 1 });
        }
      } catch (_error) {
        // A single inaccessible branch must not interfere with Netflix's serialisation.
      }
    }
  }

  function prepareManifestRequest(value) {
    visitObjects(value, (object) => {
      if (Object.prototype.hasOwnProperty.call(object, "showAllSubDubTracks")) {
        object.showAllSubDubTracks = true;
      }
      if (!Array.isArray(object.profiles)) return;
      const includesCaptionProfile = object.profiles.some((profile) => RECOGNISED_REQUEST_PROFILES.has(profile));
      if (!includesCaptionProfile) return;
      for (const profile of WEBVTT_PROFILES.toReversed()) {
        if (!object.profiles.includes(profile)) object.profiles.unshift(profile);
      }
    });
  }

  function captureManifests(value) {
    visitObjects(value, (object) => {
      const rawTracks = object.textTracks || object.timedtexttracks;
      const contentId = normaliseIdentifier(object.movieId, 40);
      if (!contentId || !Array.isArray(rawTracks)) return;
      const tracks = normaliseManifestTracks(rawTracks, contentId);
      if (!tracks.length) return;
      const previous = manifests.get(contentId);
      if (previous && previous.tracks.length > tracks.length) return;
      manifests.set(contentId, { tracks, capturedAt: Date.now() });
      trimManifests();
      if (contentId === currentContentId()) publishTracks(contentId);
    });
  }

  function normaliseManifestTracks(rawTracks, contentId) {
    const identifiers = new Set();
    return rawTracks.slice(0, 120).flatMap((track, index) => {
      if (!track || track.isNoneTrack || track.isForcedNarrative) return [];
      const downloadable = selectDownloadable(track.ttDownloadables || track.downloadables);
      if (!downloadable) return [];
      const languageCode = normaliseIdentifier(track.language || track.bcp47 || "und", 35) || "und";
      const baseIdentifier = normaliseIdentifier(track.new_track_id || track.id || track.trackId, 240)
        || `${languageCode}:${downloadable.format}:${index}`;
      const id = uniqueIdentifier(baseIdentifier, identifiers);
      const kind = normaliseIdentifier(track.rawTrackType || "subtitles", 40) || "subtitles";
      const isCaption = kind.toLowerCase() === "closedcaptions";
      const description = normaliseText(track.languageDescription || track.displayName || languageCode, 120);
      return [{
        id,
        contentId,
        languageCode,
        label: `${description || languageCode}${isCaption ? " [CC]" : ""}`,
        kind,
        isCaption,
        format: downloadable.format,
        urls: downloadable.urls
      }];
    });
  }

  function selectDownloadable(downloadables) {
    if (!downloadables || typeof downloadables !== "object") return null;
    const keys = Object.keys(downloadables);
    const ordered = [
      ...WEBVTT_PROFILES,
      "dfxp-ls-sdh",
      "imsc1.1",
      ...keys.filter((key) => key.toLowerCase().startsWith("imsc"))
    ];
    for (const profile of ordered) {
      const key = keys.find((candidate) => candidate.toLowerCase() === profile.toLowerCase());
      if (!key) continue;
      const urls = extractUrls(downloadables[key]);
      if (!urls.length) continue;
      const lower = key.toLowerCase();
      const format = lower.startsWith("webvtt") ? "webvtt" : lower.startsWith("imsc") ? "imsc" : "dfxp";
      return { format, urls };
    }
    return null;
  }

  function extractUrls(downloadable) {
    const values = [];
    if (downloadable?.downloadUrls && typeof downloadable.downloadUrls === "object") {
      values.push(...Object.values(downloadable.downloadUrls));
    }
    if (Array.isArray(downloadable?.urls)) values.push(...downloadable.urls);
    return values.flatMap((value) => {
      const candidate = typeof value === "string" ? value : value?.url;
      try {
        const url = new URL(String(candidate || ""), location.href);
        return url.protocol === "https:" && url.href.length <= 16_384 ? [url.href] : [];
      } catch (_error) {
        return [];
      }
    }).filter((url, index, urls) => urls.indexOf(url) === index).slice(0, 8);
  }

  function uniqueIdentifier(base, identifiers) {
    let id = base;
    let suffix = 1;
    while (identifiers.has(id)) {
      id = `${base}:${suffix}`;
      suffix += 1;
    }
    identifiers.add(id);
    return id;
  }

  function normaliseIdentifier(value, maximumLength) {
    return String(value ?? "").trim().slice(0, maximumLength);
  }

  function normaliseText(value, maximumLength) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximumLength);
  }

  function trimManifests() {
    while (manifests.size > 8) manifests.delete(manifests.keys().next().value);
  }

  function publishTracks(contentId = currentContentId()) {
    const manifest = manifests.get(contentId);
    if (!manifest) return;
    const tracks = manifest.tracks.map(({ urls: _urls, ...track }) => track);
    document.dispatchEvent(new CustomEvent(TRACK_EVENT, { detail: { contentId, tracks } }));
  }

  async function handleContentRequest(event) {
    const requestId = normaliseIdentifier(event.detail?.requestId, 120);
    const contentId = normaliseIdentifier(event.detail?.contentId, 40);
    const trackId = normaliseIdentifier(event.detail?.trackId, 240);
    if (!requestId || !contentId || !trackId || contentId !== currentContentId()) return;
    const track = manifests.get(contentId)?.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return publishContent({ requestId, contentId, trackId, error: "That Netflix caption track is no longer available." });
    try {
      const text = await fetchFirstAvailable(track.urls);
      publishContent({ requestId, contentId, trackId, format: track.format, text });
    } catch (_error) {
      publishContent({ requestId, contentId, trackId, error: "Netflix did not return that caption track." });
    }
  }

  async function fetchFirstAvailable(urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      for (const url of urls) {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) continue;
          const text = await response.text();
          if (text.trim() && text.length <= 5_000_000) return text;
        } catch (_error) {
          if (controller.signal.aborted) break;
          // Netflix supplies redundant CDN URLs; continue to the next candidate.
        }
      }
    } finally {
      clearTimeout(timeout);
    }
    throw new Error("No Netflix caption URL was readable.");
  }

  function publishContent(detail) {
    document.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail }));
  }

  const originalStringify = JSON.stringify;
  JSON.stringify = function subtleNetflixStringify(value) {
    try {
      prepareManifestRequest(value);
    } catch (_error) {
      // The original serialiser remains authoritative.
    }
    return Reflect.apply(originalStringify, this, arguments);
  };

  const originalParse = JSON.parse;
  JSON.parse = function subtleNetflixParse(value) {
    const result = Reflect.apply(originalParse, this, arguments);
    try {
      const source = typeof value === "string" ? value : "";
      if (source.includes("textTracks") || source.includes("timedtexttracks")) captureManifests(result);
    } catch (_error) {
      // Capturing captions must never alter Netflix's JSON result.
    }
    return result;
  };

  document.addEventListener(TRACK_REQUEST_EVENT, () => publishTracks());
  document.addEventListener(CONTENT_REQUEST_EVENT, handleContentRequest);
})();
