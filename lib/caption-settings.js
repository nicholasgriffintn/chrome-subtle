(function exposeCaptionSettings(root, factory) {
  const api = factory(root.SubtleState, root.SubtleCues);
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./state.js"), require("./cues.js"));
  } else root.SubtleCaptionSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCaptionSettings(SubtleState, SubtleCues) {
  "use strict";

  function sourceView(state, pageStatus) {
    const platformId = pageStatus?.platformId;
    const platformAvailable = platformId === "youtube" || platformId === "netflix";
    const secondarySource = SubtleState.effectiveSecondarySource(state, platformId);
    const view = {
      secondarySource,
      platformSourceLabel: pageStatus?.sourceLabel || "Platform captions",
      platformSourceDisabled: !platformAvailable,
      showLanguage: secondarySource === "platform",
      showUpload: secondarySource === "upload",
      languageLabel: "Translate to",
      languageOptions: [],
      selectedLanguage: state.targetLanguage,
      languageDisabled: false,
      cueCount: "auto",
      note: "Uses YouTube's supplied caption track and translation support; availability varies by video."
    };

    if (secondarySource === "upload") return localFileView(view, state, platformId);
    if (platformId === "youtube") return youtubeView(view, state, pageStatus);
    if (platformId === "netflix") return netflixView(view, state, pageStatus);
    return view;
  }

  function youtubeView(view, state, pageStatus) {
    const options = languageOptions(pageStatus?.availableTracks);
    if (!options.length) {
      return {
        ...view,
        languageOptions: [{ value: "", label: "Waiting for language options…" }],
        selectedLanguage: "",
        languageDisabled: true,
        note: "Start playback with captions on while Subtle checks this video's translation languages."
      };
    }
    const requested = matchingOption(options, state.targetLanguage);
    return {
      ...view,
      languageOptions: options,
      selectedLanguage: requested?.value || pageStatus?.selectedTrack?.languageCode || options[0].value,
      cueCount: `${options.length} languages`,
      note: "Uses translation languages supplied by YouTube for this video."
    };
  }

  function localFileView(view, state, platformId) {
    const cueCount = SubtleCues.parseTimedText(state.uploadedTrack?.text || "").length;
    return {
      ...view,
      cueCount: cueCount ? `${cueCount} cues` : "local",
      note: state.uploadedTrack
        ? "Stored only in Chrome on this device. Use delay if the track is out of sync."
        : platformId === "netflix"
          ? "Import a timed SRT or VTT file to use a local second line on Netflix."
          : "Works on YouTube and Netflix. Import a timed SRT or VTT file."
    };
  }

  function netflixView(view, state, pageStatus) {
    const options = languageOptions(pageStatus?.availableTracks);
    if (!options.length) {
      return {
        ...view,
        languageLabel: "Second language",
        languageOptions: [{ value: "", label: "Waiting for Netflix captions…" }],
        selectedLanguage: "",
        languageDisabled: true,
        note: "Start Netflix playback while Subtle waits for this title's caption tracks."
      };
    }
    const requested = matchingOption(options, state.targetLanguage);
    return {
      ...view,
      languageLabel: "Second language",
      languageOptions: options,
      selectedLanguage: requested?.value || pageStatus?.selectedTrack?.languageCode || options[0].value,
      cueCount: `${pageStatus.trackCount || options.length} tracks`,
      note: "Uses caption languages supplied with this Netflix title; availability varies."
    };
  }

  function languageOptions(tracks) {
    return Array.isArray(tracks)
      ? tracks.flatMap((track) => {
        const value = String(track?.languageCode || "").slice(0, 35);
        if (!value) return [];
        return [{ value, label: String(track?.label || value).slice(0, 120) }];
      })
      : [];
  }

  function matchingOption(options, language) {
    const requested = String(language || "").toLowerCase();
    return options.find((option) => option.value.toLowerCase() === requested)
      || options.find((option) => option.value.toLowerCase().split("-")[0] === requested.split("-")[0]);
  }

  return { sourceView };
});
