(function exposeCaptionSettings(root, factory) {
  const api = factory(root.SubtleState, root.SubtleCues);
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./state.js"), require("./cues.js"));
  } else root.SubtleCaptionSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCaptionSettings(SubtleState, SubtleCues) {
  "use strict";

  let cachedUploadText;
  let cachedUploadCueCount = 0;

  function sourceView(state, pageStatus, knownPlatformId) {
    const platformId = pageStatus?.platformId || knownPlatformId;
    const platformAvailable = SubtleState.availableSecondarySources(platformId).includes("platform");
    const secondarySource = SubtleState.effectiveSecondarySource(state, platformId);
    const view = {
      secondarySource,
      platformSourceLabel: pageStatus?.sourceLabel || platformSourceLabel(platformId),
      platformSourceDisabled: !platformAvailable,
      showLanguage: secondarySource === "platform",
      showUpload: secondarySource === "upload",
      languageLabel: "Second language",
      languageOptions: [],
      selectedLanguage: state.targetLanguage,
      languageDisabled: false,
      cueCount: "auto",
      note: "Uses caption tracks supplied by the current player."
    };

    if (secondarySource === "upload") return localFileView(view, state, platformId);
    if (platformId === "youtube") return youtubeView(view, state, pageStatus);
    if (platformId === "netflix") return netflixView(view, state, pageStatus);
    return view;
  }

  function platformSourceLabel(platformId) {
    if (platformId === "youtube") return "YouTube captions";
    if (platformId === "netflix") return "Netflix captions";
    if (platformId === "bbc") return "BBC iPlayer captions";
    return "Platform captions";
  }

  function youtubeView(view, state, pageStatus) {
    const options = languageOptions(pageStatus?.availableTracks);
    if (!options.length) {
      return {
        ...view,
        languageOptions: [{ value: "", label: "Waiting for language options…" }],
        selectedLanguage: "",
        languageDisabled: true,
        note: "Start playback with captions on while Subtle checks this video's caption languages."
      };
    }
    const requested = matchingOption(options, state.targetLanguage);
    return {
      ...view,
      languageOptions: options,
      selectedLanguage: requested?.value || pageStatus?.selectedTrack?.languageCode || options[0].value,
      cueCount: `${options.length} languages`,
      note: "Uses caption languages shown by YouTube for this video."
    };
  }

  function localFileView(view, state, platformId) {
    const cueCount = countUploadedCues(state.uploadedTrack?.text || "");
    return {
      ...view,
      cueCount: cueCount ? `${cueCount} cues` : "local",
      note: localFileNote(state, platformId)
    };
  }

  function localFileNote(state, platformId) {
    if (state.uploadedTrack) return "Stored only in Chrome on this device. Use delay if the track is out of sync.";
    if (platformId === "netflix") return "Import a timed SRT or VTT file to use a local second line on Netflix.";
    if (platformId === "bbc") {
      return "BBC controls primary speaker colours. Import a timed SRT or VTT file for a local second line.";
    }
    return "Works on YouTube, Netflix and BBC iPlayer. Import a timed SRT or VTT file.";
  }

  function countUploadedCues(text) {
    if (text === cachedUploadText) return cachedUploadCueCount;
    cachedUploadText = text;
    cachedUploadCueCount = SubtleCues.parseTimedText(text).length;
    return cachedUploadCueCount;
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

  function platformView(activePlatform, pageStatus) {
    const isYouTube = activePlatform?.id === "youtube";
    return {
      showYouTubePosition: isYouTube,
      showShortsSettings: isYouTube,
      shortsStatus: !isYouTube
        ? "YouTube only"
        : pageStatus?.surface === "shorts" ? "Active now" : "Available on Shorts"
    };
  }

  return { sourceView, platformView };
});
