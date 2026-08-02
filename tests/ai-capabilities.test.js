const test = require("node:test");
const assert = require("node:assert/strict");

const AiCapabilities = require("../lib/ai-capabilities.js");

test("AI capability inspection distinguishes ready, downloadable and unsupported features", async () => {
  let promptAvailabilityOptions;
  let summaryAvailabilityOptions;
  const gateway = AiCapabilities.create({
    Translator: { availability: async () => "available" },
    LanguageDetector: { availability: async () => "downloadable" },
    Summarizer: {
      async availability(options) {
        summaryAvailabilityOptions = options;
        return "unavailable";
      }
    },
    LanguageModel: {
      async availability(options) {
        promptAvailabilityOptions = options;
        return "available";
      }
    }
  });

  assert.deepEqual(await gateway.inspect({ sourceLanguage: "ja", targetLanguage: "es" }), {
    translator: { state: "available" },
    languageDetector: { state: "downloadable" },
    summarizer: { state: "unavailable" },
    languageModel: { state: "available" }
  });
  assert.deepEqual(promptAvailabilityOptions, {
    expectedInputs: [{ type: "text", languages: ["en", "ja"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }]
  });
  assert.deepEqual(summaryAvailabilityOptions, {
    type: "key-points",
    format: "plain-text",
    length: "medium",
    preference: "auto",
    expectedInputLanguages: ["ja"],
    outputLanguage: "en",
    expectedContextLanguages: ["en"]
  });
});

test("unsupported foundation languages are rejected before model availability checks", async () => {
  let summarizerChecks = 0;
  let promptChecks = 0;
  const gateway = AiCapabilities.create({
    Translator: { availability: async () => "available" },
    LanguageDetector: { availability: async () => "available" },
    Summarizer: { async availability() { summarizerChecks += 1; return "available"; } },
    LanguageModel: { async availability() { promptChecks += 1; return "available"; } }
  });

  const capabilities = await gateway.inspect({ sourceLanguage: "it", targetLanguage: "es" });

  assert.equal(capabilities.translator.state, "available");
  assert.equal(capabilities.summarizer.state, "language_unsupported");
  assert.equal(capabilities.languageModel.state, "language_unsupported");
  assert.equal(summarizerChecks, 0);
  assert.equal(promptChecks, 0);
});

test("model downloads report bounded progress through the capability gateway", async () => {
  const progress = [];
  const controller = new AbortController();
  const gateway = AiCapabilities.create({
    Translator: {
      async create(options) {
        assert.equal(options.signal, controller.signal);
        const monitor = {
          addEventListener(type, listener) {
            assert.equal(type, "downloadprogress");
            listener({ loaded: 25, total: 100 });
            listener({ loaded: 150, total: 100 });
          }
        };
        options.monitor(monitor);
        return { destroy() {} };
      }
    }
  });

  await gateway.createTranslator({
    sourceLanguage: "en",
    targetLanguage: "es",
    signal: controller.signal,
    onProgress: (value) => progress.push(value)
  });

  assert.deepEqual(progress, [0.25, 1]);
});

test("an already-cancelled request never starts a model download", async () => {
  let createCalls = 0;
  const controller = new AbortController();
  controller.abort();
  const gateway = AiCapabilities.create({
    Translator: {
      async create() {
        createCalls += 1;
        return {};
      }
    }
  });

  await assert.rejects(
    () => gateway.createTranslator({ sourceLanguage: "en", targetLanguage: "es", signal: controller.signal }),
    { name: "AbortError" }
  );
  assert.equal(createCalls, 0);
});
