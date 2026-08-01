const test = require("node:test");
const assert = require("node:assert/strict");
const SubtleCues = require("../lib/cues.js");

test("SRT parsing handles identifiers, HTML and comma timestamps", () => {
  const cues = SubtleCues.parseTimedText(`1\n00:00:01,250 --> 00:00:03,500\n<i>Hello</i> &amp; welcome\n\n2\n00:00:04,000 --> 00:00:05,000\nSecond line`);

  assert.deepEqual(cues, [
    { start: 1.25, end: 3.5, text: "Hello & welcome" },
    { start: 4, end: 5, text: "Second line" }
  ]);
});

test("WebVTT parsing skips metadata blocks and accepts cue settings", () => {
  const cues = SubtleCues.parseTimedText(`WEBVTT\n\nNOTE generated locally\nignore me\n\nintro\n00:01.000 --> 00:03.200 align:center\nHello<br>world`);

  assert.deepEqual(cues, [{ start: 1, end: 3.2, text: "Hello\nworld" }]);
});

test("YouTube JSON3 segments become searchable cues", () => {
  const cues = SubtleCues.parseYouTubeJson({ events: [
    { tStartMs: 500, dDurationMs: 1200, segs: [{ utf8: "Good " }, { utf8: "morning" }] },
    { tStartMs: 2000, dDurationMs: 800, segs: [{ utf8: "[Music]" }] }
  ] });

  assert.equal(SubtleCues.cueAtTime(cues, 0.4), null);
  assert.equal(SubtleCues.cueAtTime(cues, 1.1).text, "Good morning");
  assert.equal(SubtleCues.isSoundCue(cues[1].text), true);
});

test("overlapping YouTube cues prefer the latest rolling-caption update", () => {
  const cues = [
    { start: 10, end: 16, text: "this card, this card is" },
    { start: 12, end: 16, text: "this card, this card is kind of unique" }
  ];

  assert.equal(SubtleCues.cueAtTime(cues, 13).text, "this card, this card is kind of unique");
});

test("an earlier overlapping cue remains available after a newer cue ends", () => {
  const cues = [
    { start: 10, end: 20, text: "long caption" },
    { start: 12, end: 14, text: "short update" }
  ];

  assert.equal(SubtleCues.cueAtTime(cues, 16).text, "long caption");
});

test("invalid and zero-length cues are discarded", () => {
  const cues = SubtleCues.parseTimedText(`00:03,000 --> 00:02,000\nBackwards\n\nnot timing\nNo cue`);
  assert.deepEqual(cues, []);
});

test("subtitle fingerprints distinguish equal-length file revisions", () => {
  assert.notEqual(SubtleCues.fingerprintText("first"), SubtleCues.fingerprintText("third"));
});
