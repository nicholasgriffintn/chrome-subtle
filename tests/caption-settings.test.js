const test = require("node:test");
const assert = require("node:assert/strict");
const CaptionSettings = require("../lib/caption-settings.js");
const SubtleState = require("../lib/state.js");

test("YouTube and Netflix settings list the current title's caption tracks", () => {
  const state = SubtleState.normaliseState({ secondarySource: "platform", targetLanguage: "es" });
  const youtube = CaptionSettings.sourceView(state, {
    platformId: "youtube",
    sourceLabel: "YouTube captions",
    availableTracks: [
      { languageCode: "en", label: "English" },
      { languageCode: "es", label: "Spanish" }
    ]
  });
  const netflix = CaptionSettings.sourceView(state, {
    platformId: "netflix",
    sourceLabel: "Netflix captions",
    trackCount: 2,
    availableTracks: [
      { languageCode: "en", label: "English" },
      { languageCode: "es", label: "Español" }
    ],
    selectedTrack: { languageCode: "es" }
  });

  assert.equal(youtube.languageLabel, "Second language");
  assert.equal(youtube.platformSourceLabel, "YouTube captions");
  assert.deepEqual(youtube.languageOptions, [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" }
  ]);
  assert.equal(netflix.languageLabel, "Second language");
  assert.equal(netflix.platformSourceLabel, "Netflix captions");
  assert.equal(netflix.selectedLanguage, "es");
  assert.equal(netflix.cueCount, "2 tracks");
});

test("Netflix settings wait honestly until title tracks are captured", () => {
  const view = CaptionSettings.sourceView(SubtleState.createDefaultState(), {
    platformId: "netflix",
    sourceLabel: "Netflix captions",
    availableTracks: []
  });

  assert.equal(view.languageDisabled, true);
  assert.equal(view.languageOptions[0].label, "Waiting for Netflix captions…");
  assert.match(view.note, /Start Netflix playback/);
});

test("unsupported pages expose only the local file source", () => {
  const view = CaptionSettings.sourceView(SubtleState.createDefaultState(), null);

  assert.equal(view.secondarySource, "upload");
  assert.equal(view.platformSourceDisabled, true);
  assert.equal(view.showUpload, true);
});

test("a known supported page keeps its platform source while runtime status is unavailable", () => {
  const view = CaptionSettings.sourceView(SubtleState.createDefaultState(), null, "youtube");

  assert.equal(view.secondarySource, "platform");
  assert.equal(view.platformSourceDisabled, false);
  assert.equal(view.showLanguage, true);
  assert.equal(view.languageDisabled, true);
  assert.equal(view.languageOptions[0].label, "Waiting for language options…");
});

test("YouTube captions stay disabled until the current player supplies languages", () => {
  const view = CaptionSettings.sourceView(SubtleState.createDefaultState(), {
    platformId: "youtube",
    availableTracks: []
  });

  assert.equal(view.languageDisabled, true);
  assert.equal(view.languageOptions[0].value, "");
});

test("platform-specific controls do not expose YouTube placement on Netflix", () => {
  assert.deepEqual(CaptionSettings.platformView({ id: "netflix" }, { surface: "video" }), {
    showYouTubePosition: false,
    showShortsSettings: false,
    shortsStatus: "YouTube only"
  });
  assert.deepEqual(CaptionSettings.platformView({ id: "youtube" }, { surface: "shorts" }), {
    showYouTubePosition: true,
    showShortsSettings: true,
    shortsStatus: "Active now"
  });
});

test("an imported file is parsed once while unrelated preferences change", () => {
  const cuesPath = require.resolve("../lib/cues.js");
  const settingsPath = require.resolve("../lib/caption-settings.js");
  const cues = require(cuesPath);
  const originalParseTimedText = cues.parseTimedText;
  let parseCount = 0;

  cues.parseTimedText = (text) => {
    parseCount += 1;
    return originalParseTimedText(text);
  };
  delete require.cache[settingsPath];

  try {
    const isolatedSettings = require(settingsPath);
    const uploadedTrack = {
      name: "captions.srt",
      text: "00:00:01,000 --> 00:00:02,000\nHello"
    };
    isolatedSettings.sourceView(SubtleState.normaliseState({ secondarySource: "upload", uploadedTrack }), null);
    isolatedSettings.sourceView(SubtleState.normaliseState({
      secondarySource: "upload",
      uploadedTrack,
      fontSize: 48
    }), null);

    assert.equal(parseCount, 1);
  } finally {
    cues.parseTimedText = originalParseTimedText;
    delete require.cache[settingsPath];
    require(settingsPath);
  }
});
