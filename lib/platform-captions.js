(function exposePlatformCaptions(root, factory) {
  const api = factory(root.SubtleCues);
  if (typeof module === "object" && module.exports) module.exports = factory(require("./cues.js"));
  else root.SubtlePlatformCaptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlatformCaptions(SubtleCues) {
  "use strict";

  const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);
  const NETFLIX_FORMATS = new Set(["webvtt", "dfxp", "imsc"]);
  let requestSequence = 0;

  const providers = Object.freeze({
    youtube: Object.freeze({
      id: "youtube",
      trackEvent: "subtle:youtube-tracks",
      trackRequestEvent: "subtle:request-youtube-tracks",
      languageMode: "track",
      sourceLabel: "YouTube captions",
      contentKey: youtubeContentKey,
      tracksFromEvent(detail, locationLike) {
        const contentKey = youtubeContentKey(locationLike);
        if (detail?.videoId && contentKey && detail.videoId !== contentKey) return null;
        return normaliseYouTubeTracks(detail?.tracks, detail?.availableLanguages);
      },
      selectTrack(tracks, state, navigatorLanguage) {
        const track = selectYouTubeTrack(tracks, navigatorLanguage);
        const language = selectLanguage(track?.availableLanguages, state.targetLanguage);
        return track && language ? { ...track, targetLanguage: language.languageCode, targetLabel: language.label } : null;
      },
      loadCues(track, _state, environment) {
        if (!validatedYouTubeTrackUrl(track) || !environment.documentRef || !track?.targetLanguage) {
          return Promise.reject(new Error("YouTube returned an invalid caption track."));
        }
        return requestTrackContent({
          requestEvent: "subtle:request-youtube-track-content",
          responseEvent: "subtle:youtube-track-content",
          detail: { targetLanguage: track.targetLanguage },
          documentRef: environment.documentRef,
          createEvent: environment.createEvent,
          timeoutMessage: "YouTube caption loading timed out.",
          parse(detail) {
            const body = String(detail?.text || "");
            if (!body.trim()) return [];
            try {
              return SubtleCues.parseYouTubeJson(JSON.parse(body));
            } catch (_error) {
              throw new Error("YouTube returned an unreadable caption response.");
            }
          }
        });
      },
      availableLanguages(tracks) {
        return normaliseLanguages((tracks || []).flatMap((track) => track.availableLanguages || []));
      }
    }),
    netflix: Object.freeze({
      id: "netflix",
      trackEvent: "subtle:netflix-tracks",
      trackRequestEvent: "subtle:request-netflix-tracks",
      languageMode: "track",
      sourceLabel: "Netflix captions",
      contentKey: netflixContentKey,
      tracksFromEvent(detail, locationLike) {
        const contentKey = netflixContentKey(locationLike);
        if (!detail?.contentId || !contentKey || detail.contentId !== contentKey) return null;
        return normaliseNetflixTracks(detail.tracks);
      },
      selectTrack(tracks, state) {
        return selectTrackByLanguage(tracks, state.targetLanguage);
      },
      loadCues(track, _state, environment) {
        if (!track?.id || !track?.contentId || !environment.documentRef) {
          return Promise.reject(new Error("Netflix returned an invalid caption track."));
        }
        return requestTrackContent({
          requestEvent: "subtle:request-netflix-track-content",
          responseEvent: "subtle:netflix-track-content",
          detail: { contentId: track.contentId, trackId: track.id },
          documentRef: environment.documentRef,
          createEvent: environment.createEvent,
          timeoutMessage: "Netflix caption loading timed out.",
          parse(detail) {
            const text = String(detail?.text || "");
            if (!text || text.length > 5_000_000) throw new Error("Netflix returned an unreadable caption response.");
            return SubtleCues.parseTimedTextTrack(text, detail?.format || track.format);
          }
        });
      },
      availableLanguages(tracks) {
        return availableTrackLanguages(tracks);
      }
    }),
    bbc: Object.freeze({
      id: "bbc",
      languageMode: "local",
      sourceLabel: "BBC iPlayer captions",
      contentKey: bbcContentKey,
      tracksFromEvent: () => [],
      selectTrack: () => null,
      loadCues: () => Promise.resolve([]),
      availableLanguages: () => []
    }),
    disney: Object.freeze({
      id: "disney",
      trackEvent: "subtle:disney-tracks",
      trackRequestEvent: "subtle:request-disney-tracks",
      languageMode: "track",
      sourceLabel: "Disney+ captions",
      contentKey: disneyContentKey,
      tracksFromEvent(detail, locationLike) {
        const contentKey = disneyContentKey(locationLike);
        if (!detail?.contentId || !contentKey || detail.contentId !== contentKey) return null;
        return normaliseDisneyTracks(detail.tracks);
      },
      selectTrack(tracks, state) {
        return selectTrackByLanguage(tracks, state.targetLanguage);
      },
      loadCues(track, _state, environment) {
        if (!track?.id || !track?.contentId || !environment.documentRef) {
          return Promise.reject(new Error("Disney+ returned an invalid caption track."));
        }
        return requestTrackContent({
          requestEvent: "subtle:request-disney-track-content",
          responseEvent: "subtle:disney-track-content",
          detail: { contentId: track.contentId, trackId: track.id },
          documentRef: environment.documentRef,
          createEvent: environment.createEvent,
          timeoutMessage: "Disney+ caption loading timed out.",
          parse(detail) {
            const text = String(detail?.text || "");
            if (!text || text.length > 5_000_000) throw new Error("Disney+ returned an unreadable caption response.");
            return SubtleCues.parseTimedTextTrack(text, "webvtt");
          }
        });
      },
      availableLanguages(tracks) {
        return availableTrackLanguages(tracks);
      }
    })
  });

  function forPlatform(platformId) {
    return providers[platformId] || null;
  }

  function requestTracks(provider, documentRef, createEvent) {
    if (!provider?.trackRequestEvent || !documentRef) return;
    const event = createEvent
      ? createEvent(provider.trackRequestEvent, undefined)
      : new CustomEvent(provider.trackRequestEvent);
    documentRef.dispatchEvent(event);
  }

  function requestTrackContent(options) {
    const timeoutMs = Number(options.timeoutMs) || 12_000;
    const createEvent = options.createEvent || ((type, detail) => new CustomEvent(type, { detail }));
    requestSequence += 1;
    const requestId = `subtle-${Date.now()}-${requestSequence}`;
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        clearTimeout(timeout);
        options.documentRef.removeEventListener(options.responseEvent, handleResponse);
        callback(value);
      };
      const handleResponse = (event) => {
        if (event.detail?.requestId !== requestId) return;
        if (event.detail?.error) {
          const error = new Error(boundedText(event.detail.error, 240));
          error.status = Number(event.detail.status) || 0;
          return finish(reject, error);
        }
        try {
          finish(resolve, options.parse(event.detail));
        } catch (error) {
          finish(reject, error);
        }
      };
      const timeout = setTimeout(() => finish(reject, new Error(options.timeoutMessage)), timeoutMs);
      options.documentRef.addEventListener(options.responseEvent, handleResponse);
      try {
        options.documentRef.dispatchEvent(createEvent(options.requestEvent, { requestId, ...options.detail }));
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  function normaliseYouTubeTracks(input, availableLanguages = []) {
    const languages = normaliseLanguages(availableLanguages);
    if (!Array.isArray(input)) return [];
    return input.slice(0, 16).flatMap((track) => {
      const url = validatedYouTubeTrackUrl(track);
      if (!url) return [];
      const languageCode = boundedText(track?.languageCode || url.searchParams.get("lang") || "und", 35);
      return [{
        baseUrl: url.href,
        languageCode,
        label: boundedText(track?.label || languageCode, 120),
        kind: track?.kind === "asr" ? "asr" : "standard",
        availableLanguages: languages
      }];
    });
  }

  function normaliseLanguages(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    return input.slice(0, 200).flatMap((language) => {
      const languageCode = boundedText(language?.languageCode, 35);
      const key = languageCode.toLowerCase();
      if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(languageCode) || seen.has(key)) return [];
      seen.add(key);
      const label = boundedText(language?.label || language?.languageName?.simpleText || languageCode, 120);
      return [{ languageCode, label: label || languageCode }];
    });
  }

  function selectLanguage(languages, preferredLanguage) {
    const available = normaliseLanguages(languages);
    const preferred = String(preferredLanguage || "").toLowerCase();
    const preferredBase = preferred.split("-")[0];
    return available.find((language) => language.languageCode.toLowerCase() === preferred)
      || available.find((language) => language.languageCode.toLowerCase().split("-")[0] === preferredBase)
      || available[0]
      || null;
  }

  function selectYouTubeTrack(tracks, preferredLanguage) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const preferred = String(preferredLanguage || "").toLowerCase();
    const preferredBase = preferred.split("-")[0];
    return tracks.find((track) => track.languageCode?.toLowerCase() === preferred)
      || tracks.find((track) => track.languageCode?.toLowerCase().split("-")[0] === preferredBase)
      || tracks.find((track) => track.kind?.toLowerCase() !== "asr")
      || tracks[0];
  }

  function validatedYouTubeTrackUrl(track) {
    try {
      const value = String(track?.baseUrl || "");
      if (!value || value.length > 16_384) return null;
      const url = new URL(value);
      if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
      if (url.pathname !== "/api/timedtext" || !url.searchParams.get("pot")) return null;
      return url;
    } catch (_error) {
      return null;
    }
  }

  function normaliseNetflixTracks(input) {
    if (!Array.isArray(input)) return [];
    const identifiers = new Set();
    return input.slice(0, 80).flatMap((track) => {
      const id = boundedText(track?.id, 240);
      const contentId = boundedText(track?.contentId, 40);
      const format = boundedText(track?.format, 20).toLowerCase();
      if (!id || identifiers.has(id) || !contentId || !NETFLIX_FORMATS.has(format)) return [];
      identifiers.add(id);
      const languageCode = normaliseLanguage(track?.languageCode);
      return [{
        id,
        contentId,
        languageCode,
        label: boundedText(track?.label || languageCode, 120),
        kind: boundedText(track?.kind || "subtitles", 40),
        isCaption: track?.isCaption === true,
        format
      }];
    });
  }

  function normaliseDisneyTracks(input) {
    if (!Array.isArray(input)) return [];
    const identifiers = new Set();
    return input.slice(0, 120).flatMap((track) => {
      const id = boundedText(track?.id, 120);
      const contentId = boundedText(track?.contentId, 80);
      if (!id || identifiers.has(id) || !contentId || track?.format !== "webvtt") return [];
      identifiers.add(id);
      const languageCode = normaliseLanguage(track?.languageCode);
      return [{
        id,
        contentId,
        languageCode,
        label: boundedText(track?.label || languageCode, 120),
        isCaption: track?.isCaption === true,
        format: "webvtt"
      }];
    });
  }

  function selectTrackByLanguage(tracks, preferredLanguage) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const preferred = normaliseLanguage(preferredLanguage);
    const preferredBase = preferred.split("-")[0];
    return tracks.find((track) => track.languageCode === preferred && !track.isCaption)
      || tracks.find((track) => track.languageCode === preferred)
      || tracks.find((track) => track.languageCode.split("-")[0] === preferredBase && !track.isCaption)
      || tracks.find((track) => track.languageCode.split("-")[0] === preferredBase)
      || tracks.find((track) => !track.isCaption)
      || tracks[0];
  }

  function availableTrackLanguages(tracks) {
    const languages = new Map();
    for (const track of tracks || []) {
      if (!languages.has(track.languageCode) || (languages.get(track.languageCode).isCaption && !track.isCaption)) {
        languages.set(track.languageCode, {
          languageCode: track.languageCode,
          label: track.label,
          isCaption: track.isCaption
        });
      }
    }
    return Array.from(languages.values()).map(({ isCaption: _isCaption, ...language }) => language);
  }

  function youtubeContentKey(locationLike) {
    try {
      const url = new URL(locationLike.href);
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/")[2] || "";
      }
      return url.searchParams.get("v") || "";
    } catch (_error) {
      return "";
    }
  }

  function netflixContentKey(locationLike) {
    return /^\/watch\/(\d+)/.exec(String(locationLike?.pathname || ""))?.[1] || "";
  }

  function bbcContentKey(locationLike) {
    return /^\/iplayer\/(?:episode|live)\/([^/]+)/.exec(String(locationLike?.pathname || ""))?.[1] || "";
  }

  function disneyContentKey(locationLike) {
    return /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?play\/([a-f\d-]{36})(?:\/|$)/i
      .exec(String(locationLike?.pathname || ""))?.[1] || "";
  }

  function normaliseLanguage(value) {
    const language = boundedText(value || "und", 35).toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language) ? language : "und";
  }

  function boundedText(value, maximumLength) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  }

  return { forPlatform, requestTracks };
});
