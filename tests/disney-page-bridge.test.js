const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const hlsSource = fs.readFileSync(path.resolve(__dirname, "../lib/hls-captions.js"), "utf8");
const bridgeSource = fs.readFileSync(path.resolve(__dirname, "../disney-page-bridge.js"), "utf8");

test("Disney playback manifests publish opaque subtitle tracks and load their VTT segments", async () => {
  const harness = createHarness();
  vm.runInContext(hlsSource, harness.context);
  vm.runInContext(bridgeSource, harness.context);
  harness.context.playbackJson = JSON.stringify({
    stream: { sources: [{ complete: { url: "https://media.dssott.com/title/master.m3u8" } }] }
  });

  vm.runInContext("JSON.parse(playbackJson)", harness.context);
  await settlePromises();

  const tracksEvent = harness.events.find((event) => event.type === "subtle:disney-tracks");
  assert.equal(tracksEvent.detail.contentId, "14ca4815-0611-45d5-948c-d911d78efcf2");
  assert.deepEqual(JSON.parse(JSON.stringify(tracksEvent.detail.tracks)), [{
    id: "disney-track-1",
    contentId: "14ca4815-0611-45d5-948c-d911d78efcf2",
    languageCode: "en-GB",
    label: "English [CC]",
    isCaption: true,
    format: "webvtt"
  }]);
  assert.equal(JSON.stringify(tracksEvent.detail).includes("dssott.com"), false);

  harness.document.dispatchEvent(new harness.context.CustomEvent("subtle:request-disney-track-content", {
    detail: {
      requestId: "request-1",
      contentId: "14ca4815-0611-45d5-948c-d911d78efcf2",
      trackId: "disney-track-1"
    }
  }));
  await settlePromises();

  const contentEvent = harness.events.find((event) => event.type === "subtle:disney-track-content");
  assert.equal(contentEvent.detail.requestId, "request-1");
  assert.equal(contentEvent.detail.format, "webvtt");
  assert.match(contentEvent.detail.text, /00:00:10\.500 --> 00:00:11\.500/);
  assert.match(contentEvent.detail.text, /Hello from Disney/);
});

test("Disney ignores playback-shaped manifests on unrelated hosts", async () => {
  const harness = createHarness();
  vm.runInContext(hlsSource, harness.context);
  vm.runInContext(bridgeSource, harness.context);
  harness.context.playbackJson = JSON.stringify({
    stream: { sources: [{ complete: { url: "https://untrusted.example/master.m3u8" } }] }
  });

  vm.runInContext("JSON.parse(playbackJson)", harness.context);
  await settlePromises();

  assert.deepEqual(harness.fetches, []);
  assert.equal(harness.events.some((event) => event.type === "subtle:disney-tracks"), false);
});

function createHarness() {
  const events = [];
  const fetches = [];
  const listeners = new Map();
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
  const responses = new Map([
    ["https://media.dssott.com/title/master.m3u8", `#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English",LANGUAGE="en-GB",CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog",FORCED=NO,URI="subs/en.m3u8"`],
    ["https://media.dssott.com/title/subs/en.m3u8", "#EXTM3U\n#EXTINF:2,\nsegment-1.vtt"],
    ["https://media.dssott.com/title/subs/segment-1.vtt", "WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n00:00:00.500 --> 00:00:01.500\nHello from Disney"]
  ]);
  const context = vm.createContext({
    URL,
    Map,
    Set,
    Reflect,
    CustomEvent: FakeCustomEvent,
    AbortController,
    document,
    location: {
      href: "https://www.disneyplus.com/en-gb/play/14ca4815-0611-45d5-948c-d911d78efcf2",
      pathname: "/en-gb/play/14ca4815-0611-45d5-948c-d911d78efcf2"
    },
    performance: { getEntriesByType: () => [] },
    fetch: async (url) => {
      fetches.push(String(url));
      return {
        ok: responses.has(String(url)),
        status: responses.has(String(url)) ? 200 : 404,
        text: async () => responses.get(String(url)) || ""
      };
    },
    setTimeout,
    clearTimeout
  });
  context.globalThis = context;
  context.window = context;
  return { context, document, events, fetches };
}

async function settlePromises() {
  for (let index = 0; index < 8; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
