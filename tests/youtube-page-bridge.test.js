const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bridgeSource = fs.readFileSync(path.resolve(__dirname, "..", "youtube-page-bridge.js"), "utf8");

test("the bridge publishes the player's proof-bearing timed-text request", async () => {
  const harness = createHarness();
  vm.runInNewContext(bridgeSource, harness.context);

  await harness.context.fetch("https://www.youtube.com/api/timedtext?v=abc123&lang=es&pot=proof");

  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0].detail.videoId, "abc123");
  assert.equal(harness.events[0].detail.tracks[0].languageCode, "es");
  assert.match(harness.events[0].detail.tracks[0].baseUrl, /pot=proof/);
});

test("the bridge ignores translated, unproved and extension-originated requests", async () => {
  const harness = createHarness();
  vm.runInNewContext(bridgeSource, harness.context);

  await harness.context.fetch("https://www.youtube.com/api/timedtext?v=abc123&lang=es");
  await harness.context.fetch("https://www.youtube.com/api/timedtext?v=abc123&lang=es&pot=proof&tlang=en");
  await harness.context.fetch("https://www.youtube.com/api/timedtext?v=abc123&lang=es&pot=proof&subtle_client=1");

  assert.equal(harness.events.length, 0);
});

function createHarness() {
  const events = [];
  const listeners = new Map();
  class FakeXhr {
    open() { }
    send() { }
  }
  class FakePerformanceObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() { }
  }
  class FakeCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  const document = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      if (event.type === "subtle:youtube-tracks") events.push(event);
      listeners.get(event.type)?.(event);
    }
  };
  const context = {
    URL,
    Symbol,
    Reflect,
    document,
    location: { href: "https://www.youtube.com/watch?v=abc123", pathname: "/watch" },
    performance: { getEntriesByType: () => [] },
    PerformanceObserver: FakePerformanceObserver,
    XMLHttpRequest: FakeXhr,
    CustomEvent: FakeCustomEvent,
    fetch: async () => ({ ok: true })
  };
  context.globalThis = context;
  return { context, events };
}
