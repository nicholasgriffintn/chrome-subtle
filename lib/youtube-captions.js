(function exposeYouTubeCaptions(root, factory) {
  const api = factory(root.SubtleCues);
  if (typeof module === "object" && module.exports) module.exports = factory(require("./cues.js"));
  else root.SubtleYouTubeCaptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createYouTubeCaptions(SubtleCues) {
  "use strict";

  const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);

  function selectTrack(tracks, preferredLanguage) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const preferred = String(preferredLanguage || "").toLowerCase();
    const preferredBase = preferred.split("-")[0];
    return tracks.find((track) => track.languageCode?.toLowerCase() === preferred)
      || tracks.find((track) => track.languageCode?.toLowerCase().split("-")[0] === preferredBase)
      || tracks.find((track) => track.kind?.toLowerCase() !== "asr")
      || tracks[0];
  }

  function normaliseTracks(input) {
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
          kind: track?.kind === "asr" ? "asr" : "standard"
        }];
      } catch (_error) {
        return [];
      }
    });
  }

  function buildTrackUrl(track, targetLanguage) {
    const url = validatedTrackUrl(track);
    if (!url) return null;
    url.searchParams.set("fmt", "json3");
    if (targetLanguage && targetLanguage !== track.languageCode) url.searchParams.set("tlang", targetLanguage);
    url.searchParams.set("subtle_client", "1");
    return url.href;
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

  async function loadTrack(track, targetLanguage, fetchImpl) {
    const url = buildTrackUrl(track, targetLanguage);
    if (!url) throw new Error("YouTube returned an invalid caption URL.");
    const response = await fetchImpl(url, { credentials: "include" });
    if (!response.ok) throw new Error(`YouTube captions returned ${response.status}.`);
    const body = await response.text();
    if (!body.trim()) return [];
    try {
      return SubtleCues.parseYouTubeJson(JSON.parse(body));
    } catch (_error) {
      throw new Error("YouTube returned an unreadable caption response.");
    }
  }

  return { selectTrack, normaliseTracks, buildTrackUrl, loadTrack };
});
