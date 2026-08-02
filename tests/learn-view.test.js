const test = require("node:test");
const assert = require("node:assert/strict");

const Transcript = require("../lib/transcript.js");
globalThis.SubtleTranscript = Transcript;
const LearnView = require("../lib/learn-view.js");

const REQUIRED_IDS = [
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
  "answer-result",
  "bbc-note"
];

test("translation languages are rendered from the shared Chrome support matrix", () => {
  const documentRef = createDocument();
  const view = LearnView.create(documentRef);

  view.renderTranslationLanguages([
    { code: "es", label: "Spanish" },
    { code: "zh-Hant", label: "Chinese (Traditional)" },
    { code: "<bad>", label: "Unsafe" }
  ], "zh-Hant");

  assert.deepEqual(
    documentRef.element("target-language").childNodes.map((option) => [option.value, option.textContent]),
    [["es", "Spanish"], ["zh-Hant", "Chinese (Traditional)"]]
  );
  assert.equal(documentRef.element("target-language").value, "zh-Hant");
});

test("Learn actions require a transcript and a usable language capability", () => {
  const documentRef = createDocument();
  const view = LearnView.create(documentRef);

  view.renderCapabilities({
    translator: { state: "language_unsupported" },
    languageModel: { state: "available" },
    summarizer: { state: "downloadable" }
  }, true);
  view.setQuestion("What happens next?");

  assert.equal(documentRef.element("translate-button").disabled, true);
  assert.equal(documentRef.element("explain-button").disabled, false);
  assert.equal(documentRef.element("summary-button").disabled, false);
  assert.equal(documentRef.element("ask-button").disabled, false);
  assert.equal(documentRef.element("capability-translator").textContent, "Language not supported");
  assert.equal(documentRef.element("capability-summarizer").textContent, "Model download required");

  view.renderCapabilities({
    translator: { state: "available" },
    languageModel: { state: "available" },
    summarizer: { state: "available" }
  }, false);
  view.setQuestion("What happens next?");

  assert.equal(documentRef.element("translate-button").disabled, true);
  assert.equal(documentRef.element("explain-button").disabled, true);
  assert.equal(documentRef.element("summary-button").disabled, true);
  assert.equal(documentRef.element("ask-button").disabled, true);
});

test("the BBC transcript note is shown only for BBC iPlayer content", () => {
  const documentRef = createDocument();
  const view = LearnView.create(documentRef);

  view.renderContext({
    coverage: "loaded_track",
    snapshot: { platformId: "bbc", languageCode: "en", cues: [{ start: 0, end: 1, text: "Hello" }] }
  });
  assert.equal(documentRef.element("bbc-note").hidden, false);

  view.renderContext({
    coverage: "loaded_track",
    snapshot: { platformId: "youtube", languageCode: "en", cues: [{ start: 0, end: 1, text: "Hello" }] }
  });
  assert.equal(documentRef.element("bbc-note").hidden, true);
});

test("model-authored explanations and summaries are rendered as text only", () => {
  const documentRef = createDocument();
  const view = LearnView.create(documentRef);
  const hostileText = "<img src=x onerror=uploadSecrets()>";

  view.showExplanation({
    start: 1,
    text: hostileText,
    meaning: hostileText,
    naturalPhrasing: "Natural text",
    grammarNotes: [`<script>${hostileText}</script>`],
    vocabulary: [{ term: hostileText, definition: hostileText }]
  });
  view.showSummary({ sections: [{ start: 2, summary: hostileText }] });
  view.showAnswer({
    question: hostileText,
    answer: hostileText,
    citations: [{ start: 3, text: hostileText }],
    retrievalTruncated: true
  });

  assert.match(visibleText(documentRef.element("explanation-result")), /<img src=x onerror=uploadSecrets\(\)>/);
  assert.match(visibleText(documentRef.element("summary-result")), /<img src=x onerror=uploadSecrets\(\)>/);
  assert.match(visibleText(documentRef.element("answer-result")), /<img src=x onerror=uploadSecrets\(\)>/);
  assert.equal(documentRef.createdTags.includes("img"), false);
  assert.equal(documentRef.createdTags.includes("script"), false);
  assert.equal(documentRef.element("download-explanation").hidden, false);
  assert.equal(documentRef.element("download-summary").hidden, false);
  assert.equal(documentRef.element("download-answer").hidden, false);
});

test("clearing Learn results removes stale content and export actions", () => {
  const documentRef = createDocument();
  const view = LearnView.create(documentRef);

  view.showTranslation({ languageCode: "fr", cues: [{ start: 0, end: 1, text: "Bonjour" }] });
  view.showExplanation({ meaning: "Hello" });
  view.showSummary({ sections: [{ start: 0, summary: "Opening" }] });
  view.showAnswer({ question: "What happens?", answer: "An opening.", citations: [] });
  view.clearResults();

  for (const id of ["translation-result", "explanation-result", "summary-result", "answer-result"]) {
    assert.equal(documentRef.element(id).hidden, true);
    assert.equal(documentRef.element(id).childNodes.length, 0);
  }
  for (const id of ["download-translation", "download-explanation", "download-summary", "download-answer", "clear-translation"]) {
    assert.equal(documentRef.element(id).hidden, true);
  }
});

test("operation errors replace progress and remain visible", () => {
  const documentRef = createDocument();
  const view = LearnView.create(documentRef);

  view.setBusy("Downloading model…", 0.5);
  view.showError("Chrome could not create the model.");

  assert.equal(documentRef.element("operation-region").hidden, false);
  assert.equal(documentRef.element("operation-region").classList.contains("is-error"), true);
  assert.equal(documentRef.element("operation-label").textContent, "Chrome could not create the model.");
  assert.equal(documentRef.element("operation-progress").hidden, true);
  assert.equal(documentRef.element("cancel-operation").hidden, true);
});

function createDocument() {
  const elements = new Map(REQUIRED_IDS.map((id) => [id, new TestElement("div")]));
  const contextPanel = new TestElement("section");
  const createdTags = [];
  return {
    createdTags,
    element(id) { return elements.get(id); },
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) { return selector === ".context-panel" ? contextPanel : null; },
    createElement(tagName) {
      createdTags.push(String(tagName).toLowerCase());
      return new TestElement(tagName);
    },
    createTextNode(value) { return { nodeType: 3, textContent: String(value) }; }
  };
}

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.attributes = new Map();
    const classes = new Set();
    this.classList = {
      add: (...values) => values.forEach((value) => classes.add(value)),
      remove: (...values) => values.forEach((value) => classes.delete(value)),
      contains: (value) => classes.has(value)
    };
  }

  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.childNodes = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  set innerHTML(_value) {
    throw new Error("Learn results must use text-only DOM rendering.");
  }
}

function visibleText(node) {
  return [node.textContent, ...(node.childNodes || []).map(visibleText)].join(" ");
}
