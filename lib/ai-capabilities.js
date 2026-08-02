(function exposeSubtleAiCapabilities(root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("./ai-languages.js") : root.SubtleAiLanguages
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleAiCapabilities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleAiCapabilities(SubtleAiLanguages) {
  "use strict";

  const AVAILABILITY_STATES = new Set(["available", "downloadable", "downloading", "unavailable"]);

  function create(environment = globalThis) {
    async function inspect(options = {}) {
      const translatorOptions = optionalLanguagePair(options.sourceLanguage, options.targetLanguage);
      const summaryOptions = optionalSummarySettings(options.sourceLanguage, options.summaryOutputLanguage, {
        length: options.summaryLength || "medium",
        preference: options.summaryPreference || "auto"
      });
      const languageModelOptions = optionalPromptSettings(options.sourceLanguage);
      const [translator, languageDetector, summarizer, languageModel] = await Promise.all([
        translatorOptions ? availability(environment.Translator, translatorOptions) : languageUnsupported(),
        availability(environment.LanguageDetector),
        summaryOptions ? availability(environment.Summarizer, summaryOptions) : languageUnsupported(),
        languageModelOptions ? availability(environment.LanguageModel, languageModelOptions) : languageUnsupported()
      ]);
      return { translator, languageDetector, summarizer, languageModel };
    }

    function createTranslator(options = {}) {
      return createSession(environment.Translator, languagePair(options.sourceLanguage, options.targetLanguage), options);
    }

    function createLanguageDetector(options = {}) {
      return createSession(environment.LanguageDetector, {}, options);
    }

    function createSummarizer(options = {}) {
      const settings = summarySettings(options.sourceLanguage, options.outputLanguage, {
        type: options.type || "key-points",
        format: options.format || "plain-text",
        length: options.length || "medium",
        preference: options.preference || "auto"
      });
      if (options.sharedContext) settings.sharedContext = String(options.sharedContext).slice(0, 2_000);
      return createSession(environment.Summarizer, settings, options);
    }

    function createLanguageModel(options = {}) {
      const settings = promptSettings(options.sourceLanguage);
      if (Array.isArray(options.initialPrompts)) settings.initialPrompts = options.initialPrompts;
      return createSession(environment.LanguageModel, settings, options);
    }

    return { inspect, createTranslator, createLanguageDetector, createSummarizer, createLanguageModel };
  }

  async function availability(api, options) {
    if (!api || typeof api.availability !== "function") return { state: "unsupported" };
    try {
      const state = await api.availability(options);
      return { state: AVAILABILITY_STATES.has(state) ? state : "unavailable" };
    } catch (_error) {
      return { state: "unavailable" };
    }
  }

  async function createSession(api, settings, options) {
    if (!api || typeof api.create !== "function") throw capabilityError("unsupported", "This on-device AI feature is not supported by this Chrome installation.");
    if (options.signal?.aborted) throw abortError();
    const createOptions = { ...settings };
    if (options.signal) createOptions.signal = options.signal;
    if (typeof options.onProgress === "function") {
      createOptions.monitor = (monitor) => {
        monitor.addEventListener("downloadprogress", (event) => {
          options.onProgress(normaliseProgress(event.loaded, event.total));
        });
      };
    }
    try {
      return await api.create(createOptions);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw capabilityError("creation_failed", error instanceof Error ? error.message : "Chrome could not prepare its on-device model.");
    }
  }

  function languagePair(sourceLanguage, targetLanguage) {
    const source = SubtleAiLanguages.translatorLanguage(sourceLanguage);
    const target = SubtleAiLanguages.translatorLanguage(targetLanguage);
    if (!source || !target) {
      throw capabilityError("language_unsupported", "Chrome does not support that translation language.");
    }
    if (source === target) throw capabilityError("same_language", "Choose a different translation language.");
    return { sourceLanguage: source, targetLanguage: target };
  }

  function promptSettings(sourceLanguage) {
    const source = SubtleAiLanguages.foundationLanguage(sourceLanguage);
    if (!source) throw capabilityError("language_unsupported", "Chrome's local language model does not support this caption language.");
    const inputLanguages = Array.from(new Set(["en", source].filter(Boolean)));
    return {
      expectedInputs: [{ type: "text", languages: inputLanguages }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]
    };
  }

  function summarySettings(sourceLanguage, outputLanguage, settings = {}) {
    const source = SubtleAiLanguages.foundationLanguage(sourceLanguage);
    const output = SubtleAiLanguages.foundationLanguage(outputLanguage || "en");
    if (!source || !output) {
      throw capabilityError("language_unsupported", "Chrome's local summariser does not support this language.");
    }
    return {
      ...settings,
      expectedInputLanguages: [source],
      outputLanguage: output,
      expectedContextLanguages: ["en"]
    };
  }

  function optionalLanguagePair(sourceLanguage, targetLanguage) {
    try {
      return languagePair(sourceLanguage, targetLanguage);
    } catch (_error) {
      return null;
    }
  }

  function optionalSummarySettings(sourceLanguage, outputLanguage, options = {}) {
    try {
      return summarySettings(sourceLanguage, outputLanguage, {
        type: "key-points",
        format: "plain-text",
        length: options.length || "medium",
        preference: options.preference || "auto"
      });
    } catch (_error) {
      return null;
    }
  }

  function optionalPromptSettings(sourceLanguage) {
    try {
      return promptSettings(sourceLanguage);
    } catch (_error) {
      return null;
    }
  }

  function languageUnsupported() {
    return Promise.resolve({ state: "language_unsupported" });
  }

  function normaliseProgress(loaded, total) {
    const loadedNumber = Number(loaded);
    const totalNumber = Number(total);
    if (!Number.isFinite(loadedNumber) || loadedNumber < 0) return 0;
    if (!Number.isFinite(totalNumber) || totalNumber <= 0) return Math.min(1, loadedNumber);
    return Math.min(1, loadedNumber / totalNumber);
  }

  function capabilityError(code, message) {
    const error = new Error(message);
    error.name = "SubtleAiError";
    error.code = code;
    return error;
  }

  function abortError() {
    const error = new Error("The on-device AI request was cancelled.");
    error.name = "AbortError";
    return error;
  }

  return { create, capabilityError };
});
