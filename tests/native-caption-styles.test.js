const test = require("node:test");
const assert = require("node:assert/strict");
const NativeCaptionStyles = require("../lib/native-caption-styles.js");

test("BBC styles are installed inside open shadow roots and preserve foreground colours", () => {
  const styles = [];
  let installedStyle;
  const attributes = new Set();
  const documentRef = {
    createElement() {
      return { dataset: {}, textContent: "" };
    }
  };
  const shadowRoot = {
    host: {
      ownerDocument: documentRef,
      toggleAttribute(name, enabled) {
        if (enabled) attributes.add(name);
        else attributes.delete(name);
      }
    },
    querySelector: () => installedStyle,
    append(style) {
      installedStyle = style;
      styles.push(style);
    }
  };

  NativeCaptionStyles.apply("bbc", [shadowRoot], { enabled: true, textAlign: "auto" });

  assert.equal(styles.length, 1);
  assert.match(styles[0].textContent, /background: var\(--subtle-caption-background\)/);
  assert.match(styles[0].textContent, /font-family: var\(--subtle-font-family\)/);
  assert.doesNotMatch(styles[0].textContent, /(?:^|\s)color:/);
  assert.match(
    styles[0].textContent,
    /\[lang\] p\s*\{[^}]*font-size: var\(--subtle-font-size\)[^}]*line-height: var\(--subtle-native-line-height\)/s
  );
  assert.match(styles[0].textContent, /p > span > span:not\(:has\(\*\)\)[^{]*\{[^}]*padding: 0 var\(--subtle-window-padding\)/s);
  assert.match(styles[0].textContent, /font-size: inherit !important/);
  assert.equal(attributes.has("data-subtle-bbc-enabled"), true);

  NativeCaptionStyles.apply("bbc", [shadowRoot], { enabled: false, textAlign: "auto" });
  assert.equal(styles.length, 1);
  assert.equal(attributes.has("data-subtle-bbc-enabled"), false);
});
