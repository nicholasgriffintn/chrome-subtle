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

test("Disney caption styles are installed in the player shadow root", () => {
  const styles = [];
  let installedStyle;
  const attributes = new Set();
  const documentRef = { createElement: () => ({ dataset: {}, textContent: "" }) };
  const shadowRoot = {
    host: {
      ownerDocument: documentRef,
      toggleAttribute(name, enabled) {
        if (enabled) attributes.add(name);
        else attributes.delete(name);
      },
      setAttribute(name) { attributes.add(name); },
      removeAttribute(name) { attributes.delete(name); }
    },
    querySelector: () => installedStyle,
    append(style) { installedStyle = style; styles.push(style); }
  };

  NativeCaptionStyles.apply("disney", [shadowRoot], { enabled: true, textAlign: "center" });

  assert.equal(styles.length, 1);
  assert.match(styles[0].textContent, /[.]dss-subtitle-renderer-line/);
  assert.match(styles[0].textContent, /[.]hive-subtitle-renderer-line/);
  assert.match(styles[0].textContent, /video::cue\s*\{/);
  assert.match(styles[0].textContent, /video::-webkit-media-text-track-display/);
  assert.match(styles[0].textContent, /color: var\(--subtle-text-colour\)/);
  assert.match(styles[0].textContent, /line-height: var\(--subtle-native-line-height\)/);
  assert.equal(attributes.has("data-subtle-disney-enabled"), true);
});

test("YouTube layout-only segments are marked so they cannot render empty caption boxes", () => {
  const invisible = captionSegment("\u200b \u200b");
  const visible = captionSegment("All");

  NativeCaptionStyles.syncYouTubeSegments([invisible, visible]);

  assert.equal(invisible.classes.has("subtle-layout-caption-segment"), true);
  assert.equal(visible.classes.has("subtle-layout-caption-segment"), false);
});

function captionSegment(textContent) {
  const classes = new Set();
  return {
    textContent,
    classes,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
}
