const test = require("node:test");
const assert = require("node:assert/strict");
const NativeCaptionFilters = require("../lib/native-caption-filters.js");

test("native filtering removes embedded noise and restores site text when cleared", () => {
  const caption = captionElement(">> Hating me is like all you do. [music]");
  const filters = NativeCaptionFilters.create();

  filters.apply([caption], { blockMusic: true });
  assert.equal(caption.textContent, ">> Hating me is like all you do.");
  assert.equal(caption.classes.has("subtle-blocked-caption"), false);

  filters.clear();
  assert.equal(caption.textContent, ">> Hating me is like all you do. [music]");
});

test("native filtering tracks caption text replaced by the site", () => {
  const caption = captionElement("First line [music]");
  const filters = NativeCaptionFilters.create();

  filters.apply([caption], { blockMusic: true });
  caption.textContent = "Updated line [music]";
  filters.apply([caption], { blockMusic: true });
  assert.equal(caption.textContent, "Updated line");

  filters.clear();
  assert.equal(caption.textContent, "Updated line [music]");
});

test("native filtering hides fully blocked captions and restores them", () => {
  const caption = captionElement("[music]");
  const filters = NativeCaptionFilters.create();

  filters.apply([caption], { blockMusic: true });
  assert.equal(caption.textContent, "[music]");
  assert.equal(caption.classes.has("subtle-blocked-caption"), true);

  filters.clear();
  assert.equal(caption.textContent, "[music]");
  assert.equal(caption.classes.has("subtle-blocked-caption"), false);
});

test("native filtering never flattens a structured site caption", () => {
  const caption = captionElement("Dialogue [music]");
  caption.childElementCount = 1;
  const filters = NativeCaptionFilters.create();

  filters.apply([caption], { blockMusic: true });

  assert.equal(caption.textContent, "Dialogue [music]");
  assert.equal(caption.classes.has("subtle-blocked-caption"), false);
});

function captionElement(text) {
  const classes = new Set();
  return {
    isConnected: true,
    textContent: text,
    classes,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      remove(name) {
        classes.delete(name);
      }
    }
  };
}
