const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SubtleCues = require("../lib/cues.js");
const SubtleState = require("../lib/state.js");

const runtimeSource = fs.readFileSync(path.resolve(__dirname, "../lib/runtime.js"), "utf8");

test("unrelated page mutations do not rescan video descendants while playback targets are connected", async () => {
  const harness = createHarness();
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();

  harness.observer.callback([{ target: {}, addedNodes: [{}], removedNodes: [] }]);

  assert.equal(harness.videoMutationChecks(), 0);
  assert.equal(harness.timers.length, 0);
});

test("a disconnected playback target still schedules a bounded refresh", async () => {
  const harness = createHarness();
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();
  harness.player.isConnected = false;

  harness.observer.callback([{ target: {}, addedNodes: [], removedNodes: [] }]);

  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 250);
  assert.equal(harness.videoMutationChecks(), 0);
});

test("the playback loop limits cue work and fallback layout reads", async () => {
  const harness = createHarness({ playingWithCues: true });
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();
  const initialRenders = harness.overlayRenders();
  const initialMeasurements = harness.layoutMeasurements();

  for (let frame = 0; frame < 60; frame += 1) harness.runFrame(frame * (1000 / 60));

  assert.ok(harness.overlayRenders() - initialRenders <= 32);
  assert.ok(harness.layoutMeasurements() - initialMeasurements <= 4);
});

test("the runtime observes and styles discovered player shadow roots", async () => {
  const shadowRoot = {};
  const harness = createHarness({ shadowRoot });
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();

  assert.ok(harness.observedTargets.includes(shadowRoot));
  assert.ok(harness.styledRootGroups.some((roots) => roots.includes(shadowRoot)));
});

test("YouTube caption mutations reclassify invisible layout segments", async () => {
  const harness = createHarness({ captionMutation: true });
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();
  const initialSyncs = harness.layoutSegmentSyncs();

  harness.observer.callback([{ target: {}, addedNodes: [{}], removedNodes: [] }]);

  assert.equal(harness.layoutSegmentSyncs(), initialSyncs + 1);
});

function createHarness(options = {}) {
  const listeners = new Map();
  const timers = [];
  const animationFrames = [];
  const observedTargets = [];
  const styledRootGroups = [];
  let videoMutationChecks = 0;
  let layoutMeasurements = 0;
  let overlayRenders = 0;
  let layoutSegmentSyncs = 0;
  let lastOverlayText;
  let now = 0;
  const player = { isConnected: true };
  const video = {
    isConnected: true,
    paused: !options.playingWithCues,
    ended: false,
    currentTime: 1.5,
    addEventListener() {},
    removeEventListener() {}
  };
  const documentElement = {
    dataset: {},
    style: { setProperty() {} },
    toggleAttribute() {}
  };
  const document = {
    documentElement,
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const observer = { callback: null };
  class FakeMutationObserver {
    constructor(callback) { observer.callback = callback; }
    observe(target) { observedTargets.push(target); }
    disconnect() {}
  }
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }
  const provider = {
    trackEvent: "subtle:test-tracks",
    sourceLabel: "YouTube captions",
    languageMode: "track",
    contentKey: () => "video-1",
    selectTrack: () => null,
    availableLanguages: () => []
  };
  const storedState = SubtleState.normaliseState(options.playingWithCues ? {
    mode: "dual",
    secondarySource: "upload",
    uploadedTrack: {
      name: "captions.srt",
      text: "00:00:01,000 --> 00:00:03,000\nVisible caption"
    }
  } : {});
  const context = vm.createContext({
    AbortController,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    MutationObserver: FakeMutationObserver,
    ResizeObserver: FakeResizeObserver,
    SubtleState,
    SubtleCues,
    SubtleNativeCaptionFilters: { create: () => ({ apply() {}, clear() {} }) },
    SubtleNativeCaptionStyles: {
      apply(_platformId, roots) { styledRootGroups.push(roots); },
      syncYouTubeSegments() { layoutSegmentSyncs += 1; },
      clear() {}
    },
    SubtitleAdapters: {
      forHostname: () => ({ id: "youtube", label: "YouTube" }),
      findVideo: () => video,
      findPlayer: () => player,
      mutationsContainVideo() { videoMutationChecks += 1; return false; },
      mutationsContainNativeCaptions: () => Boolean(options.captionMutation),
      nativeCaptionElements: () => [],
      measureNativeCaption() {
        layoutMeasurements += 1;
        return { rect: { left: 10, top: 10, right: 100, bottom: 40, width: 90, height: 30 }, alignment: "center" };
      },
      captionRoots: () => [document, ...(options.shadowRoot ? [options.shadowRoot] : [])],
      hasNativeCaptions: () => false
    },
    SubtlePlatformCaptions: {
      forPlatform: () => provider,
      requestTracks() {}
    },
    SubtleOverlay: {
      typography: (state) => state,
      edgeTreatment: () => ({ stroke: "none", shadow: "none" }),
      hexToRgba: () => "rgba(0, 0, 0, 0)",
      fontStack: () => "sans-serif",
      fontVariant: () => "normal",
      create: () => ({}),
      render(_host, cue) {
        overlayRenders += 1;
        const changed = cue?.text !== lastOverlayText;
        lastOverlayText = cue?.text;
        return changed;
      },
      positionNearNative() {},
      captionGap: () => 8,
      nativeCaptionLineHeight: () => 60,
      remove() {}
    },
    SubtleRuntimeContext: {
      hasContext: () => true,
      isInvalidated: () => false,
      sendMessageSafely: async () => true
    },
    chrome: {
      storage: {
        local: { async get() { return { [SubtleState.STORAGE_KEY]: storedState }; } },
        onChanged: { addListener() {}, removeListener() {} }
      },
      runtime: { id: "runtime", onMessage: { addListener() {}, removeListener() {} } }
    },
    document,
    window: { addEventListener() {} },
    location: { hostname: "www.youtube.com", pathname: "/watch", href: "https://www.youtube.com/watch?v=video-1" },
    navigator: { language: "en" },
    performance: { now: () => now },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    requestAnimationFrame(callback) { animationFrames.push(callback); return animationFrames.length; },
    cancelAnimationFrame() {}
  });
  context.globalThis = context;
  return {
    context,
    observer,
    player,
    video,
    timers,
    observedTargets,
    styledRootGroups,
    videoMutationChecks: () => videoMutationChecks,
    layoutMeasurements: () => layoutMeasurements,
    overlayRenders: () => overlayRenders,
    layoutSegmentSyncs: () => layoutSegmentSyncs,
    runFrame(timestamp) {
      now = timestamp;
      const callback = animationFrames.shift();
      assert.ok(callback, "expected a scheduled animation frame");
      callback(timestamp);
    }
  };
}

async function settlePromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
