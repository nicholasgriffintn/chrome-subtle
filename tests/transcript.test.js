const test = require("node:test");
const assert = require("node:assert/strict");

const Transcript = require("../lib/transcript.js");

test("a transcript snapshot keeps valid timed cues and enforces message-size bounds", () => {
  const snapshot = Transcript.createSnapshot({
    contentKey: "video-1",
    platformId: "youtube",
    languageCode: "en-GB",
    cues: [
      { start: 0, end: 1, text: " First line " },
      { start: 1, end: 2, text: "Second line" },
      { start: 2, end: 2, text: "Invalid timing" },
      { start: 2, end: 3, text: "Third line is too large" }
    ]
  }, { maxCues: 3, maxTextLength: 22 });
  assert.deepEqual(snapshot, {
    contentKey: "video-1",
    platformId: "youtube",
    languageCode: "en-gb",
    cues: [
      { start: 0, end: 1, text: "First line" },
      { start: 1, end: 2, text: "Second line" }
    ],
    truncated: true
  });
});

test("summary chunks retain the exact caption time range they contain", () => {
  const snapshot = Transcript.createSnapshot({
    contentKey: "episode-1",
    platformId: "netflix",
    languageCode: "en",
    cues: [
      { start: 10, end: 12, text: "A short opening." },
      { start: 12, end: 14, text: "The next thought." },
      { start: 31, end: 34, text: "A later scene." }
    ]
  });
  assert.deepEqual(Transcript.summaryChunks(snapshot, { maxCharacters: 40, maxDurationSeconds: 20 }), [
    { start: 10, end: 12, cueCount: 1, text: "[00:10] A short opening." },
    { start: 12, end: 14, cueCount: 1, text: "[00:12] The next thought." },
    { start: 31, end: 34, cueCount: 1, text: "[00:31] A later scene." }
  ]);
});

test("summary chunks include timestamp overhead in their hard character limit", () => {
  const snapshot = Transcript.createSnapshot({
    contentKey: "episode-1",
    platformId: "netflix",
    languageCode: "en",
    cues: [
      ...Array.from({ length: 30 }, (_, index) => ({ start: index, end: index + 0.5, text: "x" })),
      { start: 31, end: 32, text: "A deliberately oversized caption without convenient word boundaries." }
    ]
  });

  const chunks = Transcript.summaryChunks(snapshot, { maxCharacters: 32, maxDurationSeconds: 300 });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 32));
});

test("transcript identity changes across platforms, tracks and cue content", () => {
  const base = {
    contentKey: "shared-title",
    platformId: "youtube",
    languageCode: "en",
    cues: [{ start: 1, end: 2, text: "First track" }]
  };
  const identity = Transcript.identityFor(base);

  assert.equal(Transcript.sameIdentity(identity, Transcript.identityFor(base)), true);
  assert.equal(Transcript.sameIdentity(identity, Transcript.identityFor({ ...base, platformId: "netflix" })), false);
  assert.equal(Transcript.sameIdentity(identity, Transcript.identityFor({ ...base, languageCode: "fr" })), false);
  assert.equal(Transcript.sameIdentity(identity, Transcript.identityFor({
    ...base,
    cues: [{ start: 1, end: 2, text: "Replacement track" }]
  })), false);
});
