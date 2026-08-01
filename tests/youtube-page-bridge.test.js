const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bridgeSource = fs.readFileSync(path.resolve(__dirname, "..", "youtube-page-bridge.js"), "utf8");

test("the bridge publishes the proof-bearing request with the player's current caption menu", async () => {
  const harness = createHarness();
  vm.runInNewContext(bridgeSource, harness.context);
  await harness.context.fetch("https://www.youtube.com/api/timedtext?v=abc123&lang=es&pot=proof");

  assert.equal(harness.trackEvents[0].detail.videoId, "abc123");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.trackEvents[0].detail.availableLanguages)), [
    { languageCode: "en", label: "English" },
    { languageCode: "fr", label: "Français" }
  ]);
});

test("the bridge fetches a menu language in page context and ignores unsupported targets", async () => {
  const harness = createHarness();
  vm.runInNewContext(bridgeSource, harness.context);
  await harness.context.fetch("https://www.youtube.com/api/timedtext?v=abc123&lang=es&pot=proof");

  await harness.document.dispatchEvent(new harness.context.CustomEvent("subtle:request-youtube-track-content", {
    detail: { requestId: "allowed", targetLanguage: "fr" }
  }));
  await harness.document.dispatchEvent(new harness.context.CustomEvent("subtle:request-youtube-track-content", {
    detail: { requestId: "blocked", targetLanguage: "de" }
  }));

  assert.equal(new URL(harness.requests[1]).searchParams.get("tlang"), "fr");
  assert.equal(harness.contentEvents.length, 1);
  assert.equal(harness.contentEvents[0].detail.requestId, "allowed");
});

function createHarness() {
  const listeners = new Map();
  const trackEvents = [];
  const contentEvents = [];
  const requests = [];
  class FakeXhr { open() {} send() {} }
  class FakePerformanceObserver { observe() {} }
  class FakeCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }
  const player = {
    getOption(module, option) {
      if (module !== "captions" || option !== "tracklist") return [];
      return [
        { languageCode: "en", displayName: "English" },
        { languageCode: "fr", name: { simpleText: "Français" } }
      ];
    },
    getPlayerResponse() { return { videoDetails: { videoId: "abc123" } }; }
  };
  const document = {
    querySelector: () => player,
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatchEvent(event) {
      if (event.type === "subtle:youtube-tracks") trackEvents.push(event);
      if (event.type === "subtle:youtube-track-content") contentEvents.push(event);
      return listeners.get(event.type)?.(event);
    }
  };
  const context = {
    URL, Symbol, Reflect, document,
    location: { href: "https://www.youtube.com/watch?v=abc123", pathname: "/watch" },
    performance: { getEntriesByType: () => [] },
    PerformanceObserver: FakePerformanceObserver,
    XMLHttpRequest: FakeXhr,
    CustomEvent: FakeCustomEvent,
    fetch: async (url) => {
      requests.push(String(url));
      return { ok: true, status: 200, text: async () => '{"events":[]}' };
    }
  };
  context.globalThis = context;
  return { context, document, trackEvents, contentEvents, requests };
}
