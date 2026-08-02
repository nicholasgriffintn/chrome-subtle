const test = require("node:test");
const assert = require("node:assert/strict");

const TranslationBatches = require("../lib/translation-batches.js");

test("translation batches stay within bounded request and item limits", () => {
  const batches = TranslationBatches.create(
    Array.from({ length: 40 }, (_, index) => `Caption ${index} ${"x".repeat(20)}`),
    { maxCharacters: 256, maxItems: 5 }
  );

  assert.ok(batches.length > 1);
  assert.ok(batches.every((batch) => batch.items.length <= 5));
  assert.ok(batches.every((batch) => batch.input.length <= 256));
});

test("structured translation output maps back to the exact cue keys", () => {
  const [batch] = TranslationBatches.create(["First line", "Second line"]);
  const output = batch.input.replace(/First line/, "Première ligne").replace(/Second line/, "Deuxième ligne");
  const parsed = TranslationBatches.parse(batch, output);

  assert.deepEqual(Array.from(parsed.entries()), [[0, "Première ligne"], [1, "Deuxième ligne"]]);
});

test("altered, missing or injected batch markers force the safe fallback path", () => {
  const [batch] = TranslationBatches.create(["First line", "Second line"]);

  assert.equal(TranslationBatches.parse(batch, batch.input.replace("\uE002", "")), null);
  assert.equal(TranslationBatches.parse(batch, `unexpected ${batch.input}`), null);
  assert.equal(TranslationBatches.parse(batch, `${batch.input}\n${batch.input}`), null);
});

test("captions containing reserved markers are never combined", () => {
  const batches = TranslationBatches.create(["Ordinary", "Contains \uE000 marker", "Another"]);

  assert.equal(batches.some((batch) => batch.items.some((item) => item.text.includes("\uE000")) && batch.structured), false);
});
