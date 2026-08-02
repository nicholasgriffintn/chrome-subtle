const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SubtleCues = require("../lib/cues.js");
const SubtleState = require("../lib/state.js");
const SubtleTranscript = require("../lib/transcript.js");

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

test("the Learn panel receives a bounded transcript tied to the current content", async () => {
  const harness = createHarness({ playingWithCues: true });
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();

  const response = await harness.sendRuntimeMessage({ type: "GET_SUBTLE_TRANSCRIPT" });

  assert.equal(response.ok, true);
  assert.equal(response.contentKey, "video-1");
  assert.equal(response.playbackTime, 1.5);
  assert.equal(response.aiTranslationActive, false);
  assert.equal(response.coverage, "loaded_track");
  assert.equal(response.identity.platformId, "youtube");
  assert.equal(response.identity.contentKey, "video-1");
  assert.match(response.identity.transcriptFingerprint, /^v1-/);
  assert.deepEqual(JSON.parse(JSON.stringify(response.snapshot.cues)), [
    { start: 1, end: 3, text: "Visible caption" }
  ]);
});

test("stale-result checks use a lightweight playback context instead of resending captions", async () => {
  const harness = createHarness({ playingWithCues: true });
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();

  const response = await harness.sendRuntimeMessage({ type: "GET_SUBTLE_LEARN_CONTEXT" });

  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    ok: true,
    contentKey: "video-1",
    platformId: "youtube",
    identity: SubtleTranscript.identityFor({
      contentKey: "video-1",
      platformId: "youtube",
      languageCode: "und",
      cues: [{ start: 1, end: 3, text: "Visible caption" }]
    }),
    playbackTime: 1.5,
    cueCount: 1,
    aiTranslationActive: false
  });
  assert.equal("snapshot" in response, false);
});

test("translated captions apply only to the content they were generated from", async () => {
  const harness = createHarness({ playingWithCues: true });
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();
  const source = await harness.sendRuntimeMessage({ type: "GET_SUBTLE_TRANSCRIPT" });

  const stale = await harness.sendRuntimeMessage({
    type: "APPLY_SUBTLE_AI_TRANSLATION",
    sourceIdentity: { ...source.identity, transcriptFingerprint: "v1-stale-track" },
    snapshot: {
      contentKey: "video-1",
      platformId: "youtube",
      languageCode: "es",
      cues: [{ start: 1, end: 3, text: "Texto obsoleto" }]
    }
  });
  const applied = await harness.sendRuntimeMessage({
    type: "APPLY_SUBTLE_AI_TRANSLATION",
    sourceIdentity: source.identity,
    snapshot: {
      contentKey: "video-1",
      platformId: "youtube",
      languageCode: "es",
      cues: [{ start: 1, end: 3, text: "Texto traducido" }]
    }
  });

  assert.equal(stale.ok, false);
  assert.equal(applied.ok, true);
  assert.equal(harness.lastOverlayText(), "Texto traducido");
});

test("Learn timestamps seek only within the current content", async () => {
  const harness = createHarness({ playingWithCues: true });
  vm.runInContext(runtimeSource, harness.context);
  harness.context.SubtleRuntime.start();
  await settlePromises();
  const source = await harness.sendRuntimeMessage({ type: "GET_SUBTLE_TRANSCRIPT" });

  const response = await harness.sendRuntimeMessage({
    type: "SEEK_SUBTLE_VIDEO",
    sourceIdentity: source.identity,
    seconds: 42.25
  });

  assert.equal(response.ok, true);
  assert.equal(harness.video.currentTime, 42.25);
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
  let runtimeMessageListener;
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
    SubtleTranscript,
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
      runtime: {
        id: "runtime",
        onMessage: {
          addListener(listener) { runtimeMessageListener = listener; },
          removeListener() {}
        }
      }
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
    lastOverlayText: () => lastOverlayText,
    runFrame(timestamp) {
      now = timestamp;
      const callback = animationFrames.shift();
      assert.ok(callback, "expected a scheduled animation frame");
      callback(timestamp);
    },
    async sendRuntimeMessage(message) {
      return new Promise((resolve, reject) => {
        const returned = runtimeMessageListener?.(message, {}, resolve);
        if (returned !== true) setImmediate(() => reject(new Error("Runtime did not accept the asynchronous message.")));
      });
    }
  };
}

async function settlePromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
