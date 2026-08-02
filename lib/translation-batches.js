(function exposeSubtleTranslationBatches(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleTranslationBatches = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleTranslationBatches() {
  "use strict";

  const OPEN = "\uE000";
  const SEPARATOR = "\uE001";
  const CLOSE = "\uE002";
  const RESERVED = `${OPEN}${SEPARATOR}${CLOSE}`;
  const DEFAULT_MAX_CHARACTERS = 3_000;
  const DEFAULT_MAX_ITEMS = 16;

  function create(texts, options = {}) {
    const maxCharacters = boundedInteger(options.maxCharacters, DEFAULT_MAX_CHARACTERS, 256, 8_000);
    const maxItems = boundedInteger(options.maxItems, DEFAULT_MAX_ITEMS, 2, 32);
    const batches = [];
    let current = [];
    let currentLength = 0;

    const flush = () => {
      if (!current.length) return;
      batches.push({ items: current, input: encode(current), structured: current.length > 1 });
      current = [];
      currentLength = 0;
    };

    for (let index = 0; index < texts.length; index += 1) {
      const text = String(texts[index] || "").trim();
      if (!text) continue;
      const item = { key: index, text };
      const encodedLength = encodeItem(item).length + (current.length ? 1 : 0);
      if (containsReservedMarker(text) || encodedLength > maxCharacters) {
        flush();
        batches.push({ items: [item], input: text, structured: false });
        continue;
      }
      if (current.length && (current.length >= maxItems || currentLength + encodedLength > maxCharacters)) flush();
      current.push(item);
      currentLength += encodedLength;
    }
    flush();
    return batches;
  }

  function parse(batch, value) {
    if (!batch?.structured || !Array.isArray(batch.items)) return null;
    const output = String(value || "");
    const expectedKeys = new Set(batch.items.map((item) => item.key));
    const translations = new Map();
    const pattern = new RegExp(`${OPEN}(\\d+)${SEPARATOR}([\\s\\S]*?)${CLOSE}`, "g");
    let cursor = 0;
    let match;
    while ((match = pattern.exec(output))) {
      if (output.slice(cursor, match.index).trim()) return null;
      const key = Number(match[1]);
      const text = match[2].trim();
      if (!expectedKeys.has(key) || translations.has(key) || !text) return null;
      translations.set(key, text);
      cursor = pattern.lastIndex;
    }
    if (output.slice(cursor).trim() || translations.size !== expectedKeys.size) return null;
    return translations;
  }

  function encode(items) {
    return items.map(encodeItem).join("\n");
  }

  function encodeItem(item) {
    return `${OPEN}${item.key}${SEPARATOR}${item.text}${CLOSE}`;
  }

  function containsReservedMarker(value) {
    return Array.from(RESERVED).some((marker) => value.includes(marker));
  }

  function boundedInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  return { create, parse };
});
