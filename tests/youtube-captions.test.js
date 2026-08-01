const test = require("node:test");
const assert = require("node:assert/strict");
const YouTubeCaptions = require("../lib/youtube-captions.js");

test("caption URLs preserve proof tokens and mark extension fetches", () => {
  const url = YouTubeCaptions.buildTrackUrl({ baseUrl: "https://www.youtube.com/api/timedtext?v=abc&pot=proof", languageCode: "es" }, "en");
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("fmt"), "json3");
  assert.equal(parsed.searchParams.get("tlang"), "en");
  assert.equal(parsed.searchParams.get("pot"), "proof");
  assert.equal(parsed.searchParams.get("subtle_client"), "1");
  assert.equal(YouTubeCaptions.buildTrackUrl({ baseUrl: "https://attacker.example/captions", languageCode: "es" }, "en"), null);
  assert.equal(YouTubeCaptions.buildTrackUrl({ baseUrl: "https://www.youtube.com/watch?v=abc&pot=proof", languageCode: "es" }, "en"), null);
  assert.equal(YouTubeCaptions.buildTrackUrl({ baseUrl: "https://www.youtube.com/api/timedtext?v=abc", languageCode: "es" }, "en"), null);
});

test("page-provided tracks are bounded and constrained before use", () => {
  const valid = { baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=es&pot=proof", languageCode: "es" };
  const oversized = Array.from({ length: 40 }, () => valid);
  const tracks = YouTubeCaptions.normaliseTracks([
    { baseUrl: "https://www.youtube.com/watch?v=abc&pot=proof", languageCode: "en" },
    ...oversized
  ]);

  assert.equal(tracks.length, 15);
  assert.equal(tracks[0].languageCode, "es");
});

test("track selection favours the browser language, then human captions", () => {
  const tracks = [
    { languageCode: "fr", kind: "asr" },
    { languageCode: "es", kind: "standard" },
    { languageCode: "de", kind: "standard" }
  ];
  assert.equal(YouTubeCaptions.selectTrack(tracks, "de"), tracks[2]);
  assert.equal(YouTubeCaptions.selectTrack(tracks, "de-DE"), tracks[2]);
  assert.equal(YouTubeCaptions.selectTrack(tracks, "it"), tracks[1]);
});

test("an empty successful YouTube caption response degrades to no cues", async () => {
  const track = { baseUrl: "https://www.youtube.com/api/timedtext?v=abc&pot=proof", languageCode: "es" };
  const cues = await YouTubeCaptions.loadTrack(track, "en", async () => ({
    ok: true,
    status: 200,
    text: async () => ""
  }));

  assert.deepEqual(cues, []);
});

test("an unreadable YouTube caption response produces a useful error", async () => {
  const track = { baseUrl: "https://www.youtube.com/api/timedtext?v=abc&pot=proof", languageCode: "es" };
  await assert.rejects(
    YouTubeCaptions.loadTrack(track, "en", async () => ({
      ok: true,
      status: 200,
      text: async () => "not-json"
    })),
    /unreadable caption response/
  );
});
