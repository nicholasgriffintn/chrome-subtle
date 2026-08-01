(function exposeNetflixCaptions(root, factory) {
  const api = factory(root.SubtleCues);
  if (typeof module === "object" && module.exports) module.exports = factory(require("./cues.js"));
  else root.SubtleNetflixCaptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createNetflixCaptions(SubtleCues) {
  "use strict";

  const CONTENT_REQUEST_EVENT = "subtle:request-netflix-track-content";
  const CONTENT_EVENT = "subtle:netflix-track-content";
  const FORMATS = new Set(["webvtt", "dfxp", "imsc"]);
  let requestSequence = 0;

  function normaliseTracks(input) {
    if (!Array.isArray(input)) return [];
    const identifiers = new Set();
    return input.slice(0, 80).flatMap((track) => {
      const id = boundedText(track?.id, 240);
      const contentId = boundedText(track?.contentId, 40);
      const format = boundedText(track?.format, 20).toLowerCase();
      if (!id || identifiers.has(id) || !contentId || !FORMATS.has(format)) return [];
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

  function selectTrack(tracks, preferredLanguage) {
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

  function availableLanguages(tracks) {
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

  function parseTrackText(text, format) {
    if (format === "webvtt") return mergeParallelCues(SubtleCues.parseTimedText(text));
    if (format === "dfxp" || format === "imsc") return parseTtml(text);
    throw new Error("Netflix returned an unsupported caption format.");
  }

  function parseTtml(input) {
    const source = String(input || "");
    const cues = [];
    const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = paragraphPattern.exec(source)) && cues.length < 20_000) {
      const attributes = match[1];
      const start = parseTtmlTime(attributeValue(attributes, "begin"));
      const explicitEnd = parseTtmlTime(attributeValue(attributes, "end"));
      const duration = parseTtmlTime(attributeValue(attributes, "dur"));
      const end = Number.isFinite(explicitEnd) ? explicitEnd : start + duration;
      const text = cleanTtmlText(match[2]);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) cues.push({ start, end, text });
    }
    return mergeParallelCues(cues.sort((left, right) => left.start - right.start));
  }

  function mergeParallelCues(cues) {
    const events = cues.flatMap((cue, order) => [
      { time: cue.start, action: "start", order, cue },
      { time: cue.end, action: "end", order, cue }
    ]).sort((left, right) => left.time - right.time || left.order - right.order);
    const active = new Map();
    const merged = [];
    let previousTime = events[0]?.time;
    let index = 0;

    while (index < events.length) {
      const time = events[index].time;
      if (time > previousTime && active.size) appendActiveInterval(merged, active, previousTime, time);
      while (events[index]?.time === time) {
        const event = events[index];
        if (event.action === "start") active.set(event.order, event.cue);
        else active.delete(event.order);
        index += 1;
      }
      previousTime = time;
    }
    return merged;
  }

  function appendActiveInterval(merged, active, start, end) {
    const lines = new Set();
    for (const cue of active.values()) {
      for (const line of cue.text.split("\n")) {
        if (line) lines.add(line);
      }
    }
    const text = Array.from(lines).join("\n");
    const previous = merged[merged.length - 1];
    if (previous?.text === text && previous.end === start) previous.end = end;
    else if (text) merged.push({ start, end, text });
  }

  function parseTtmlTime(value) {
    const input = String(value || "").trim();
    const clock = /^(\d+):(\d{2}):(\d{2})(?:[.,](\d+))?$/.exec(input);
    if (clock) {
      const fraction = clock[4] ? Number(`0.${clock[4]}`) : 0;
      return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) + fraction;
    }
    const offset = /^(\d+(?:\.\d+)?)(ms|h|m|s)$/.exec(input);
    if (!offset) return Number.NaN;
    const number = Number(offset[1]);
    return offset[2] === "ms" ? number / 1000
      : offset[2] === "h" ? number * 3600
        : offset[2] === "m" ? number * 60
          : number;
  }

  function attributeValue(attributes, name) {
    const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(attributes);
    return match?.[2] || "";
  }

  function cleanTtmlText(value) {
    return decodeEntities(String(value || "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim());
  }

  function decodeEntities(value) {
    const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
      if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
      const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const point = Number.parseInt(digits, radix);
      try {
        return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
      } catch (_error) {
        return entity;
      }
    });
  }

  function loadTrack(track, documentRef, options = {}) {
    if (!track?.id || !track?.contentId || !documentRef) {
      return Promise.reject(new Error("Netflix returned an invalid caption track."));
    }
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
        if (event.detail?.error) return finish(reject, new Error(boundedText(event.detail.error, 240)));
        const text = String(event.detail?.text || "");
        if (!text || text.length > 5_000_000) return finish(reject, new Error("Netflix returned an unreadable caption response."));
        try {
          finish(resolve, parseTrackText(text, event.detail?.format || track.format));
        } catch (error) {
          finish(reject, error);
        }
      };
      const timeout = setTimeout(() => {
        finish(reject, new Error("Netflix caption loading timed out."));
      }, timeoutMs);
      documentRef.addEventListener(CONTENT_EVENT, handleResponse);
      documentRef.dispatchEvent(createEvent(CONTENT_REQUEST_EVENT, {
        requestId,
        contentId: track.contentId,
        trackId: track.id
      }));
    });
  }

  function normaliseLanguage(value) {
    const language = boundedText(value || "und", 35).toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language) ? language : "und";
  }

  function boundedText(value, maximumLength) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  }

  return { normaliseTracks, selectTrack, availableLanguages, parseTrackText, parseTtmlTime, loadTrack };
});
