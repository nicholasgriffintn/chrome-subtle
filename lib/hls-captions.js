(function exposeSubtleHlsCaptions(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleHlsCaptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleHlsCaptions() {
  "use strict";

  const MPEG_TIMESTAMP_WRAP_SECONDS = (2 ** 33) / 90_000;

  function subtitleTracks(source, manifestUrl) {
    if (!String(source || "").includes("#EXTM3U")) return [];
    return String(source).split(/\r?\n/).slice(0, 4_000).flatMap((line) => {
      if (!line.startsWith("#EXT-X-MEDIA:")) return [];
      const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
      if (attributes.TYPE !== "SUBTITLES" || attributes.FORCED === "YES" || !attributes.URI) return [];
      const playlistUrl = resolveHttpsUrl(attributes.URI, manifestUrl);
      if (!playlistUrl) return [];
      const languageCode = boundedText(attributes.LANGUAGE || "und", 35);
      const label = boundedText(attributes.NAME || languageCode, 120) || languageCode;
      const characteristics = String(attributes.CHARACTERISTICS || "").toLowerCase();
      const isCaption = /\b(?:cc|sdh)\b/i.test(label)
        || characteristics.includes("transcribes-spoken-dialog")
        || characteristics.includes("describes-music-and-sound");
      return [{ languageCode, label, isCaption, playlistUrl }];
    }).slice(0, 120);
  }

  function mediaSegments(source, playlistUrl) {
    if (!String(source || "").includes("#EXTM3U")) return [];
    const segments = [];
    let duration = 0;
    let start = 0;
    for (const rawLine of String(source).split(/\r?\n/).slice(0, 8_000)) {
      const line = rawLine.trim();
      if (line.startsWith("#EXTINF:")) {
        duration = Math.max(0, Number.parseFloat(line.slice(8)) || 0);
        continue;
      }
      if (!line || line.startsWith("#")) continue;
      const url = resolveHttpsUrl(line, playlistUrl);
      if (url) segments.push({ url, start, duration });
      start += duration;
      duration = 0;
      if (segments.length >= 1_200) break;
    }
    return segments;
  }

  function assembleWebVtt(segmentPayloads) {
    const cues = [];
    let previousMpegSeconds = null;
    for (const segment of Array.from(segmentPayloads || []).slice(0, 1_200)) {
      const parsed = parseWebVttSegment(segment?.text, Number(segment?.start) || 0, previousMpegSeconds);
      previousMpegSeconds = parsed.mpegSeconds ?? previousMpegSeconds;
      cues.push(...parsed.cues);
      if (cues.length >= 50_000) break;
    }
    const seen = new Set();
    const blocks = cues
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .flatMap((cue) => {
        const key = `${cue.start.toFixed(3)}:${cue.end.toFixed(3)}:${cue.text}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`];
      });
    return `WEBVTT\n\n${blocks.join("\n\n")}`;
  }

  function parseWebVttSegment(source, fallbackStart, previousMpegSeconds) {
    const text = String(source || "").replace(/^\uFEFF/, "").replace(/\r/g, "");
    const timestampMap = /X-TIMESTAMP-MAP\s*=\s*LOCAL:([^,\s]+)\s*,\s*MPEGTS:(\d+)/i.exec(text);
    let mapOffset = null;
    let mpegSeconds = null;
    if (timestampMap) {
      const local = parseTimestamp(timestampMap[1]);
      const rawMpegSeconds = Number(timestampMap[2]) / 90_000;
      if (Number.isFinite(local) && Number.isFinite(rawMpegSeconds)) {
        mpegSeconds = unwrapTimestamp(rawMpegSeconds, previousMpegSeconds);
        mapOffset = mpegSeconds - local;
      }
    }

    const cues = text.split(/\n{2,}/).flatMap((block) => {
      const lines = block.split("\n").filter(Boolean);
      if (/^(?:WEBVTT|NOTE|STYLE|REGION|X-TIMESTAMP-MAP)\b/.test(lines[0] || "")) return [];
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return [];
      const [rawStart, rawEnd] = lines[timingIndex].split("-->");
      let start = parseTimestamp(rawStart);
      let end = parseTimestamp(String(rawEnd || "").trim().split(/\s+/)[0]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
      const offset = mapOffset ?? (start + 0.5 < fallbackStart ? fallbackStart : 0);
      start += offset;
      end += offset;
      const cueText = lines.slice(timingIndex + 1).join("\n").trim();
      return cueText ? [{ start, end, text: cueText }] : [];
    });
    return { cues, mpegSeconds };
  }

  function unwrapTimestamp(value, previous) {
    if (!Number.isFinite(previous)) return value;
    let unwrapped = value;
    while (unwrapped + (MPEG_TIMESTAMP_WRAP_SECONDS / 2) < previous) unwrapped += MPEG_TIMESTAMP_WRAP_SECONDS;
    while (unwrapped - (MPEG_TIMESTAMP_WRAP_SECONDS / 2) > previous) unwrapped -= MPEG_TIMESTAMP_WRAP_SECONDS;
    return unwrapped;
  }

  function parseAttributeList(source) {
    const attributes = {};
    let token = "";
    let quoted = false;
    const commit = () => {
      const separator = token.indexOf("=");
      if (separator > 0) {
        const key = token.slice(0, separator).trim().toUpperCase();
        let value = token.slice(separator + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
        attributes[key] = value;
      }
      token = "";
    };
    for (const character of String(source || "")) {
      if (character === '"') quoted = !quoted;
      if (character === "," && !quoted) commit();
      else token += character;
    }
    commit();
    return attributes;
  }

  function parseTimestamp(value) {
    const parts = String(value || "").trim().replace(",", ".").split(":").map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return Number.NaN;
    const seconds = parts.pop();
    const minutes = parts.pop();
    const hours = parts.pop() || 0;
    return minutes < 60 && seconds < 60 ? (hours * 3_600) + (minutes * 60) + seconds : Number.NaN;
  }

  function formatTimestamp(value) {
    const milliseconds = Math.max(0, Math.round(Number(value) * 1_000));
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
    const seconds = Math.floor((milliseconds % 60_000) / 1_000);
    const fraction = milliseconds % 1_000;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":")
      + `.${String(fraction).padStart(3, "0")}`;
  }

  function resolveHttpsUrl(value, baseUrl) {
    try {
      const url = new URL(String(value || ""), String(baseUrl || ""));
      return url.protocol === "https:" && url.href.length <= 16_384 ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function boundedText(value, maximumLength) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  }

  return { subtitleTracks, mediaSegments, assembleWebVtt };
});
