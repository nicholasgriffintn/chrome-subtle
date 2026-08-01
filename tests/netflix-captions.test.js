const test = require("node:test");
const assert = require("node:assert/strict");
const PlatformCaptions = require("../lib/platform-captions.js");
const SubtleCues = require("../lib/cues.js");

const NetflixCaptions = PlatformCaptions.forPlatform("netflix");

test("Netflix tracks are bounded, normalised and selected by language", () => {
  const tracks = NetflixCaptions.tracksFromEvent({ contentId: "123", tracks: [
    { id: "en-cc", contentId: "123", languageCode: "en-US", label: "English [CC]", kind: "closedcaptions", isCaption: true, format: "webvtt" },
    { id: "en", contentId: "123", languageCode: "en", label: "English", kind: "subtitles", format: "imsc" },
    { id: "es", contentId: "123", languageCode: "es", label: "Español", kind: "subtitles", format: "dfxp" },
    { id: "bad", contentId: "123", languageCode: "fr", format: "remote-code" }
  ] }, { pathname: "/watch/123" });

  assert.equal(tracks.length, 3);
  assert.equal(NetflixCaptions.selectTrack(tracks, { targetLanguage: "en-GB" }).id, "en");
  assert.equal(NetflixCaptions.selectTrack(tracks, { targetLanguage: "es" }).id, "es");
  assert.deepEqual(NetflixCaptions.availableLanguages(tracks), [
    { languageCode: "en-us", label: "English [CC]" },
    { languageCode: "en", label: "English" },
    { languageCode: "es", label: "Español" }
  ]);
});

test("Netflix DFXP and IMSC paragraphs become plain timed cues", () => {
  const cues = SubtleCues.parseTimedTextTrack(`<?xml version="1.0"?>
    <tt><body><div>
      <p begin="00:00:01.250" end="00:00:03.500"><span>Hello &amp;</span><br/>welcome</p>
      <p begin="4s" dur="1500ms">Second &#x2665; line</p>
    </div></body></tt>`, "imsc");

  assert.deepEqual(cues, [
    { start: 1.25, end: 3.5, text: "Hello &\nwelcome" },
    { start: 4, end: 5.5, text: "Second ♥ line" }
  ]);
});

test("simultaneous and staggered Netflix paragraphs retain every active line", () => {
  assert.deepEqual(SubtleCues.parseTimedTextTrack(`<tt><body><div>
    <p begin="1s" end="4s">I thought they'd</p>
    <p begin="2s" end="4s">go away, but they're not.</p>
  </div></body></tt>`, "dfxp"), [
    { start: 1, end: 2, text: "I thought they'd" },
    { start: 2, end: 4, text: "I thought they'd\ngo away, but they're not." }
  ]);
});

test("overlapping Netflix WebVTT cues retain every active line", () => {
  const cues = SubtleCues.parseTimedTextTrack(`WEBVTT

00:01.000 --> 00:04.000
and I don't have

00:02.000 --> 00:04.000
a scratch on me!`, "webvtt");

  assert.deepEqual(cues, [
    { start: 1, end: 2, text: "and I don't have" },
    { start: 2, end: 4, text: "and I don't have\na scratch on me!" }
  ]);
});

test("Netflix caption loading uses the opaque page-bridge request interface", async () => {
  const listeners = new Map();
  const documentRef = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatchEvent(event) {
      if (event.type === "subtle:request-netflix-track-content") {
        queueMicrotask(() => listeners.get("subtle:netflix-track-content")?.({
          detail: {
            requestId: event.detail.requestId,
            format: "webvtt",
            text: "WEBVTT\n\n00:01.000 --> 00:02.000\nHello"
          }
        }));
      }
    }
  };

  const cues = await NetflixCaptions.loadCues(
    { id: "track-1", contentId: "123", format: "webvtt" },
    {},
    { documentRef, createEvent: (type, detail) => ({ type, detail }) }
  );

  assert.deepEqual(cues, [{ start: 1, end: 2, text: "Hello" }]);
  assert.equal(listeners.has("subtle:netflix-track-content"), false);
});
