(function exposeYouTubeCaptions(root, factory) {
  const api = factory(root.SubtleCues);
  if (typeof module === "object" && module.exports) module.exports = factory(require("./cues.js"));
  else root.SubtleYouTubeCaptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createYouTubeCaptions(SubtleCues) {
  "use strict";

  const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);
  const CONTENT_REQUEST_EVENT = "subtle:request-youtube-track-content";
  const CONTENT_EVENT = "subtle:youtube-track-content";
  let requestSequence = 0;

  function selectTrack(tracks, preferredLanguage) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const preferred = String(preferredLanguage || "").toLowerCase();
    const preferredBase = preferred.split("-")[0];
    return tracks.find((track) => track.languageCode?.toLowerCase() === preferred)
      || tracks.find((track) => track.languageCode?.toLowerCase().split("-")[0] === preferredBase)
      || tracks.find((track) => track.kind?.toLowerCase() !== "asr")
      || tracks[0];
  }

  function normaliseTracks(input, availableLanguages = []) {
    const languages = normaliseLanguages(availableLanguages);
    if (!Array.isArray(input)) return [];
    return input.slice(0, 16).flatMap((track) => {
      try {
        const url = validatedTrackUrl(track);
        if (!url) return [];
        const languageCode = String(track?.languageCode || url.searchParams.get("lang") || "und").slice(0, 35);
        return [{
          baseUrl: url.href,
          languageCode,
          label: String(track?.label || languageCode).slice(0, 120),
          kind: track?.kind === "asr" ? "asr" : "standard",
          availableLanguages: languages
        }];
      } catch (_error) {
        return [];
      }
    });
  }

  function normaliseLanguages(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    return input.slice(0, 200).flatMap((language) => {
      const languageCode = String(language?.languageCode || "").trim().slice(0, 35);
      const key = languageCode.toLowerCase();
      if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(languageCode) || seen.has(key)) return [];
      seen.add(key);
      const label = String(language?.label || language?.languageName?.simpleText || languageCode)
        .replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
      return [{ languageCode, label: label || languageCode }];
    });
  }

  function availableLanguages(tracks) {
    return normaliseLanguages((tracks || []).flatMap((track) => track.availableLanguages || []));
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

  function validatedTrackUrl(track) {
    try {
      const value = String(track?.baseUrl || "");
      if (!value || value.length > 16_384) return null;
      const url = new URL(value);
      if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
      if (url.pathname !== "/api/timedtext" || !url.searchParams.get("pot")) return null;
      return url;
    } catch (_error) {
      return null;
    }
  }

  function loadTrack(track, targetLanguage, documentRef, options = {}) {
    if (!validatedTrackUrl(track) || !documentRef) {
      return Promise.reject(new Error("YouTube returned an invalid caption track."));
    }
    const selected = selectLanguage(track.availableLanguages, targetLanguage);
    if (!selected) return Promise.reject(new Error("This video does not offer another YouTube caption language."));
    const timeoutMs = Number(options.timeoutMs) || 12_000;
    const createEvent = options.createEvent || ((type, detail) => new CustomEvent(type, { detail }));
    requestSequence += 1;
    const requestId = `subtle-${Date.now()}-${requestSequence}`;
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        clearTimeout(timeout);
        documentRef.removeEventListener(CONTENT_EVENT, handleResponse);
        callback(value);
      };
      const handleResponse = (event) => {
        if (event.detail?.requestId !== requestId) return;
        if (event.detail?.error) {
          const error = new Error(String(event.detail.error).slice(0, 240));
          error.status = Number(event.detail.status) || 0;
          return finish(reject, error);
        }
        const body = String(event.detail?.text || "");
        if (!body.trim()) return finish(resolve, []);
        try {
          finish(resolve, SubtleCues.parseYouTubeJson(JSON.parse(body)));
        } catch (_error) {
          finish(reject, new Error("YouTube returned an unreadable caption response."));
        }
      };
      const timeout = setTimeout(() => finish(reject, new Error("YouTube caption loading timed out.")), timeoutMs);
      documentRef.addEventListener(CONTENT_EVENT, handleResponse);
      documentRef.dispatchEvent(createEvent(CONTENT_REQUEST_EVENT, {
        requestId,
        targetLanguage: selected.languageCode
      }));
    });
  }

  return {
    selectTrack,
    normaliseTracks,
    normaliseLanguages,
    availableLanguages,
    selectLanguage,
    loadTrack
  };
});
