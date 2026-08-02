import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

test("production build includes the downloadable extension", () => {
  assert.ok(statSync(new URL("../dist/subtle.zip", import.meta.url)).size > 1_000);
  const output = readFileSync(new URL("../dist/assets/" + findScript(), import.meta.url), "utf8");
  assert.match(output, /subtle\.zip/);
});

test("production site describes the current platform and feature support", () => {
  const output = readFileSync(new URL("../dist/assets/" + findScript(), import.meta.url), "utf8");

  for (const platform of ["YouTube", "Netflix", "BBC iPlayer", "Disney+", "Prime Video"]) {
    assert.match(output, new RegExp(platform.replace("+", "\\+")));
  }

  for (const feature of ["18 fonts", "movie-like", "Shorts", "speaker labels"]) {
    assert.match(output, new RegExp(feature));
  }
});

function findScript() {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  return html.match(/assets\/(index-[^"]+\.js)/)?.[1] || "missing.js";
}
