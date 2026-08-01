(function exposeSubtleCues(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleCues = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleCues() {
  "use strict";

  const SOUND_CUE_PATTERN = /^\s*(?:\[.{1,80}\]|\(.{1,80}\))\s*$/u;

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
    for (let index = candidate; index >= 0 && candidate - index <= 12; index -= 1) {
      if (time < cues[index].end) return cues[index];
    }
    return null;
  }

  function isSoundCue(text) {
    return SOUND_CUE_PATTERN.test(String(text || ""));
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
    return text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  return { parseTimedText, parseTimestamp, parseYouTubeJson, cueAtTime, isSoundCue, fingerprintText };
});
