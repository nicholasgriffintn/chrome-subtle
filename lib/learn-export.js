(function exposeSubtleLearnExport(root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("./transcript.js") : root.SubtleTranscript
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleLearnExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleLearnExport(SubtleTranscript) {
  "use strict";

  function create(environment = globalThis) {
    function downloadTranslation(snapshot) {
      const source = SubtleTranscript.createSnapshot(snapshot);
      return downloadText(
        toSrt(source),
        filename("translated-captions", source.languageCode, "srt"),
        "application/x-subrip;charset=utf-8"
      );
    }

    function downloadExplanation(result) {
      return downloadText(
        explanationMarkdown(result),
        filename("caption-note", "", "md"),
        "text/markdown;charset=utf-8"
      );
    }

    function downloadSummary(result) {
      return downloadText(
        summaryMarkdown(result),
        filename("track-summary", result?.outputLanguage || result?.languageCode, "md"),
        "text/markdown;charset=utf-8"
      );
    }

    function downloadAnswer(result) {
      return downloadText(
        answerMarkdown(result),
        filename("caption-answer", result?.languageCode, "md"),
        "text/markdown;charset=utf-8"
      );
    }

    function downloadText(content, name, type) {
      if (!environment.document?.createElement || !environment.URL?.createObjectURL || typeof environment.Blob !== "function") {
        throw new Error("Downloads are unavailable in this browser context.");
      }
      const blob = new environment.Blob([content], { type });
      const url = environment.URL.createObjectURL(blob);
      const anchor = environment.document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.hidden = true;
      environment.document.body?.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove?.();
        (environment.setTimeout || setTimeout)(() => environment.URL.revokeObjectURL(url), 0);
      }
      return { name, type, size: blob.size };
    }

    return { downloadTranslation, downloadExplanation, downloadSummary, downloadAnswer };
  }

  function toSrt(snapshot) {
    const source = SubtleTranscript.createSnapshot(snapshot);
    return source.cues.map((cue, index) => [
      String(index + 1),
      `${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}`,
      safeSubtitleText(cue.text),
      ""
    ].join("\n")).join("\n");
  }

  function explanationMarkdown(result) {
    const value = result && typeof result === "object" ? result : {};
    const sections = ["# Caption note", ""];
    const timestamp = finiteNumber(value.start);
    if (timestamp !== null) sections.push(`**At:** ${SubtleTranscript.formatTimestamp(timestamp)}`, "");
    appendQuoted(sections, value.text);
    appendSection(sections, "Meaning", value.meaning);
    appendSection(sections, "Natural phrasing", value.naturalPhrasing);
    const grammar = boundedArray(value.grammarNotes, 8, 500);
    if (grammar.length) sections.push("## Grammar notes", "", ...grammar.map((item) => `- ${safeMarkdownText(item)}`), "");
    const vocabulary = (Array.isArray(value.vocabulary) ? value.vocabulary : []).slice(0, 12).flatMap((item) => {
      const term = boundedText(item?.term, 120);
      const definition = boundedText(item?.definition, 500);
      return term && definition ? [`- **${safeMarkdownText(term)}:** ${safeMarkdownText(definition)}`] : [];
    });
    if (vocabulary.length) sections.push("## Vocabulary", "", ...vocabulary, "");
    return `${sections.join("\n").trim()}\n`;
  }

  function summaryMarkdown(result) {
    const value = result && typeof result === "object" ? result : {};
    const sections = ["# Caption track summary", ""];
    for (const section of Array.isArray(value.sections) ? value.sections.slice(0, 200) : []) {
      const start = finiteNumber(section?.start);
      const summary = boundedText(section?.summary, 8_000);
      if (start === null || !summary) continue;
      sections.push(`## ${SubtleTranscript.formatTimestamp(start)}`, "", safeMarkdownText(summary), "");
    }
    return `${sections.join("\n").trim()}\n`;
  }

  function answerMarkdown(result) {
    const value = result && typeof result === "object" ? result : {};
    const sections = ["# Caption answer", ""];
    appendSection(sections, "Question", value.question);
    appendSection(sections, "Answer", value.answer);
    const citations = (Array.isArray(value.citations) ? value.citations : []).slice(0, 12).flatMap((citation) => {
      const start = finiteNumber(citation?.start);
      const text = boundedText(citation?.text, 4_000);
      if (start === null || !text) return [];
      return [`## Source · ${SubtleTranscript.formatTimestamp(start)}`, "", ...text.split("\n").map((line) => `> ${safeMarkdownText(line)}`), ""];
    });
    if (citations.length) sections.push(...citations);
    return `${sections.join("\n").trim()}\n`;
  }

  function filename(kind, language, extension) {
    const safeKind = boundedText(kind, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subtle-export";
    const safeLanguage = boundedText(language, 20).toLowerCase().replace(/[^a-z0-9-]+/g, "");
    const safeExtension = /^[a-z0-9]{1,8}$/i.test(extension) ? extension.toLowerCase() : "txt";
    return `subtle-${safeKind}${safeLanguage && safeLanguage !== "und" ? `-${safeLanguage}` : ""}.${safeExtension}`;
  }

  function srtTimestamp(seconds) {
    const milliseconds = Math.max(0, Math.round((Number(seconds) || 0) * 1_000));
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
    const remainingSeconds = Math.floor((milliseconds % 60_000) / 1_000);
    const remainingMilliseconds = milliseconds % 1_000;
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(remainingSeconds, 2)},${pad(remainingMilliseconds, 3)}`;
  }

  function appendQuoted(sections, value) {
    const text = boundedText(value, 4_000);
    if (text) sections.push(...text.split("\n").map((line) => `> ${safeMarkdownText(line)}`), "");
  }

  function appendSection(sections, heading, value) {
    const text = boundedText(value, 4_000);
    if (text) sections.push(`## ${heading}`, "", safeMarkdownText(text), "");
  }

  function boundedArray(value, maximumItems, maximumLength) {
    return (Array.isArray(value) ? value : []).slice(0, maximumItems).map((item) => boundedText(item, maximumLength)).filter(Boolean);
  }

  function safeSubtitleText(value) {
    return boundedText(value, 8_000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function safeMarkdownText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/([\[\]])/g, "\\$1");
  }

  function boundedText(value, maximum) {
    return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maximum);
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function pad(value, length) {
    return String(value).padStart(length, "0");
  }

  return { create, toSrt, explanationMarkdown, summaryMarkdown, answerMarkdown, filename, srtTimestamp };
});
