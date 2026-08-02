const test = require("node:test");
const assert = require("node:assert/strict");

const AiLanguages = require("../lib/ai-languages.js");

test("the shared language matrix covers Chrome's stable Translator languages", () => {
  const languages = AiLanguages.allTranslatorLanguages();
  const codes = new Set(languages.map((language) => language.code));

  for (const code of ["ar", "bg", "bn", "en", "es", "fr", "ja", "kn", "mr", "ta", "te", "th", "vi", "zh", "zh-Hant"]) {
    assert.equal(codes.has(code), true, `${code} should be available`);
  }
  assert.equal(codes.size, languages.length);
});

test("language variants map to the API-specific support contract", () => {
  assert.equal(AiLanguages.translatorLanguage("en-GB"), "en");
  assert.equal(AiLanguages.translatorLanguage("zh-Hant"), "zh-Hant");
  assert.equal(AiLanguages.foundationLanguage("fr-CA"), "fr");
  assert.equal(AiLanguages.foundationLanguage("it"), "");
  assert.equal(AiLanguages.translatorLanguage("xx"), "");
});
