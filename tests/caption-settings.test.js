const test = require("node:test");
const assert = require("node:assert/strict");
const CaptionSettings = require("../lib/caption-settings.js");
const SubtleState = require("../lib/state.js");

const youtubeLanguages = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" }
];

test("YouTube settings describe translation while Netflix settings list title tracks", () => {
  const state = SubtleState.normaliseState({ secondarySource: "platform", targetLanguage: "es" });
  const youtube = CaptionSettings.sourceView(state, {
    platformId: "youtube",
    sourceLabel: "YouTube translation"
  }, youtubeLanguages);
  const netflix = CaptionSettings.sourceView(state, {
    platformId: "netflix",
    sourceLabel: "Netflix captions",
    trackCount: 2,
    availableTracks: [
      { languageCode: "en", label: "English" },
      { languageCode: "es", label: "Español" }
    ],
    selectedTrack: { languageCode: "es" }
  }, youtubeLanguages);

  assert.equal(youtube.languageLabel, "Translate to");
  assert.equal(youtube.platformSourceLabel, "YouTube translation");
  assert.deepEqual(youtube.languageOptions, youtubeLanguages);
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
  }, youtubeLanguages);

  assert.equal(view.languageDisabled, true);
  assert.equal(view.languageOptions[0].label, "Waiting for Netflix captions…");
  assert.match(view.note, /Start Netflix playback/);
});

test("unsupported pages expose only the local file source", () => {
  const view = CaptionSettings.sourceView(SubtleState.createDefaultState(), null, youtubeLanguages);

  assert.equal(view.secondarySource, "upload");
  assert.equal(view.platformSourceDisabled, true);
  assert.equal(view.showUpload, true);
});
