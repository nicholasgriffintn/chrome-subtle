const test = require("node:test");
const assert = require("node:assert/strict");

const LearnExport = require("../lib/learn-export.js");

test("translated captions export as standards-shaped SRT with millisecond timing", () => {
  const output = LearnExport.toSrt({
    contentKey: "video-1",
    platformId: "youtube",
    languageCode: "fr",
    cues: [
      { start: 1.234, end: 3.5, text: "Première ligne" },
      { start: 3.5, end: 65.006, text: "Deuxième\nligne <script>alert(1)</script>" }
    ]
  });

  assert.equal(output, [
    "1",
    "00:00:01,234 --> 00:00:03,500",
    "Première ligne",
    "",
    "2",
    "00:00:03,500 --> 00:01:05,006",
    "Deuxième\nligne &lt;script&gt;alert(1)&lt;/script&gt;",
    ""
  ].join("\n"));
});

test("explanations and summaries export as bounded readable Markdown", () => {
  const explanation = LearnExport.explanationMarkdown({
    start: 62,
    text: "Ça marche.",
    meaning: "It works.",
    naturalPhrasing: "That works.",
    grammarNotes: ["Ça is a contraction."],
    vocabulary: [{ term: "marcher", definition: "to work or function" }]
  });
  const summary = LearnExport.summaryMarkdown({
    sections: [{ start: 90, summary: "The plan changes." }]
  });

  assert.match(explanation, /^# Caption note/);
  assert.match(explanation, /\*\*At:\*\* 01:02/);
  assert.match(explanation, /> Ça marche\./);
  assert.match(explanation, /\*\*marcher:\*\* to work or function/);
  assert.equal(summary, "# Caption track summary\n\n## 01:30\n\nThe plan changes.\n");
});

test("exported model text cannot introduce active HTML or Markdown links", () => {
  const explanation = LearnExport.explanationMarkdown({
    text: "<img src=x onerror=alert(1)>",
    meaning: "[Open](javascript:alert(1))"
  });

  assert.doesNotMatch(explanation, /<img/);
  assert.doesNotMatch(explanation, /\[Open\]\(javascript:/);
  assert.match(explanation, /&lt;img/);
  assert.match(explanation, /\\\[Open\\\]/);
});

test("caption answers export questions and timestamped supporting excerpts", () => {
  const answer = LearnExport.answerMarkdown({
    question: "What does Mina find?",
    answer: "A hidden letter.",
    citations: [{ start: 42, text: "Mina finds a hidden letter.\nIt names the missing heir." }]
  });

  assert.match(answer, /^# Caption answer/);
  assert.match(answer, /## Question\n\nWhat does Mina find\?/);
  assert.match(answer, /## Answer\n\nA hidden letter\./);
  assert.match(answer, /## Source · 00:42/);
  assert.match(answer, /> Mina finds a hidden letter\./);
});

test("local downloads revoke their object URL after triggering the anchor", () => {
  const clicks = [];
  const revoked = [];
  const appended = [];
  const environment = {
    Blob,
    URL: {
      createObjectURL(blob) { assert.ok(blob.size > 0); return "blob:local-result"; },
      revokeObjectURL(url) { revoked.push(url); }
    },
    document: {
      body: { appendChild(anchor) { appended.push(anchor); } },
      createElement(tagName) {
        assert.equal(tagName, "a");
        return { click() { clicks.push(this.download); }, remove() {} };
      }
    },
    setTimeout(callback) { callback(); }
  };
  const exporter = LearnExport.create(environment);

  const result = exporter.downloadSummary({ outputLanguage: "en", sections: [{ start: 0, summary: "Opening" }] });

  assert.deepEqual(clicks, ["subtle-track-summary-en.md"]);
  assert.deepEqual(revoked, ["blob:local-result"]);
  assert.equal(appended.length, 1);
  assert.equal(result.type, "text/markdown;charset=utf-8");
});
