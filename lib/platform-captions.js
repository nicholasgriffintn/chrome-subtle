(function exposePlatformCaptions(root, factory) {
  const api = factory(root.SubtleYouTubeCaptions, root.SubtleNetflixCaptions);
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./youtube-captions.js"), require("./netflix-captions.js"));
  } else root.SubtlePlatformCaptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlatformCaptions(YouTubeCaptions, NetflixCaptions) {
  "use strict";

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
        return YouTubeCaptions.normaliseTracks(detail?.tracks, detail?.availableLanguages);
      },
      selectTrack(tracks, state, navigatorLanguage) {
        const track = YouTubeCaptions.selectTrack(tracks, navigatorLanguage);
        const language = YouTubeCaptions.selectLanguage(track?.availableLanguages, state.targetLanguage);
        return track && language ? { ...track, targetLanguage: language.languageCode, targetLabel: language.label } : null;
      },
      loadCues(track, _state, environment) {
        return YouTubeCaptions.loadTrack(track, track.targetLanguage, environment.documentRef, {
          createEvent: environment.createEvent
        });
      },
      availableLanguages(tracks) {
        return YouTubeCaptions.availableLanguages(tracks);
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
        return NetflixCaptions.normaliseTracks(detail.tracks);
      },
      selectTrack(tracks, state) {
        return NetflixCaptions.selectTrack(tracks, state.targetLanguage);
      },
      loadCues(track, _state, environment) {
        return NetflixCaptions.loadTrack(track, environment.documentRef, { createEvent: environment.createEvent });
      },
      availableLanguages(tracks) {
        return NetflixCaptions.availableLanguages(tracks);
      }
    })
  });

  function forPlatform(platformId) {
    return providers[platformId] || null;
  }

  function requestTracks(provider, documentRef, createEvent) {
    if (!provider || !documentRef) return;
    const event = createEvent
      ? createEvent(provider.trackRequestEvent, undefined)
      : new CustomEvent(provider.trackRequestEvent);
    documentRef.dispatchEvent(event);
  }

  function youtubeContentKey(locationLike) {
    try {
      const url = new URL(locationLike.href);
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || "";
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || "";
      return url.searchParams.get("v") || "";
    } catch (_error) {
      return "";
    }
  }

  function netflixContentKey(locationLike) {
    return /^\/watch\/(\d+)/.exec(String(locationLike?.pathname || ""))?.[1] || "";
  }

  return { forPlatform, requestTracks };
});
