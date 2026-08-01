const test = require("node:test");
const assert = require("node:assert/strict");
const PlatformCaptions = require("../lib/platform-captions.js");

const YouTubeCaptions = PlatformCaptions.forPlatform("youtube");

test("page-provided tracks and player-menu languages are bounded before use", () => {
  const track = { baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=es&pot=proof", languageCode: "es" };
  const tracks = YouTubeCaptions.tracksFromEvent({
    videoId: "abc",
    tracks: Array.from({ length: 40 }, () => track),
    availableLanguages: [
      { languageCode: "en", label: "English" },
      { languageCode: "zh-Hans", label: "Chinese (Simplified)" },
      { languageCode: "ZH-HANS", label: "duplicate" }
    ]
  }, { href: "https://www.youtube.com/watch?v=abc" });

  assert.equal(tracks.length, 16);
  assert.deepEqual(tracks[0].availableLanguages, [
    { languageCode: "en", label: "English" },
    { languageCode: "zh-Hans", label: "Chinese (Simplified)" }
  ]);
  assert.equal(YouTubeCaptions.selectTrack(tracks, { targetLanguage: "zh-hans" }, "es").targetLanguage, "zh-Hans");
});

test("track selection favours the browser language, then human captions", () => {
  const availableLanguages = [{ languageCode: "en", label: "English" }];
  const tracks = [
    { languageCode: "fr", kind: "asr", availableLanguages },
    { languageCode: "es", kind: "standard", availableLanguages },
    { languageCode: "de", kind: "standard", availableLanguages }
  ];
  assert.equal(YouTubeCaptions.selectTrack(tracks, { targetLanguage: "en" }, "de-DE").languageCode, "de");
  assert.equal(YouTubeCaptions.selectTrack(tracks, { targetLanguage: "en" }, "it").languageCode, "es");
});

test("YouTube caption content is requested through the page bridge", async () => {
  const harness = contentHarness({ text: '{"events":[]}' });
  const cues = await YouTubeCaptions.loadCues(
    { ...youtubeTrack(), targetLanguage: "en" },
    {},
    { documentRef: harness.document, createEvent: harness.createEvent }
  );

  assert.deepEqual(cues, []);
  assert.equal(harness.request.targetLanguage, "en");
});

test("a YouTube 429 remains identifiable for request deduplication", async () => {
  const harness = contentHarness({ status: 429, error: "YouTube is rate-limiting this caption track." });
  await assert.rejects(
    YouTubeCaptions.loadCues(
      { ...youtubeTrack(), targetLanguage: "en" },
      {},
      { documentRef: harness.document, createEvent: harness.createEvent }
    ),
    (error) => error.status === 429
  );
});

function youtubeTrack() {
  return {
    baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=es&pot=proof",
    languageCode: "es",
    availableLanguages: [{ languageCode: "en", label: "English" }]
  };
}

function contentHarness(response) {
  const listeners = new Map();
  const harness = { request: null, createEvent: (type, detail) => ({ type, detail }) };
  harness.document = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatchEvent(event) {
      if (event.type !== "subtle:request-youtube-track-content") return;
      harness.request = event.detail;
      queueMicrotask(() => listeners.get("subtle:youtube-track-content")?.({
        detail: { requestId: event.detail.requestId, ...response }
      }));
    }
  };
  return harness;
}
