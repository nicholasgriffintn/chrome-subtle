(function exposeSubtleCues(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleCues = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleCues() {
  "use strict";

  const SOUND_CUE_PATTERN = /^\s*(?:\[.{1,80}\]|\(.{1,80}\))\s*$/u;
  const MUSIC_CUE_PATTERN = /[♪♫♬]|^\s*[\[(]?(?:music|song|singing|instrumental)[\])]?[.!]?\s*$/iu;
  const SPEAKER_LABEL_PATTERN = /^\s*(?:>>\s*)?(?:[\p{Lu}\d][\p{Lu}\d .'-]{1,30}):\s*\S/u;
  const CUE_SEARCH_BLOCK_SIZE = 32;
  const cueSearchIndexes = new WeakMap();
  let blockedTermsSource = null;
  let cachedBlockedTerms = [];

  function parseTimedText(text) {
    const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
    if (!source) return [];
    return normaliseCues(source.startsWith("WEBVTT") ? parseVtt(source) : parseSrt(source));
  }

  function parseSrt(source) {
    return source.split(/\n{2,}/).flatMap((block) => {
      const lines = block.split("\n").filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return [];
      const timing = parseTimingLine(lines[timingIndex]);
      if (!timing) return [];
      return [{ ...timing, text: cleanCueText(lines.slice(timingIndex + 1).join("\n")) }];
    });
  }

  function parseVtt(source) {
    return source.replace(/^WEBVTT[^\n]*\n+/, "").split(/\n{2,}/).flatMap((block) => {
      const lines = block.split("\n").filter(Boolean);
      if (/^(NOTE|STYLE|REGION)\b/.test(lines[0] || "")) return [];
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return [];
      const timing = parseTimingLine(lines[timingIndex]);
      if (!timing) return [];
      return [{ ...timing, text: cleanCueText(lines.slice(timingIndex + 1).join("\n")) }];
    });
  }

  function parseTimingLine(line) {
    const [rawStart, rawEnd] = String(line).split("-->");
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(String(rawEnd || "").trim().split(/\s+/)[0]);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
  }

  function parseTimestamp(value) {
    const parts = String(value || "").trim().replace(",", ".").split(":").map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return NaN;
    const seconds = parts.pop();
    const minutes = parts.pop();
    const hours = parts.pop() || 0;
    if (minutes >= 60 || seconds >= 60) return NaN;
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  function parseYouTubeJson(payload) {
    const events = Array.isArray(payload?.events) ? payload.events : [];
    return normaliseCues(events.flatMap((event) => {
      const segments = Array.isArray(event.segs) ? event.segs : [];
      const text = cleanCueText(segments.map((segment) => segment.utf8 || "").join(""));
      const start = Number(event.tStartMs) / 1000;
      const duration = Number(event.dDurationMs) / 1000;
      if (!text || !Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return [];
      return [{ start, end: start + duration, text }];
    }));
  }

  function parseTimedTextTrack(text, format) {
    const normalisedFormat = String(format || "").toLowerCase();
    if (normalisedFormat === "webvtt") return mergeParallelCues(parseTimedText(text));
    if (normalisedFormat === "dfxp" || normalisedFormat === "imsc" || normalisedFormat === "ttml") {
      return parseTtml(text);
    }
    throw new Error("The platform returned an unsupported caption format.");
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

  function normaliseCues(cues) {
    return cues
      .filter((cue) => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start)
      .sort((a, b) => a.start - b.start)
      .map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }));
  }

  function cueAtTime(cues, time) {
    let low = 0;
    let high = cues.length - 1;
    let candidate = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const cue = cues[middle];
      if (time < cue.start) high = middle - 1;
      else {
        candidate = middle;
        low = middle + 1;
      }
    }
    if (candidate < 0) return null;
    const searchIndex = cueSearchIndex(cues);
    let block = Math.floor(candidate / CUE_SEARCH_BLOCK_SIZE);
    for (let index = candidate; index >= block * CUE_SEARCH_BLOCK_SIZE; index -= 1) {
      if (time < cues[index].end) return cues[index];
    }
    block -= 1;
    for (; block >= 0; block -= 1) {
      if (searchIndex.maximumEnds[block] <= time) continue;
      const blockStart = block * CUE_SEARCH_BLOCK_SIZE;
      const blockEnd = Math.min(blockStart + CUE_SEARCH_BLOCK_SIZE, cues.length) - 1;
      for (let index = blockEnd; index >= blockStart; index -= 1) {
        if (time < cues[index].end) return cues[index];
      }
    }
    return null;
  }

  function cueSearchIndex(cues) {
    const cached = cueSearchIndexes.get(cues);
    if (cached?.length === cues.length && cached.first === cues[0] && cached.last === cues.at(-1)) return cached;
    const maximumEnds = [];
    for (let index = 0; index < cues.length; index += 1) {
      const block = Math.floor(index / CUE_SEARCH_BLOCK_SIZE);
      maximumEnds[block] = Math.max(maximumEnds[block] ?? Number.NEGATIVE_INFINITY, Number(cues[index].end));
    }
    const next = { length: cues.length, first: cues[0], last: cues.at(-1), maximumEnds };
    cueSearchIndexes.set(cues, next);
    return next;
  }

  function isSoundCue(text) {
    return SOUND_CUE_PATTERN.test(String(text || ""));
  }

  function shouldBlockCue(text, filters = {}) {
    const value = String(text || "");
    if (!value) return false;
    if (filters.hideSoundCues && isSoundCue(value)) return true;
    if (filters.blockMusic && MUSIC_CUE_PATTERN.test(value)) return true;
    if (filters.blockSpeakerLabels && SPEAKER_LABEL_PATTERN.test(value)) return true;
    const normalisedText = value.toLocaleLowerCase();
    return blockedTerms(filters.customBlockedTerms).some((term) => normalisedText.includes(term));
  }

  function blockedTerms(value) {
    const source = String(value || "");
    if (source === blockedTermsSource) return cachedBlockedTerms;
    blockedTermsSource = source;
    cachedBlockedTerms = source
      .split(/[\n,]/)
      .map((term) => term.trim().toLocaleLowerCase().slice(0, 80))
      .filter(Boolean)
      .slice(0, 50);
    return cachedBlockedTerms;
  }

  function filtersActive(filters = {}) {
    return Boolean(
      filters.hideSoundCues
      || filters.blockMusic
      || filters.blockSpeakerLabels
      || String(filters.customBlockedTerms || "").trim()
    );
  }

  function fingerprintText(text) {
    const value = String(text || "");
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${value.length}:${(hash >>> 0).toString(16)}`;
  }

  function cleanCueText(text) {
    return decodeEntities(String(text || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim());
  }

  function decodeEntities(text) {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return String(text || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
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

  return {
    parseTimedText,
    parseTimedTextTrack,
    parseTimestamp,
    parseTtmlTime,
    parseYouTubeJson,
    mergeParallelCues,
    cueAtTime,
    isSoundCue,
    shouldBlockCue,
    filtersActive,
    fingerprintText
  };
});
