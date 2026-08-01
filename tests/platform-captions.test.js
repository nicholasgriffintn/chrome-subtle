const test = require("node:test");
const assert = require("node:assert/strict");
const PlatformCaptions = require("../lib/platform-captions.js");

test("supported sites expose caption providers through one stable interface", () => {
  const youtube = PlatformCaptions.forPlatform("youtube");
  const netflix = PlatformCaptions.forPlatform("netflix");
  const bbc = PlatformCaptions.forPlatform("bbc");
  const disney = PlatformCaptions.forPlatform("disney");

  for (const provider of [youtube, netflix, bbc, disney]) {
    assert.equal(typeof provider.contentKey, "function");
    assert.equal(typeof provider.tracksFromEvent, "function");
    assert.equal(typeof provider.selectTrack, "function");
    assert.equal(typeof provider.loadCues, "function");
    assert.equal(typeof provider.availableLanguages, "function");
  }
  assert.equal(PlatformCaptions.forPlatform("unsupported"), null);
  assert.equal(bbc.contentKey({ pathname: "/iplayer/episode/p0gd2b0j/example" }), "p0gd2b0j");
  assert.equal(disney.contentKey({ pathname: "/en-gb/play/14ca4815-0611-45d5-948c-d911d78efcf2" }), "14ca4815-0611-45d5-948c-d911d78efcf2");
});

test("Disney tracks remain opaque and selected content loads through its page bridge", async () => {
  const provider = PlatformCaptions.forPlatform("disney");
  const tracks = provider.tracksFromEvent({
    contentId: "14ca4815-0611-45d5-948c-d911d78efcf2",
    tracks: [{
      id: "disney-track-1",
      contentId: "14ca4815-0611-45d5-948c-d911d78efcf2",
      languageCode: "en-GB",
      label: "English [CC]",
      isCaption: true,
      format: "webvtt",
      playlistUrl: "https://should-not-cross.example/track.m3u8"
    }]
  }, { pathname: "/en-gb/play/14ca4815-0611-45d5-948c-d911d78efcf2" });

  assert.equal(tracks.length, 1);
  assert.equal("playlistUrl" in tracks[0], false);
  assert.deepEqual(provider.availableLanguages(tracks), [{ languageCode: "en-gb", label: "English [CC]" }]);

  const documentRef = eventDocument((event, document) => {
    if (event.type !== "subtle:request-disney-track-content") return;
    document.dispatchEvent({
      type: "subtle:disney-track-content",
      detail: {
        requestId: event.detail.requestId,
        format: "webvtt",
        text: "WEBVTT\n\n00:01.000 --> 00:02.000\nDisney line"
      }
    });
  });
  const cues = await provider.loadCues(tracks[0], {}, {
    documentRef,
    createEvent: (type, detail) => ({ type, detail })
  });
  assert.equal(cues[0].text, "Disney line");
});

test("provider events are accepted only for the current title", () => {
  const youtube = PlatformCaptions.forPlatform("youtube");
  const netflix = PlatformCaptions.forPlatform("netflix");

  assert.equal(youtube.tracksFromEvent(
    { videoId: "old", tracks: [] },
    { href: "https://www.youtube.com/watch?v=current" }
  ), null);
  assert.equal(netflix.tracksFromEvent(
    { contentId: "456", tracks: [] },
    { pathname: "/watch/123" }
  ), null);
  assert.deepEqual(netflix.tracksFromEvent(
    { contentId: "123", tracks: [] },
    { pathname: "/watch/123" }
  ), []);
});

test("track requests use the provider's page-bridge event", () => {
  let dispatched;
  PlatformCaptions.requestTracks(
    PlatformCaptions.forPlatform("netflix"),
    { dispatchEvent(event) { dispatched = event; } },
    (type) => ({ type })
  );
  assert.deepEqual(dispatched, { type: "subtle:request-netflix-tracks" });

  dispatched = undefined;
  PlatformCaptions.requestTracks(
    PlatformCaptions.forPlatform("bbc"),
    { dispatchEvent(event) { dispatched = event; } },
    (type) => ({ type })
  );
  assert.equal(dispatched, undefined);
});

test("YouTube exposes only languages from the player's current caption menu", () => {
  const provider = PlatformCaptions.forPlatform("youtube");
  const tracks = provider.tracksFromEvent({
    videoId: "current",
    tracks: [{
      baseUrl: "https://www.youtube.com/api/timedtext?v=current&lang=en&pot=proof",
      languageCode: "en"
    }],
    availableLanguages: [
      { languageCode: "en", label: "English" },
      { languageCode: "fr", label: "Français" }
    ]
  }, { href: "https://www.youtube.com/watch?v=current" });

  assert.deepEqual(provider.availableLanguages(tracks), [
    { languageCode: "en", label: "English" },
    { languageCode: "fr", label: "Français" }
  ]);
});

test("a failed page-bridge dispatch cleans up its response listener immediately", async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const listeners = new Set();
  let cleared = false;
  global.setTimeout = () => 42;
  global.clearTimeout = (timer) => { if (timer === 42) cleared = true; };

  try {
    await assert.rejects(
      PlatformCaptions.forPlatform("netflix").loadCues(
        { id: "track-1", contentId: "123", format: "webvtt" },
        {},
        {
          documentRef: {
            addEventListener(_type, listener) { listeners.add(listener); },
            removeEventListener(_type, listener) { listeners.delete(listener); },
            dispatchEvent() { throw new Error("page context unavailable"); }
          },
          createEvent: (type, detail) => ({ type, detail })
        }
      ),
      /page context unavailable/
    );
    assert.equal(listeners.size, 0);
    assert.equal(cleared, true);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

function eventDocument(onDispatch) {
  const listeners = new Map();
  const document = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatchEvent(event) {
      onDispatch(event, document);
      listeners.get(event.type)?.(event);
    }
  };
  return document;
}
