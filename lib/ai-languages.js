(function exposeSubtleAiLanguages(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleAiLanguages = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleAiLanguages() {
  "use strict";

  const TRANSLATOR_LANGUAGES = Object.freeze([
    language("ar", "Arabic"),
    language("bn", "Bengali"),
    language("bg", "Bulgarian"),
    language("zh", "Chinese (Simplified)"),
    language("zh-Hant", "Chinese (Traditional)"),
    language("hr", "Croatian"),
    language("cs", "Czech"),
    language("da", "Danish"),
    language("nl", "Dutch"),
    language("en", "English"),
    language("fi", "Finnish"),
    language("fr", "French"),
    language("de", "German"),
    language("el", "Greek"),
    language("he", "Hebrew"),
    language("hi", "Hindi"),
    language("hu", "Hungarian"),
    language("id", "Indonesian"),
    language("it", "Italian"),
    language("ja", "Japanese"),
    language("kn", "Kannada"),
    language("ko", "Korean"),
    language("lt", "Lithuanian"),
    language("mr", "Marathi"),
    language("no", "Norwegian"),
    language("pl", "Polish"),
    language("pt", "Portuguese"),
    language("ro", "Romanian"),
    language("ru", "Russian"),
    language("sk", "Slovak"),
    language("sl", "Slovenian"),
    language("es", "Spanish"),
    language("sv", "Swedish"),
    language("ta", "Tamil"),
    language("te", "Telugu"),
    language("th", "Thai"),
    language("tr", "Turkish"),
    language("uk", "Ukrainian"),
    language("vi", "Vietnamese")
  ]);
  const TRANSLATOR_CODES = new Map(TRANSLATOR_LANGUAGES.map((entry) => [entry.code.toLowerCase(), entry.code]));
  const FOUNDATION_LANGUAGES = new Set(["en", "ja", "es", "de", "fr"]);

  function allTranslatorLanguages() {
    return TRANSLATOR_LANGUAGES.slice();
  }

  function translatorLanguage(value) {
    const normalised = normaliseLanguage(value);
    if (!normalised) return "";
    const exact = TRANSLATOR_CODES.get(normalised.toLowerCase());
    if (exact) return exact;
    return TRANSLATOR_CODES.get(normalised.split("-")[0]) || "";
  }

  function foundationLanguage(value) {
    const languageCode = normaliseLanguage(value).split("-")[0];
    return FOUNDATION_LANGUAGES.has(languageCode) ? languageCode : "";
  }

  function isFoundationLanguage(value) {
    return Boolean(foundationLanguage(value));
  }

  function normaliseLanguage(value) {
    const code = String(value || "").trim().toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) ? code : "";
  }

  function language(code, label) {
    return Object.freeze({ code, label });
  }

  return {
    allTranslatorLanguages,
    translatorLanguage,
    foundationLanguage,
    isFoundationLanguage
  };
});
