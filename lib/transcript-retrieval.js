(function exposeSubtleTranscriptRetrieval(root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("./transcript.js") : root.SubtleTranscript
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleTranscriptRetrieval = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleTranscriptRetrieval(SubtleTranscript) {
  "use strict";

  const DEFAULT_MAX_PASSAGES = 6;
  const DEFAULT_MAX_CHARACTERS = 9_000;
  const MAX_QUESTION_LENGTH = 500;
  const STOP_WORDS = new Set([
    "about", "after", "again", "also", "because", "before", "could", "does", "from", "have", "into",
    "just", "more", "most", "that", "their", "them", "then", "there", "these", "they", "this", "what",
    "when", "where", "which", "while", "with", "would", "your"
  ]);

  function retrieve(snapshot, question, options = {}) {
    const source = SubtleTranscript.createSnapshot(snapshot);
    const normalisedQuestion = boundedText(question, MAX_QUESTION_LENGTH);
    if (!normalisedQuestion) throw retrievalError("empty_question", "Enter a question about the loaded captions.");
    if (!source.cues.length) throw retrievalError("empty_transcript", "No timed captions are available to answer from.");

    const maximumPassages = boundedInteger(options.maxPassages, 1, 12, DEFAULT_MAX_PASSAGES);
    const maximumCharacters = boundedInteger(options.maxCharacters, 500, 20_000, DEFAULT_MAX_CHARACTERS);
    const terms = queryTerms(normalisedQuestion);
    const ranked = source.cues
      .map((cue, index) => ({ index, score: cueScore(cue.text, terms, normalisedQuestion) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const anchors = ranked.length
      ? ranked.map((candidate) => candidate.index)
      : fallbackAnchors(source.cues.length, maximumPassages);

    const passages = [];
    const covered = new Set();
    let characterCount = 0;
    for (const anchor of anchors) {
      if (passages.length >= maximumPassages) break;
      const indexes = neighbourhood(source.cues, anchor, options.neighbourhood, options.maximumGapSeconds);
      if (indexes.some((index) => covered.has(index))) continue;
      const text = indexes.map((index) => source.cues[index].text).join("\n");
      if (!text || characterCount + text.length > maximumCharacters) continue;
      const cues = indexes.map((index) => source.cues[index]);
      passages.push({
        id: `p${passages.length + 1}`,
        start: cues[0].start,
        end: cues[cues.length - 1].end,
        text
      });
      indexes.forEach((index) => covered.add(index));
      characterCount += text.length;
    }

    if (!passages.length) {
      const cue = source.cues[0];
      passages.push({ id: "p1", start: cue.start, end: cue.end, text: cue.text.slice(0, maximumCharacters) });
    }
    passages.sort((left, right) => left.start - right.start);
    passages.forEach((passage, index) => { passage.id = `p${index + 1}`; });
    return {
      contentKey: source.contentKey,
      languageCode: source.languageCode,
      question: normalisedQuestion,
      passages,
      transcriptTruncated: source.truncated,
      retrievalTruncated: covered.size < source.cues.length
    };
  }

  function queryTerms(value) {
    const terms = String(value).toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
    return Array.from(new Set(terms.filter((term) => !STOP_WORDS.has(term)))).slice(0, 24);
  }

  function cueScore(text, terms, question) {
    const haystack = String(text || "").toLocaleLowerCase();
    if (!haystack) return 0;
    let score = 0;
    for (const term of terms) {
      const matches = haystack.split(term).length - 1;
      if (matches) score += 4 + Math.min(matches, 3);
    }
    const phrase = String(question || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (phrase.length >= 6 && haystack.includes(phrase)) score += 12;
    return score;
  }

  function fallbackAnchors(cueCount, maximumPassages) {
    const count = Math.min(cueCount, maximumPassages);
    if (count <= 1) return [0];
    return Array.from({ length: count }, (_value, index) => Math.round(index * (cueCount - 1) / (count - 1)));
  }

  function neighbourhood(cues, anchor, requested, requestedGap) {
    const radius = boundedInteger(requested, 0, 3, 1);
    const maximumGap = boundedNumber(requestedGap, 0, 30, 8);
    const indexes = [anchor];
    for (let distance = 1; distance <= radius; distance += 1) {
      const before = anchor - distance;
      if (before >= 0 && cues[before + 1].start - cues[before].end <= maximumGap) indexes.unshift(before);
      else break;
    }
    for (let distance = 1; distance <= radius; distance += 1) {
      const after = anchor + distance;
      if (after < cues.length && cues[after].start - cues[after - 1].end <= maximumGap) indexes.push(after);
      else break;
    }
    return indexes;
  }

  function boundedInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.floor(number)));
  }

  function boundedNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function boundedText(value, maximum) {
    return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maximum);
  }

  function retrievalError(code, message) {
    const error = new Error(message);
    error.name = "SubtleAiError";
    error.code = code;
    return error;
  }

  return { retrieve, queryTerms };
});
