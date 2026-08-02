const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bridgeSource = fs.readFileSync(path.resolve(__dirname, "../prime-page-bridge.js"), "utf8");

test("Prime playback responses publish opaque tracks and load the selected timed-text file", async () => {
  const playbackUrl = "https://www.amazon.co.uk/cdp/catalog/GetVodPlaybackResources?asin=B0GWM2TV7P";
  const subtitleUrl = "https://cf-timedtext.aux.pv-cdn.net/prime/en-GB.xml";
  const harness = createHarness(new Map([
    [playbackUrl, JSON.stringify({
      id: "amzn1.dv.gti.episode",
      timedTextUrls: {
        result: {
          subtitleUrls: [{
            languageCode: "en-GB",
            displayName: "English [CC]",
            type: "SDH",
            url: subtitleUrl
          }],
          forcedNarrativeUrls: [{
            languageCode: "en-GB",
            displayName: "English forced",
            type: "ForcedNarrative",
            url: "https://cf-timedtext.aux.pv-cdn.net/prime/en-forced.xml"
          }]
        }
      }
    })],
    [subtitleUrl, '<tt><body><div><p begin="00:00:01.000" end="00:00:02.000">Prime line</p></div></body></tt>']
  ]));
  vm.runInContext(bridgeSource, harness.context);

  await vm.runInContext(`fetch(${JSON.stringify(playbackUrl)})`, harness.context);
  await settlePromises();

  const tracksEvent = harness.events.find((event) => event.type === "subtle:prime-tracks");
  assert.equal(tracksEvent.detail.pageContentKey, "B0GWM2TV7P");
  assert.equal(tracksEvent.detail.tracks.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(tracksEvent.detail.tracks[0])), {
    id: "prime-track-1",
    contentId: "amzn1.dv.gti.episode",
    languageCode: "en-GB",
    label: "English [CC]",
    isCaption: true,
    isForced: false,
    format: "ttml"
  });
  assert.equal(JSON.stringify(tracksEvent.detail).includes("pv-cdn.net"), false);

  harness.document.dispatchEvent(new harness.context.CustomEvent("subtle:request-prime-track-content", {
    detail: {
      requestId: "request-1",
      contentId: "amzn1.dv.gti.episode",
      trackId: "prime-track-1"
    }
  }));
  await settlePromises();

  const contentEvent = harness.events.find((event) => event.type === "subtle:prime-track-content");
  assert.equal(contentEvent.detail.requestId, "request-1");
  assert.equal(contentEvent.detail.format, "ttml");
  assert.match(contentEvent.detail.text, /Prime line/);
});

test("Prime ignores playback-shaped responses from unrelated requests and rejects untrusted track URLs", async () => {
  const unrelatedUrl = "https://www.amazon.co.uk/api/recommendations";
  const spoofedPlaybackUrl = "https://attacker.example/GetVodPlaybackResources?asin=B0GWM2TV7P";
  const harness = createHarness(new Map([
    [unrelatedUrl, JSON.stringify({
      id: "B0GWM2TV7P",
      timedTextUrls: { result: { subtitleUrls: [{ languageCode: "en", url: "https://untrusted.example/en.xml" }] } }
    })],
    [spoofedPlaybackUrl, JSON.stringify({
      id: "B0GWM2TV7P",
      timedTextUrls: { result: { subtitleUrls: [{ languageCode: "en", url: "https://cf-timedtext.aux.pv-cdn.net/en.xml" }] } }
    })]
  ]));
  vm.runInContext(bridgeSource, harness.context);

  await vm.runInContext(`fetch(${JSON.stringify(unrelatedUrl)})`, harness.context);
  await vm.runInContext(`fetch(${JSON.stringify(spoofedPlaybackUrl)})`, harness.context);
  vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify({
    id: "B0GWM2TV7P",
    timedTextUrls: { result: { subtitleUrls: [{ languageCode: "en", url: "https://untrusted.example/en.xml" }] } }
  }))})`, harness.context);
  await settlePromises();

  assert.equal(harness.events.some((event) => event.type === "subtle:prime-tracks"), false);
});

function createHarness(responses) {
  const events = [];
  const fetches = [];
  const listeners = new Map();
  class FakeCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  class FakeXmlHttpRequest {
    addEventListener() {}
    open() {}
    send() {}
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
  const responseFor = (url) => {
    const text = responses.get(String(url));
    const response = {
      ok: typeof text === "string",
      status: typeof text === "string" ? 200 : 404,
      text: async () => text || ""
    };
    response.clone = () => responseFor(url);
    return response;
  };
  const context = vm.createContext({
    URL,
    Map,
    Set,
    Reflect,
    AbortController,
    CustomEvent: FakeCustomEvent,
    XMLHttpRequest: FakeXmlHttpRequest,
    document,
    location: {
      href: "https://www.amazon.co.uk/gp/video/detail/B0GWM2TV7P",
      pathname: "/gp/video/detail/B0GWM2TV7P"
    },
    fetch: async (url) => {
      fetches.push(String(url));
      return responseFor(url);
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
