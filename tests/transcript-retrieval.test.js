const test = require("node:test");
const assert = require("node:assert/strict");

const Retrieval = require("../lib/transcript-retrieval.js");

function snapshot(cues) {
  return { contentKey: "video-1", platformId: "youtube", languageCode: "en", cues };
}

test("retrieval selects bounded caption neighbourhoods and keeps trusted timestamps", () => {
  const result = Retrieval.retrieve(snapshot([
    { start: 0, end: 2, text: "The train leaves London." },
    { start: 2, end: 4, text: "It travels through the night." },
    { start: 40, end: 42, text: "Mina discovers the hidden letter." },
    { start: 42, end: 44, text: "The letter names the missing heir." },
    { start: 90, end: 92, text: "They return home." }
  ]), "What does Mina discover?", { neighbourhood: 1, maxPassages: 2 });

  assert.deepEqual(result.passages[0], {
    id: "p1",
    start: 40,
    end: 44,
    text: "Mina discovers the hidden letter.\nThe letter names the missing heir."
  });
  assert.equal(result.question, "What does Mina discover?");
  assert.equal(result.retrievalTruncated, true);
});

test("retrieval supports non-Latin questions and samples the track when no term matches", () => {
  assert.deepEqual(Retrieval.queryTerms("لماذا غادر البطل؟"), ["لماذا", "غادر", "البطل"]);
  const result = Retrieval.retrieve(snapshot(Array.from({ length: 10 }, (_value, index) => ({
    start: index * 10,
    end: index * 10 + 2,
    text: `Caption ${index}`
  }))), "Why is the plan abandoned?", { maxPassages: 3, neighbourhood: 0 });

  assert.deepEqual(result.passages.map((passage) => passage.start), [0, 50, 90]);
});

test("retrieval rejects empty questions and enforces aggregate context bounds", () => {
  assert.throws(() => Retrieval.retrieve(snapshot([{ start: 0, end: 1, text: "Hello" }]), "  "), { code: "empty_question" });
  const result = Retrieval.retrieve(snapshot(Array.from({ length: 5 }, (_value, index) => ({
    start: index,
    end: index + 1,
    text: `${"word ".repeat(90)}target`
  }))), "target", { maxCharacters: 500, maxPassages: 5, neighbourhood: 0 });

  assert.ok(result.passages.reduce((total, passage) => total + passage.text.length, 0) <= 500);
  const oversized = Retrieval.retrieve(snapshot([
    { start: 0, end: 1, text: `${"very long ".repeat(80)}target` },
    { start: 2, end: 3, text: "target fallback" }
  ]), "target", { maxCharacters: 500, maxPassages: 2, neighbourhood: 0 });
  assert.ok(oversized.passages.reduce((total, passage) => total + passage.text.length, 0) <= 500);
});
