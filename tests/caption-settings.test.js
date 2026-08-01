const test = require("node:test");
const assert = require("node:assert/strict");
const CaptionSettings = require("../lib/caption-settings.js");
const SubtleState = require("../lib/state.js");

test("YouTube settings describe translation while Netflix settings list title tracks", () => {
  const state = SubtleState.normaliseState({ secondarySource: "platform", targetLanguage: "es" });
  const youtube = CaptionSettings.sourceView(state, {
    platformId: "youtube",
    sourceLabel: "YouTube translation",
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

  assert.equal(youtube.languageLabel, "Translate to");
  assert.equal(youtube.platformSourceLabel, "YouTube translation");
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

test("YouTube translation stays disabled until the current player supplies languages", () => {
  const view = CaptionSettings.sourceView(SubtleState.createDefaultState(), {
    platformId: "youtube",
    availableTracks: []
  });

  assert.equal(view.languageDisabled, true);
  assert.equal(view.languageOptions[0].value, "");
});
