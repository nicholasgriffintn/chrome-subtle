(function exposeSubtleLearnView(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleLearnView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleLearnView(root) {
  "use strict";

  const CAPABILITY_LABELS = Object.freeze({
    available: "Ready",
    downloadable: "Model download required",
    downloading: "Downloading model",
    unsupported: "Not supported in this Chrome",
    language_unsupported: "Language not supported",
    unavailable: "Currently unavailable",
    checking: "Checking…"
  });
  const USABLE_CAPABILITY_STATES = new Set(["available", "downloadable", "downloading"]);
  const PLATFORM_LABELS = Object.freeze({
    youtube: "YouTube",
    netflix: "Netflix",
    bbc: "BBC iPlayer",
    disney: "Disney+",
    prime: "Prime Video"
  });

  function create(documentRef) {
    if (!documentRef?.getElementById || !documentRef?.createElement) {
      throw new TypeError("A document is required to create the Learn view.");
    }

    const elements = collectElements(documentRef, [
      "context-platform",
      "context-detail",
      "context-status",
      "capability-translator",
      "capability-explainer",
      "capability-summarizer",
      "target-language",
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
      "operation-region",
      "operation-label",
      "operation-progress",
      "translation-result",
      "explanation-result",
      "summary-result",
      "answer-result"
    ]);
    const contextPanel = documentRef.querySelector?.(".context-panel");
    const bbcNote = documentRef.getElementById("bbc-note");
    let answerCapabilityUsable = false;
    let transcriptAvailable = false;

    function renderTranslationLanguages(languages, selectedLanguage = "es") {
      const options = (Array.isArray(languages) ? languages : []).flatMap((language) => {
        const code = String(language?.code || "");
        const label = boundedText(language?.label, 80);
        if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(code) || !label) return [];
        const option = createElement(documentRef, "option");
        option.value = code;
        option.textContent = label;
        return [option];
      });
      elements["target-language"].replaceChildren(...options);
      const requested = String(selectedLanguage || "es");
      elements["target-language"].value = options.some((option) => option.value === requested)
        ? requested
        : options[0]?.value || "";
    }

    function renderContext(response) {
      const value = response && typeof response === "object" ? response : {};
      const snapshot = value.snapshot && typeof value.snapshot === "object" ? value.snapshot : {};
      const platformId = safeIdentifier(snapshot.platformId || value.platformId);
      const platform = PLATFORM_LABELS[platformId] || readableIdentifier(platformId) || "Supported video";
      const coverage = normaliseCoverage(value.coverage, snapshot);
      const cueCount = Array.isArray(snapshot.cues) ? snapshot.cues.length : 0;
      const sourceLabel = boundedText(value.sourceLabel, 160) || "Current caption source";
      const language = readableLanguage(snapshot.languageCode);

      elements["context-platform"].textContent = platform;
      if (contextPanel) contextPanel.dataset.coverage = coverage;
      if (bbcNote) bbcNote.hidden = platformId !== "bbc";

      if (coverage === "loaded_track") {
        elements["context-status"].textContent = "Timed caption track loaded";
        elements["context-detail"].textContent = joinDetails([
          sourceLabel,
          countLabel(cueCount),
          language
        ]);
        return;
      }
      if (coverage === "partial_track") {
        elements["context-status"].textContent = "Partial caption track loaded";
        elements["context-detail"].textContent = joinDetails([
          sourceLabel,
          countLabel(cueCount),
          language,
          "Results cover only the captions currently available"
        ]);
        return;
      }

      elements["context-status"].textContent = "Timed captions unavailable";
      elements["context-detail"].textContent = boundedText(value.error, 500)
        || "Load a timed caption track in Subtle, then refresh Learn.";
    }

    function renderCapabilities(capabilities, hasTranscript = true) {
      const value = capabilities && typeof capabilities === "object" ? capabilities : {};
      const translator = capability(value.translator);
      const explainer = capability(value.explainer || value.languageModel);
      const summarizer = capability(value.summarizer);

      renderCapability(elements["capability-translator"], translator);
      renderCapability(elements["capability-explainer"], explainer);
      renderCapability(elements["capability-summarizer"], summarizer);
      elements["translate-button"].disabled = !hasTranscript || !isUsable(translator.state);
      elements["explain-button"].disabled = !hasTranscript || !isUsable(explainer.state);
      elements["summary-button"].disabled = !hasTranscript || !isUsable(summarizer.state);
      answerCapabilityUsable = isUsable(explainer.state);
      transcriptAvailable = Boolean(hasTranscript);
      setQuestion(elements["caption-question"].value);
    }

    function setQuestion(value) {
      elements["ask-button"].disabled = !transcriptAvailable || !answerCapabilityUsable || !boundedText(value, 500);
    }

    function setBusy(label, progress) {
      elements["operation-region"].hidden = false;
      elements["operation-region"].classList.remove("is-error");
      elements["operation-label"].textContent = boundedText(label, 240) || "Working on-device…";
      elements["cancel-operation"].hidden = false;
      elements["cancel-operation"].disabled = false;
      setProgress(progress);
    }

    function setProgress(progress, label) {
      if (label) elements["operation-label"].textContent = boundedText(label, 240);
      const value = progressValue(progress);
      const progressElement = elements["operation-progress"];
      progressElement.hidden = false;
      if (value === null) {
        progressElement.removeAttribute("value");
        progressElement.removeAttribute("aria-valuenow");
        return;
      }
      progressElement.value = value;
      progressElement.setAttribute("aria-valuenow", String(Math.round(value * 100)));
      progressElement.setAttribute("aria-valuetext", `${Math.round(value * 100)}%`);
    }

    function clearBusy() {
      elements["operation-region"].hidden = true;
      elements["operation-region"].classList.remove("is-error");
      elements["operation-label"].textContent = "";
      elements["operation-progress"].removeAttribute("value");
      elements["operation-progress"].removeAttribute("aria-valuenow");
      elements["operation-progress"].removeAttribute("aria-valuetext");
      elements["cancel-operation"].disabled = true;
    }

    function showError(message) {
      elements["operation-region"].hidden = false;
      elements["operation-region"].classList.add("is-error");
      elements["operation-label"].textContent = boundedText(message, 1_000) || "Chrome could not complete that request.";
      elements["operation-progress"].hidden = true;
      elements["cancel-operation"].hidden = true;
    }

    function showTranslation(snapshot) {
      if (!snapshot || typeof snapshot !== "object") {
        elements["translation-result"].replaceChildren();
        elements["translation-result"].hidden = true;
        elements["download-translation"].hidden = true;
        elements["clear-translation"].hidden = true;
        return;
      }
      const value = snapshot && typeof snapshot === "object" ? snapshot : {};
      const cues = Array.isArray(value.cues) ? value.cues : [];
      const panel = createElement(documentRef, "div", "result-panel");
      appendTextElement(documentRef, panel, "p", "result-kicker", "Translation showing");
      appendTextElement(
        documentRef,
        panel,
        "h3",
        "",
        `${countLabel(cues.length)} translated${readableLanguage(value.languageCode) ? ` · ${readableLanguage(value.languageCode)}` : ""}`
      );
      appendTextElement(
        documentRef,
        panel,
        "p",
        "",
        "The translated track is now available as Subtle's second caption line."
      );
      replaceWith(elements["translation-result"], panel);
      elements["translation-result"].hidden = false;
      elements["download-translation"].hidden = false;
      elements["clear-translation"].hidden = false;
    }

    function showExplanation(result) {
      const value = result && typeof result === "object" ? result : {};
      const panel = createElement(documentRef, "article", "result-panel");
      appendTextElement(documentRef, panel, "p", "result-kicker", timestampKicker(value.start));
      if (boundedText(value.text, 4_000)) {
        appendTextElement(documentRef, panel, "p", "caption-quote", boundedText(value.text, 4_000));
      }
      appendResultSection(documentRef, panel, "Meaning", value.meaning);
      appendResultSection(documentRef, panel, "Natural phrasing", value.naturalPhrasing);

      const grammarNotes = boundedTextArray(value.grammarNotes, 12, 1_000);
      if (grammarNotes.length) {
        appendTextElement(documentRef, panel, "h4", "", "Grammar notes");
        const list = createElement(documentRef, "ul");
        for (const note of grammarNotes) appendTextElement(documentRef, list, "li", "", note);
        panel.appendChild(list);
      }

      const vocabulary = Array.isArray(value.vocabulary) ? value.vocabulary.slice(0, 20) : [];
      if (vocabulary.length) {
        appendTextElement(documentRef, panel, "h4", "", "Vocabulary");
        const list = createElement(documentRef, "dl", "vocabulary-list");
        for (const item of vocabulary) {
          const term = boundedText(item?.term, 240);
          const definition = boundedText(item?.definition, 1_000);
          if (!term || !definition) continue;
          const row = createElement(documentRef, "div");
          appendTextElement(documentRef, row, "dt", "", term);
          appendTextElement(documentRef, row, "dd", "", definition);
          list.appendChild(row);
        }
        if (list.childNodes.length) panel.appendChild(list);
      }

      replaceWith(elements["explanation-result"], panel);
      elements["explanation-result"].hidden = false;
      elements["download-explanation"].hidden = false;
    }

    function showSummary(result) {
      const value = result && typeof result === "object" ? result : {};
      const sections = Array.isArray(value.sections) ? value.sections : [];
      const cards = [];
      for (const section of sections) {
        const start = nonNegativeNumber(section?.start);
        const summary = boundedText(section?.summary, 8_000);
        if (start === null || !summary) continue;
        const card = createElement(documentRef, "article", "summary-card");
        const timestamp = createElement(documentRef, "button", "timestamp-button");
        timestamp.type = "button";
        timestamp.dataset.seconds = String(start);
        timestamp.setAttribute("aria-label", `Go to ${formatTimestamp(start)} in the video`);
        timestamp.textContent = formatTimestamp(start);
        card.appendChild(timestamp);
        appendTextElement(documentRef, card, "p", "", summary);
        cards.push(card);
      }

      elements["summary-result"].replaceChildren(...cards);
      if (!cards.length) {
        const empty = createElement(documentRef, "div", "result-panel");
        appendTextElement(documentRef, empty, "p", "", "Chrome returned no summary sections.");
        elements["summary-result"].appendChild(empty);
      }
      elements["summary-result"].hidden = false;
      elements["download-summary"].hidden = false;
    }

    function showAnswer(result) {
      const value = result && typeof result === "object" ? result : {};
      const answer = boundedText(value.answer, 4_000);
      const panel = createElement(documentRef, "article", "result-panel");
      appendTextElement(documentRef, panel, "p", "result-kicker", "Caption-grounded answer");
      if (boundedText(value.question, 500)) {
        appendTextElement(documentRef, panel, "p", "caption-quote", boundedText(value.question, 500));
      }
      appendTextElement(documentRef, panel, "p", "", answer || "Chrome returned no answer.");

      const citations = createElement(documentRef, "div", "answer-citations");
      for (const citation of Array.isArray(value.citations) ? value.citations.slice(0, 12) : []) {
        const start = nonNegativeNumber(citation?.start);
        if (start === null) continue;
        const button = createElement(documentRef, "button", "timestamp-button");
        button.type = "button";
        button.dataset.seconds = String(start);
        button.setAttribute("aria-label", `Go to supporting caption at ${formatTimestamp(start)}`);
        button.textContent = formatTimestamp(start);
        citations.appendChild(button);
      }
      if (citations.childNodes.length) panel.appendChild(citations);
      else {
        appendTextElement(
          documentRef,
          panel,
          "p",
          "answer-note",
          "Chrome did not return a supporting timestamp. Treat this answer as unverified."
        );
      }
      if (value.retrievalTruncated || value.transcriptTruncated) {
        appendTextElement(
          documentRef,
          panel,
          "p",
          "answer-note",
          "The answer used selected caption excerpts, not the entire programme. Check the linked moments for context."
        );
      }

      replaceWith(elements["answer-result"], panel);
      elements["answer-result"].hidden = false;
      elements["download-answer"].hidden = false;
    }

    function clearResults() {
      showTranslation(null);
      for (const [resultId, downloadId] of [
        ["explanation-result", "download-explanation"],
        ["summary-result", "download-summary"],
        ["answer-result", "download-answer"]
      ]) {
        elements[resultId].replaceChildren();
        elements[resultId].hidden = true;
        elements[downloadId].hidden = true;
      }
    }

    return {
      renderTranslationLanguages,
      renderContext,
      renderCapabilities,
      setQuestion,
      setBusy,
      setProgress,
      clearBusy,
      showError,
      showTranslation,
      showExplanation,
      showSummary,
      showAnswer,
      clearResults
    };
  }

  function collectElements(documentRef, ids) {
    const elements = {};
    for (const id of ids) {
      const element = documentRef.getElementById(id);
      if (!element) throw new Error(`Learn view element #${id} is missing.`);
      elements[id] = element;
    }
    return elements;
  }

  function normaliseCoverage(coverage, snapshot) {
    if (coverage === "loaded_track" || coverage === "partial_track") return coverage;
    if (coverage === "unavailable") return "unavailable";
    if (Array.isArray(snapshot.cues) && snapshot.cues.length) return snapshot.truncated ? "partial_track" : "loaded_track";
    return "unavailable";
  }

  function capability(input) {
    if (typeof input === "string") return { state: normaliseCapabilityState(input) };
    const state = normaliseCapabilityState(input?.state);
    return { state, label: boundedText(input?.label || input?.detail, 160) };
  }

  function normaliseCapabilityState(value) {
    const state = String(value || "checking").toLowerCase();
    return Object.prototype.hasOwnProperty.call(CAPABILITY_LABELS, state) ? state : "unavailable";
  }

  function renderCapability(element, value) {
    element.dataset.state = value.state;
    element.textContent = value.label || CAPABILITY_LABELS[value.state];
  }

  function isUsable(state) {
    return USABLE_CAPABILITY_STATES.has(state);
  }

  function progressValue(progress) {
    const raw = progress && typeof progress === "object" ? progress.value : progress;
    if (raw === undefined || raw === null || raw === "") return null;
    const number = Number(raw);
    if (!Number.isFinite(number)) return null;
    return Math.min(1, Math.max(0, number));
  }

  function appendResultSection(documentRef, parent, title, body) {
    const text = boundedText(body, 4_000);
    if (!text) return;
    appendTextElement(documentRef, parent, "h4", "", title);
    appendTextElement(documentRef, parent, "p", "", text);
  }

  function appendTextElement(documentRef, parent, tagName, className, value) {
    const element = createElement(documentRef, tagName, className);
    element.appendChild(documentRef.createTextNode(String(value)));
    parent.appendChild(element);
    return element;
  }

  function createElement(documentRef, tagName, className) {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    return element;
  }

  function replaceWith(element, child) {
    element.replaceChildren(child);
  }

  function boundedText(value, maximum) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, maximum);
  }

  function boundedTextArray(value, maximumItems, maximumLength) {
    return (Array.isArray(value) ? value : [])
      .slice(0, maximumItems)
      .map((item) => boundedText(item, maximumLength))
      .filter(Boolean);
  }

  function safeIdentifier(value) {
    const identifier = boundedText(value, 40).toLowerCase();
    return /^[a-z0-9_-]+$/.test(identifier) ? identifier : "";
  }

  function readableIdentifier(value) {
    return value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
  }

  function readableLanguage(value) {
    const language = boundedText(value, 40);
    if (!language || language === "und") return "";
    try {
      return new Intl.DisplayNames(["en"], { type: "language" }).of(language) || language.toUpperCase();
    } catch (_error) {
      return language.toUpperCase();
    }
  }

  function countLabel(count) {
    const number = Math.max(0, Number(count) || 0);
    return `${number.toLocaleString("en-GB")} ${number === 1 ? "caption" : "captions"}`;
  }

  function joinDetails(parts) {
    return parts.filter(Boolean).join(" · ");
  }

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function timestampKicker(seconds) {
    const value = nonNegativeNumber(seconds);
    return value === null ? "Current caption" : `Current caption · ${formatTimestamp(value)}`;
  }

  function formatTimestamp(seconds) {
    if (!root.SubtleTranscript?.formatTimestamp) {
      throw new Error("SubtleTranscript.formatTimestamp is required by the Learn view.");
    }
    return root.SubtleTranscript.formatTimestamp(seconds);
  }

  return { create };
});
