const test = require("node:test");
const assert = require("node:assert/strict");

const LearnController = require("../lib/learn-controller.js");
const Transcript = require("../lib/transcript.js");

test("same-tab navigation cancels an in-flight local AI operation", async () => {
  const elements = new Map([
    "refresh-context",
    "target-language",
    "summary-length",
    "summary-language",
    "translate-button",
    "download-translation",
    "clear-translation",
    "explain-button",
    "download-explanation",
    "summary-button",
    "download-summary",
    "caption-question",
    "ask-button",
    "download-answer",
    "cancel-operation",
    "summary-result",
    "answer-result"
  ].map((id) => [id, createElement()]));
  elements.get("target-language").value = "es";
  elements.get("summary-length").value = "medium";
  elements.get("summary-language").value = "en";
  let handleTabUpdate;
  let operationSignal;
  const source = {
    contentKey: "video-1",
    platformId: "youtube",
    languageCode: "en",
    cues: [{ start: 0, end: 2, text: "Hello" }]
  };
  const response = {
    ok: true,
    contentKey: source.contentKey,
    identity: { ...Transcript.identityFor(source), tabId: 7 },
    snapshot: source
  };
  const view = {
    renderContext() {},
    renderCapabilities() {},
    showError() {},
    showTranslation() {},
    showExplanation() {},
    showSummary() {},
    showAnswer() {},
    setBusy() {},
    setProgress() {},
    clearBusy() {}
  };
  const environment = {
    document: {
      visibilityState: "visible",
      querySelector(selector) { return elements.get(selector.slice(1)); },
      addEventListener() {}
    },
    navigator: { userActivation: { isActive: true } },
    chrome: {
      tabs: {
        onActivated: { addListener() {} },
        onUpdated: { addListener(listener) { handleTabUpdate = listener; } }
      }
    },
    addEventListener() {},
    SubtleTranscript: Transcript,
    SubtleAiLanguages: require("../lib/ai-languages.js"),
    SubtleLearnExport: { create: () => ({}) },
    SubtleLearnView: { create: () => ({ ...view, renderTranslationLanguages() {}, clearResults() {}, setQuestion() {} }) },
    SubtleLearnTabClient: {
      create: () => ({
        async getTranscript() { return response; },
        async getContext() { return { ...response, playbackTime: 1 }; }
      })
    },
    SubtleAiCapabilities: {
      create: () => ({
        async inspect() {
          return {
            translator: { state: "available" },
            languageModel: { state: "available" },
            summarizer: { state: "available" }
          };
        }
      })
    },
    SubtleAiLearning: {
      create: () => ({
        async summarize(_snapshot, options) {
          operationSignal = options.signal;
          await new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              const error = new Error("cancelled");
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          });
        }
      })
    }
  };
  const controller = LearnController.create(environment);
  await controller.start();

  const operation = elements.get("summary-button").dispatch("click");
  await Promise.resolve();
  handleTabUpdate(7, { status: "loading" });

  assert.equal(operationSignal.aborted, true);
  await operation;
});

function createElement() {
  const listeners = new Map();
  return {
    value: "",
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type, event = { target: {} }) { return listeners.get(type)?.(event); }
  };
}
