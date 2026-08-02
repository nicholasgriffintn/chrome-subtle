(function exposeSubtleTranscript(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleTranscript = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleTranscript() {
  "use strict";

  const DEFAULT_MAX_CUES = 10_000;
  const DEFAULT_MAX_TEXT_LENGTH = 500_000;
  const DEFAULT_SUMMARY_CHARACTERS = 6_000;
  const MAX_SUMMARY_CHARACTERS = 12_000;

  function createSnapshot(input, limits = {}) {
    const source = input && typeof input === "object" ? input : {};
    const maxCues = boundedLimit(limits.maxCues, DEFAULT_MAX_CUES, DEFAULT_MAX_CUES);
    const maxTextLength = boundedLimit(limits.maxTextLength, DEFAULT_MAX_TEXT_LENGTH, DEFAULT_MAX_TEXT_LENGTH);
    const cues = [];
    let textLength = 0;
    let truncated = source.truncated === true;
    for (const value of Array.isArray(source.cues) ? source.cues : []) {
      const cue = normaliseCue(value);
      if (!cue) continue;
      if (cues.length >= maxCues || textLength + cue.text.length > maxTextLength) {
        truncated = true;
        break;
      }
      cues.push(cue);
      textLength += cue.text.length;
    }
    return {
      contentKey: boundedText(source.contentKey, 240),
      platformId: boundedIdentifier(source.platformId, 40),
      languageCode: normaliseLanguage(source.languageCode),
      cues,
      truncated
    };
  }

  function normaliseCue(value) {
    const start = Number(value?.start);
    const end = Number(value?.end);
    const text = boundedText(value?.text, 8_000);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
    return { start, end, text };
  }

  function summaryChunks(snapshot, options = {}) {
    const maxCharacters = boundedRange(options.maxCharacters, DEFAULT_SUMMARY_CHARACTERS, 16, MAX_SUMMARY_CHARACTERS);
    const maxDurationSeconds = boundedRange(options.maxDurationSeconds, 300, 1, 1_800);
    const chunks = [];
    let current = [];
    let currentCharacters = 0;
    const flush = () => {
      if (!current.length) return;
      const cueIndexes = new Set(current.map((entry) => entry.cueIndex));
      chunks.push({
        start: current[0].cue.start,
        end: current[current.length - 1].cue.end,
        cueCount: cueIndexes.size,
        text: current.map((entry) => entry.line).join("\n")
      });
      current = [];
      currentCharacters = 0;
    };
    const values = Array.isArray(snapshot?.cues) ? snapshot.cues : [];
    for (let cueIndex = 0; cueIndex < values.length; cueIndex += 1) {
      const value = values[cueIndex];
      const cue = normaliseCue(value);
      if (!cue) continue;
      const prefix = `[${formatTimestamp(cue.start)}] `;
      for (const text of splitText(cue.text, Math.max(1, maxCharacters - prefix.length))) {
        const line = `${prefix}${text}`;
        const addedCharacters = line.length + (current.length ? 1 : 0);
        const exceedsCharacters = current.length && currentCharacters + addedCharacters > maxCharacters;
        const exceedsDuration = current.length && cue.end - current[0].cue.start > maxDurationSeconds;
        if (exceedsCharacters || exceedsDuration) flush();
        current.push({ cue, cueIndex, line });
        currentCharacters += line.length + (current.length > 1 ? 1 : 0);
      }
    }
    flush();
    return chunks;
  }

  function identityFor(input) {
    const snapshot = createSnapshot(input);
    let first = 2166136261;
    let second = 2246822507;
    let textLength = 0;
    const add = (value) => {
      const text = String(value);
      for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        first = Math.imul(first ^ code, 16777619) >>> 0;
        second = Math.imul(second ^ code, 3266489909) >>> 0;
      }
    };
    add(snapshot.platformId);
    add("\u0000");
    add(snapshot.contentKey);
    add("\u0000");
    add(snapshot.languageCode);
    for (const cue of snapshot.cues) {
      add(`\u0001${cue.start}\u0002${cue.end}\u0003${cue.text}`);
      textLength += cue.text.length;
    }
    return {
      platformId: snapshot.platformId,
      contentKey: snapshot.contentKey,
      languageCode: snapshot.languageCode,
      transcriptFingerprint: `v1-${snapshot.cues.length}-${textLength}-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`
    };
  }

  function sameIdentity(left, right) {
    return Boolean(
      left
      && right
      && left.platformId === right.platformId
      && left.contentKey === right.contentKey
      && left.languageCode === right.languageCode
      && left.transcriptFingerprint === right.transcriptFingerprint
    );
  }

  function formatTimestamp(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  function contextAtTime(snapshot, seconds, radius = 2) {
    const cues = Array.isArray(snapshot?.cues) ? snapshot.cues : [];
    const time = Number(seconds);
    if (!Number.isFinite(time)) return null;
    let index = cues.findIndex((cue) => time >= cue.start && time < cue.end);
    if (index < 0) {
      index = cues.findIndex((cue) => cue.start >= time);
      if (index < 0) index = cues.length - 1;
    }
    if (index < 0) return null;
    const boundedRadius = Math.min(4, Math.max(0, Number(radius) || 0));
    return {
      cue: cues[index],
      before: cues.slice(Math.max(0, index - boundedRadius), index),
      after: cues.slice(index + 1, index + 1 + boundedRadius)
    };
  }

  function normaliseLanguage(value) {
    const language = String(value || "und").trim().toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language) ? language : "und";
  }

  function boundedIdentifier(value, maximum) {
    const text = boundedText(value, maximum).toLowerCase();
    return /^[a-z0-9_-]+$/.test(text) ? text : "";
  }

  function boundedText(value, maximum) {
    return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maximum);
  }

  function splitText(value, maximum) {
    const pieces = [];
    let remaining = value;
    while (remaining.length > maximum) {
      let boundary = remaining.lastIndexOf(" ", maximum);
      if (boundary < Math.floor(maximum / 2)) boundary = maximum;
      pieces.push(remaining.slice(0, boundary).trim());
      remaining = remaining.slice(boundary).trim();
    }
    if (remaining) pieces.push(remaining);
    return pieces;
  }

  function boundedLimit(value, fallback, maximum = fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
  }

  function boundedRange(value, fallback, minimum, maximum) {
    const number = Number(value);
    return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  return {
    createSnapshot,
    normaliseCue,
    normaliseLanguage,
    summaryChunks,
    formatTimestamp,
    contextAtTime,
    identityFor,
    sameIdentity
  };
});
