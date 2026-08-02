(function exposeSubtleLearnController(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleLearnController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleLearnController(root) {
  "use strict";

  function create(environment = root) {
    const documentRef = environment.document;
    const elements = {
      refresh: documentRef.querySelector("#refresh-context"),
      targetLanguage: documentRef.querySelector("#target-language"),
      summaryLength: documentRef.querySelector("#summary-length"),
      summaryLanguage: documentRef.querySelector("#summary-language"),
      translate: documentRef.querySelector("#translate-button"),
      downloadTranslation: documentRef.querySelector("#download-translation"),
      clearTranslation: documentRef.querySelector("#clear-translation"),
      explain: documentRef.querySelector("#explain-button"),
      downloadExplanation: documentRef.querySelector("#download-explanation"),
      summarize: documentRef.querySelector("#summary-button"),
      downloadSummary: documentRef.querySelector("#download-summary"),
      question: documentRef.querySelector("#caption-question"),
      ask: documentRef.querySelector("#ask-button"),
      downloadAnswer: documentRef.querySelector("#download-answer"),
      cancel: documentRef.querySelector("#cancel-operation"),
      summaryResult: documentRef.querySelector("#summary-result"),
      answerResult: documentRef.querySelector("#answer-result")
    };
    const view = environment.SubtleLearnView.create(documentRef);
    const tabClient = environment.SubtleLearnTabClient.create(environment.chrome);
    const ai = environment.SubtleAiCapabilities.create(environment);
    const learning = environment.SubtleAiLearning.create({
      ai,
      transcript: environment.SubtleTranscript,
      userActivation: () => environment.navigator?.userActivation?.isActive !== false
    });
    const resultExport = environment.SubtleLearnExport.create(environment);
    let context = null;
    let operationController = null;
    let refreshGeneration = 0;
    let watchedTabId = null;
    let lastTranslation = null;
    let lastExplanation = null;
    let lastSummary = null;
    let lastAnswer = null;

    async function start() {
      view.renderTranslationLanguages(
        environment.SubtleAiLanguages.allTranslatorLanguages(),
        elements.targetLanguage.value || "es"
      );
      bindEvents();
      await refresh();
    }

    function bindEvents() {
      elements.refresh.addEventListener("click", refresh);
      elements.targetLanguage.addEventListener("change", () => inspectCapabilities());
      elements.summaryLength.addEventListener("change", () => inspectCapabilities());
      elements.summaryLanguage.addEventListener("change", () => inspectCapabilities());
      elements.translate.addEventListener("click", translate);
      elements.downloadTranslation.addEventListener("click", downloadTranslation);
      elements.clearTranslation.addEventListener("click", clearTranslation);
      elements.explain.addEventListener("click", explain);
      elements.downloadExplanation.addEventListener("click", downloadExplanation);
      elements.summarize.addEventListener("click", summarize);
      elements.downloadSummary.addEventListener("click", downloadSummary);
      elements.ask.addEventListener("click", answerQuestion);
      elements.question.addEventListener("input", () => view.setQuestion(elements.question.value));
      elements.question.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey) || elements.ask.disabled) return;
        event.preventDefault();
        answerQuestion();
      });
      elements.downloadAnswer.addEventListener("click", downloadAnswer);
      elements.cancel.addEventListener("click", cancelOperation);
      elements.summaryResult.addEventListener("click", seekToTimestamp);
      elements.answerResult.addEventListener("click", seekToTimestamp);
      environment.chrome.tabs.onActivated?.addListener(handleTabChange);
      environment.chrome.tabs.onUpdated?.addListener(handleTabUpdate);
      environment.addEventListener("pagehide", cancelOperation, { once: true });
      documentRef.addEventListener("visibilitychange", () => {
        if (documentRef.visibilityState === "visible" && !operationController) refresh();
      });
    }

    async function refresh() {
      cancelOperation();
      const generation = ++refreshGeneration;
      watchedTabId = null;
      try {
        const previousIdentity = context?.identity;
        const fresh = await tabClient.getTranscript();
        if (generation !== refreshGeneration) return;
        if (!sameIdentity(previousIdentity, fresh.identity)) clearWorkspace();
        else if (lastTranslation && !fresh.aiTranslationActive) {
          lastTranslation = null;
          view.showTranslation(null);
        }
        context = fresh;
        watchedTabId = fresh.identity?.tabId ?? null;
        view.renderContext(fresh);
        await inspectCapabilities(generation);
      } catch (error) {
        if (generation !== refreshGeneration) return;
        context = null;
        clearWorkspace();
        view.renderContext({ ok: false, coverage: "unavailable", error: error.message });
        view.renderCapabilities({}, false);
        view.showError(error.message);
      }
    }

    async function inspectCapabilities(expectedGeneration = refreshGeneration) {
      const inspectedContext = context;
      try {
        const sourceLanguage = context?.snapshot?.languageCode === "und" ? "en" : context?.snapshot?.languageCode || "en";
        const capabilities = await ai.inspect({
          sourceLanguage,
          targetLanguage: elements.targetLanguage.value || "es",
          summaryOutputLanguage: summaryOutputLanguage(sourceLanguage),
          summaryLength: elements.summaryLength.value || "medium"
        });
        if (context?.snapshot?.languageCode === "und" && !isUsable(capabilities.languageDetector?.state)) {
          const unavailable = {
            state: capabilities.languageDetector?.state || "unsupported",
            label: "Language detection unavailable"
          };
          capabilities.translator = unavailable;
          capabilities.summarizer = unavailable;
          capabilities.languageModel = unavailable;
        }
        if (
          environment.SubtleAiLanguages.translatorLanguage(sourceLanguage)
          === environment.SubtleAiLanguages.translatorLanguage(elements.targetLanguage.value)
        ) {
          capabilities.translator = { state: "unavailable", label: "Choose a different language" };
        }
        if (expectedGeneration !== refreshGeneration || context !== inspectedContext) return;
        view.renderCapabilities(capabilities, Boolean(context?.ok && context.snapshot?.cues?.length));
      } catch (error) {
        if (expectedGeneration !== refreshGeneration || context !== inspectedContext) return;
        view.showError(error.message);
      }
    }

    function translate() {
      return runOperation("Preparing private translation…", async (signal, onProgress) => {
        const fresh = cachedTranscript();
        const translated = await learning.translate(fresh.snapshot, elements.targetLanguage.value, { signal, onProgress });
        throwIfAborted(signal);
        await tabClient.applyTranslation(translated, fresh.identity);
        throwIfAborted(signal);
        context = { ...fresh, aiTranslationActive: true };
        lastTranslation = translated;
        view.showTranslation(translated);
      });
    }

    function clearTranslation() {
      return runOperation("Removing translated captions…", async () => {
        const fresh = await requireTranscript();
        const response = await tabClient.clearTranslation(fresh.identity);
        if (!response?.ok) throw new Error(response?.error || "Translated captions could not be cleared.");
        context = { ...fresh, aiTranslationActive: false };
        lastTranslation = null;
        view.showTranslation(null);
      });
    }

    function explain() {
      return runOperation("Explaining the current caption…", async (signal, onProgress) => {
        let fresh = cachedTranscript();
        const position = await tabClient.getContext();
        if (!sameIdentity(position.identity, fresh.identity)) fresh = await requireTranscript();
        else fresh = { ...fresh, playbackTime: position.playbackTime };
        const result = await learning.explain(fresh.snapshot, fresh.playbackTime, { signal, onProgress });
        throwIfAborted(signal);
        await assertIdentity(fresh.identity);
        throwIfAborted(signal);
        lastExplanation = result;
        view.showExplanation(result);
      });
    }

    function summarize() {
      return runOperation("Summarising the loaded caption track…", async (signal, onProgress) => {
        const fresh = cachedTranscript();
        const result = await learning.summarize(fresh.snapshot, {
          signal,
          onProgress,
          length: elements.summaryLength.value || "medium",
          outputLanguage: elements.summaryLanguage.value || "en"
        });
        throwIfAborted(signal);
        await assertIdentity(fresh.identity);
        throwIfAborted(signal);
        lastSummary = result;
        view.showSummary(result);
      });
    }

    function answerQuestion() {
      return runOperation("Finding an answer in the loaded captions…", async (signal, onProgress) => {
        const fresh = cachedTranscript();
        const result = await learning.answer(fresh.snapshot, elements.question.value, { signal, onProgress });
        throwIfAborted(signal);
        await assertIdentity(fresh.identity);
        throwIfAborted(signal);
        lastAnswer = result;
        view.showAnswer(result);
      });
    }

    async function seekToTimestamp(event) {
      const button = event.target.closest?.(".timestamp-button");
      if (!button || !context?.identity) return;
      try {
        await tabClient.seek(Number(button.dataset.seconds), context.identity);
      } catch (error) {
        view.showError(error.message);
      }
    }

    async function requireTranscript() {
      const fresh = await tabClient.getTranscript();
      if (!fresh?.ok || !fresh.snapshot?.cues?.length) throw new Error(fresh?.error || "No timed caption track is loaded.");
      context = fresh;
      view.renderContext(fresh);
      return fresh;
    }

    function cachedTranscript() {
      if (!context?.ok || !context.snapshot?.cues?.length) throw new Error(context?.error || "No timed caption track is loaded.");
      return context;
    }

    async function assertIdentity(expectedIdentity) {
      const current = await tabClient.getContext();
      if (!sameIdentity(current?.identity, expectedIdentity)) {
        const error = new Error("The active video changed before the result was ready.");
        error.code = "stale_content";
        throw error;
      }
      context = { ...context, ...current };
    }

    async function runOperation(label, action) {
      cancelOperation();
      operationController = new AbortController();
      const controller = operationController;
      view.setBusy(label, 0);
      let failed = false;
      try {
        await action(controller.signal, ({ phase, value }) => {
          view.setProgress(value, phase === "download" ? "Downloading Chrome's on-device model…" : label);
        });
      } catch (error) {
        if (error?.name !== "AbortError") {
          failed = true;
          view.showError(error.message || "The on-device AI request failed.");
        }
      } finally {
        if (operationController === controller) {
          operationController = null;
          if (!failed) view.clearBusy();
        }
      }
    }

    function cancelOperation() {
      operationController?.abort();
      operationController = null;
      view.clearBusy();
    }

    function handleTabChange() {
      refresh();
    }

    function handleTabUpdate(tabId, changeInfo) {
      if (tabId !== watchedTabId) return;
      if (changeInfo?.url || changeInfo?.status === "loading") {
        cancelOperation();
        context = null;
        clearWorkspace();
        refreshGeneration += 1;
      }
      if (changeInfo?.status === "complete") refresh();
    }

    function sameIdentity(left, right) {
      return left?.tabId === right?.tabId && environment.SubtleTranscript.sameIdentity(left, right);
    }

    function isUsable(state) {
      return state === "available" || state === "downloadable" || state === "downloading";
    }

    function summaryOutputLanguage(sourceLanguage) {
      return elements.summaryLanguage.value === "source" ? sourceLanguage : elements.summaryLanguage.value || "en";
    }

    function clearWorkspace() {
      lastTranslation = null;
      lastExplanation = null;
      lastSummary = null;
      lastAnswer = null;
      view.clearResults();
    }

    function downloadTranslation() {
      downloadResult(() => lastTranslation && resultExport.downloadTranslation(lastTranslation));
    }

    function downloadExplanation() {
      downloadResult(() => lastExplanation && resultExport.downloadExplanation(lastExplanation));
    }

    function downloadSummary() {
      downloadResult(() => lastSummary && resultExport.downloadSummary(lastSummary));
    }

    function downloadAnswer() {
      downloadResult(() => lastAnswer && resultExport.downloadAnswer(lastAnswer));
    }

    function downloadResult(action) {
      try {
        action();
      } catch (error) {
        view.showError(error.message || "That Learn result could not be downloaded.");
      }
    }

    return { start, refresh, cancelOperation };
  }

  async function start() {
    const controller = create(root);
    await controller.start();
    return controller;
  }

  function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    const error = new Error("The on-device AI request was cancelled.");
    error.name = "AbortError";
    throw error;
  }

  return { create, start };
});
