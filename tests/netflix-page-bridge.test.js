const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bridgeSource = fs.readFileSync(path.resolve(__dirname, "..", "netflix-page-bridge.js"), "utf8");

test("Netflix manifest requests ask for every subtitle track and WebVTT", () => {
  const harness = createHarness();
  vm.runInContext(bridgeSource, harness.context);
  harness.context.request = {
    params: {
      profiles: ["imsc1.1"],
      showAllSubDubTracks: false
    }
  };

  vm.runInContext("JSON.stringify(request)", harness.context);

  assert.equal(harness.context.request.params.showAllSubDubTracks, true);
  assert.deepEqual(
    Array.from(harness.context.request.params.profiles.slice(0, 2)),
    ["webvtt-lssdh-ios8", "webvtt-lssdh-ios"]
  );
});

test("Netflix manifests publish bounded track metadata without download URLs", () => {
  const harness = createHarness();
  vm.runInContext(bridgeSource, harness.context);
  harness.context.manifestJson = JSON.stringify(manifestFixture());

  vm.runInContext("JSON.parse(manifestJson)", harness.context);

  const event = harness.events.find((candidate) => candidate.type === "subtle:netflix-tracks");
  assert.equal(event.detail.contentId, "70080178");
  assert.equal(event.detail.tracks.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(event.detail.tracks[0])),
    {
      id: "en-main",
      contentId: "70080178",
      languageCode: "en",
      label: "English",
      kind: "subtitles",
      isCaption: false,
      format: "webvtt"
    }
  );
  assert.equal(JSON.stringify(event.detail).includes("nflxvideo.net"), false);
});

test("Netflix track content is fetched by opaque identifier with URL fallback", async () => {
  const harness = createHarness({
    fetch: async (url) => url.includes("first")
      ? { ok: false, status: 403, text: async () => "" }
      : { ok: true, status: 200, text: async () => "WEBVTT\n\n00:01.000 --> 00:02.000\nHello" }
  });
  vm.runInContext(bridgeSource, harness.context);
  harness.context.manifestJson = JSON.stringify(manifestFixture());
  vm.runInContext("JSON.parse(manifestJson)", harness.context);

  harness.document.dispatchEvent(new harness.context.CustomEvent("subtle:request-netflix-track-content", {
    detail: { requestId: "request-1", contentId: "70080178", trackId: "en-main" }
  }));
  await new Promise((resolve) => setImmediate(resolve));

  const event = harness.events.find((candidate) => candidate.type === "subtle:netflix-track-content");
  assert.equal(event.detail.requestId, "request-1");
  assert.equal(event.detail.format, "webvtt");
  assert.match(event.detail.text, /Hello/);
  assert.deepEqual(harness.fetches, [
    "https://cdn.nflxvideo.net/first.vtt",
    "https://cdn.nflxvideo.net/second.vtt"
  ]);
  assert.equal(harness.timeoutCount(), 1);
});

test("Netflix's JSON hook respects toJSON without walking discarded data", () => {
  const harness = createHarness();
  vm.runInContext(bridgeSource, harness.context);
  harness.context.discardedReads = 0;

  vm.runInContext(`
    const discarded = {};
    Object.defineProperty(discarded, "expensive", {
      enumerable: true,
      get() { discardedReads += 1; return {}; }
    });
    JSON.stringify({ discarded, toJSON() { return { safe: true }; } });
  `, harness.context);

  assert.equal(harness.context.discardedReads, 0);
});

function manifestFixture() {
  return {
    result: {
      movieId: 70080178,
      textTracks: [
        {
          id: "en-main",
          language: "en",
          languageDescription: "English",
          rawTrackType: "subtitles",
          ttDownloadables: {
            "webvtt-lssdh-ios8": {
              urls: [
                { url: "https://cdn.nflxvideo.net/first.vtt" },
                { url: "https://cdn.nflxvideo.net/second.vtt" }
              ]
            }
          }
        },
        {
          new_track_id: "es-cc",
          language: "es",
          languageDescription: "Español",
          rawTrackType: "closedcaptions",
          downloadables: {
            "dfxp-ls-sdh": { downloadUrls: { main: "https://cdn.nflxvideo.net/es.xml" } }
          }
        },
        { id: "forced", language: "en", isForcedNarrative: true, ttDownloadables: {} }
      ]
    }
  };
}

function createHarness(options = {}) {
  const events = [];
  const fetches = [];
  const listeners = new Map();
  let timeoutCount = 0;
  class FakeCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  const document = {
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    dispatchEvent(event) {
      events.push(event);
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    }
  };
  const fetchImpl = options.fetch || (async () => ({ ok: true, text: async () => "WEBVTT" }));
  const context = vm.createContext({
    URL,
    Reflect,
    WeakSet,
    Map,
    Set,
    AbortController,
    CustomEvent: FakeCustomEvent,
    document,
    location: { href: "https://www.netflix.com/watch/70080178", pathname: "/watch/70080178" },
    fetch: async (url, init) => {
      fetches.push(url);
      return fetchImpl(url, init);
    },
    setTimeout(callback, delay) {
      timeoutCount += 1;
      return setTimeout(callback, delay);
    },
    clearTimeout
  });
  context.globalThis = context;
  return { context, document, events, fetches, timeoutCount: () => timeoutCount };
}
