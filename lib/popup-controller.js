(function exposeSubtlePopup(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePopup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtlePopup() {
  "use strict";

  const PRESETS = Object.freeze({
    cinema: {
      fontFamily: "proportional_sans", fontSize: 34, textColor: "#fffaf0", textOpacity: 100,
      secondaryColor: "#ffd36e", backgroundColor: "#0b1013", backgroundOpacity: 76,
      windowColor: "#000000", windowOpacity: 0, edgeStyle: "outline", outlineWidth: 3
    },
    soft: {
      fontFamily: "casual", fontSize: 31, textColor: "#f7f2e8", textOpacity: 100,
      secondaryColor: "#aee8d7", backgroundColor: "#172226", backgroundOpacity: 58,
      windowColor: "#172226", windowOpacity: 18, edgeStyle: "drop_shadow", outlineWidth: 2
    },
    contrast: {
      fontFamily: "monospaced_sans", fontSize: 38, textColor: "#ffffff", textOpacity: 100,
      secondaryColor: "#fff06a", backgroundColor: "#000000", backgroundOpacity: 92,
      windowColor: "#000000", windowOpacity: 70, edgeStyle: "outline", outlineWidth: 5
    }
  });

  const elements = {
    enabled: document.querySelector("#enabled"),
    primaryPreview: document.querySelector("#primary-preview"),
    secondaryPreview: document.querySelector("#secondary-preview"),
    siteStatus: document.querySelector("#site-status"),
    platform: document.querySelector("#platform"),
    statusDetail: document.querySelector("#status-detail"),
    sourcePanel: document.querySelector(".source-panel"),
    sourceField: document.querySelector("#source-field"),
    source: document.querySelector("#secondary-source"),
    youtubeSourceOption: document.querySelector("#youtube-source-option"),
    languageField: document.querySelector("#language-field"),
    targetLanguage: document.querySelector("#target-language"),
    uploadRow: document.querySelector("#upload-row"),
    subtitleFile: document.querySelector("#subtitle-file"),
    uploadLabel: document.querySelector("#upload-label"),
    clearUpload: document.querySelector("#clear-upload"),
    sourceNote: document.querySelector("#source-note"),
    cueCount: document.querySelector("#cue-count"),
    fontSize: document.querySelector("#font-size"),
    fontSizeOutput: document.querySelector("#font-size-output"),
    textOpacity: document.querySelector("#text-opacity"),
    textOpacityOutput: document.querySelector("#text-opacity-output"),
    backgroundOpacity: document.querySelector("#background-opacity"),
    backgroundOutput: document.querySelector("#background-output"),
    windowOpacity: document.querySelector("#window-opacity"),
    windowOpacityOutput: document.querySelector("#window-opacity-output"),
    fontFamily: document.querySelector("#font-family"),
    edgeStyle: document.querySelector("#edge-style"),
    position: document.querySelector("#position"),
    textColour: document.querySelector("#text-colour"),
    secondaryColour: document.querySelector("#secondary-colour"),
    backgroundColour: document.querySelector("#background-colour"),
    windowColour: document.querySelector("#window-colour"),
    delay: document.querySelector("#delay"),
    delayOutput: document.querySelector("#delay-output"),
    hideSoundCues: document.querySelector("#hide-sound-cues"),
    reset: document.querySelector("#reset"),
    saveStatus: document.querySelector("#save-status")
  };

  let state = SubtleState.createDefaultState();
  let pageStatus = null;
  let saveTimer;

  async function start() {
    const stored = await chrome.storage.local.get(SubtleState.STORAGE_KEY);
    state = SubtleState.normaliseState(stored[SubtleState.STORAGE_KEY]);
    bindEvents();
    render();
    await refreshPageStatus();
  }

  function bindEvents() {
    elements.enabled.addEventListener("change", () => update({ enabled: elements.enabled.checked }));
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => update({ mode: button.dataset.mode }));
    });
    elements.source.addEventListener("change", () => update({ secondarySource: elements.source.value }));
    elements.targetLanguage.addEventListener("change", () => update({ targetLanguage: elements.targetLanguage.value }));
    elements.fontSize.addEventListener("input", () => update({ fontSize: Number(elements.fontSize.value) }));
    elements.textOpacity.addEventListener("input", () => update({ textOpacity: Number(elements.textOpacity.value) }));
    elements.backgroundOpacity.addEventListener("input", () => update({ backgroundOpacity: Number(elements.backgroundOpacity.value) }));
    elements.windowOpacity.addEventListener("input", () => update({ windowOpacity: Number(elements.windowOpacity.value) }));
    elements.fontFamily.addEventListener("change", () => update({ fontFamily: elements.fontFamily.value }));
    elements.edgeStyle.addEventListener("change", () => update({ edgeStyle: elements.edgeStyle.value }));
    elements.position.addEventListener("change", () => update({ position: elements.position.value }));
    elements.textColour.addEventListener("input", () => update({ textColor: elements.textColour.value }));
    elements.secondaryColour.addEventListener("input", () => update({ secondaryColor: elements.secondaryColour.value }));
    elements.backgroundColour.addEventListener("input", () => update({ backgroundColor: elements.backgroundColour.value }));
    elements.windowColour.addEventListener("input", () => update({ windowColor: elements.windowColour.value }));
    elements.delay.addEventListener("input", () => update({ delayMs: Number(elements.delay.value) }));
    elements.hideSoundCues.addEventListener("change", () => update({ hideSoundCues: elements.hideSoundCues.checked }));
    elements.subtitleFile.addEventListener("change", importSubtitleFile);
    elements.clearUpload.addEventListener("click", () => update({ uploadedTrack: null }));
    elements.reset.addEventListener("click", () => {
      state = SubtleState.createDefaultState();
      render();
      saveNow().catch(showError);
    });
    document.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => update(PRESETS[button.dataset.preset]));
    });
  }

  function update(patch) {
    state = SubtleState.withPatch(state, patch);
    render();
    queueSave();
  }

  function render() {
    elements.enabled.checked = state.enabled;
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === state.mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    });
    elements.sourcePanel.hidden = state.mode !== "dual";
    elements.secondaryPreview.hidden = state.mode !== "dual";
    renderSourceControls();
    elements.targetLanguage.value = state.targetLanguage;
    elements.uploadLabel.textContent = state.uploadedTrack?.name || "Import subtitle file";
    elements.clearUpload.disabled = !state.uploadedTrack;
    elements.fontSize.value = String(state.fontSize);
    elements.fontSizeOutput.value = `${state.fontSize} px`;
    elements.textOpacity.value = String(state.textOpacity);
    elements.textOpacityOutput.value = `${state.textOpacity}%`;
    elements.backgroundOpacity.value = String(state.backgroundOpacity);
    elements.backgroundOutput.value = `${state.backgroundOpacity}%`;
    elements.windowOpacity.value = String(state.windowOpacity);
    elements.windowOpacityOutput.value = `${state.windowOpacity}%`;
    elements.fontFamily.value = state.fontFamily;
    elements.edgeStyle.value = state.edgeStyle;
    elements.position.value = state.position;
    elements.textColour.value = state.textColor;
    elements.secondaryColour.value = state.secondaryColor;
    elements.backgroundColour.value = state.backgroundColor;
    elements.windowColour.value = state.windowColor;
    elements.delay.value = String(state.delayMs);
    elements.delayOutput.value = `${state.delayMs} ms`;
    elements.hideSoundCues.checked = state.hideSoundCues;
    renderPreview();
    renderSourceStatus();
  }

  function renderSourceControls() {
    const isNetflix = pageStatus?.platformId === "netflix";
    const secondarySource = SubtleState.effectiveSecondarySource(state, pageStatus?.platformId);
    elements.youtubeSourceOption.hidden = isNetflix;
    elements.youtubeSourceOption.disabled = isNetflix;
    elements.source.disabled = isNetflix;
    elements.sourceField.classList.toggle("is-contextual", isNetflix);
    elements.source.value = secondarySource;
    elements.languageField.hidden = secondarySource !== "youtube";
    elements.uploadRow.hidden = secondarySource !== "upload";
  }

  function renderPreview() {
    const preview = document.querySelector(".preview-window");
    const edge = SubtleOverlay.edgeTreatment(state.edgeStyle, Math.max(1, Math.round(state.outlineWidth / 2)));
    preview.style.setProperty("--preview-font", SubtleOverlay.fontStack(state.fontFamily));
    preview.style.setProperty("--preview-variant", SubtleOverlay.fontVariant(state.fontFamily));
    preview.style.setProperty("--preview-primary-size", `${Math.max(15, state.fontSize * 0.56)}px`);
    preview.style.setProperty("--preview-secondary-size", `${Math.max(13, state.fontSize * state.secondaryScale / 180)}px`);
    preview.style.setProperty("--preview-primary", SubtleOverlay.hexToRgba(state.textColor, state.textOpacity));
    preview.style.setProperty("--preview-secondary", SubtleOverlay.hexToRgba(state.secondaryColor, state.textOpacity));
    preview.style.setProperty("--preview-bg", SubtleOverlay.hexToRgba(state.backgroundColor, state.backgroundOpacity));
    preview.style.setProperty("--preview-window", SubtleOverlay.hexToRgba(state.windowColor, state.windowOpacity));
    preview.style.setProperty("--preview-stroke", edge.stroke);
    preview.style.setProperty("--preview-shadow", edge.shadow);
  }

  function renderSourceStatus() {
    const secondarySource = SubtleState.effectiveSecondarySource(state, pageStatus?.platformId);
    elements.sourceNote.classList.remove("is-error");
    if (secondarySource === "upload") {
      const cueCount = SubtleCues.parseTimedText(state.uploadedTrack?.text || "").length;
      elements.cueCount.textContent = cueCount ? `${cueCount} cues` : "local";
      if (state.uploadedTrack) {
        elements.sourceNote.textContent = "Stored only in Chrome on this device. Use delay if the track is out of sync.";
      } else {
        elements.sourceNote.textContent = pageStatus?.platformId === "netflix"
          ? "Netflix uses a local timed file for its second line. Import an SRT or VTT file."
          : "Works on YouTube and Netflix. Import a timed SRT or VTT file.";
      }
      return;
    }
    elements.cueCount.textContent = pageStatus?.trackCount ? `${pageStatus.trackCount} tracks` : "auto";
    elements.sourceNote.textContent = "Uses the caption tracks already supplied by YouTube; availability varies by video.";
  }

  async function importSubtitleFile() {
    const file = elements.subtitleFile.files?.[0];
    try {
      const uploadedTrack = await SubtleImports.trackFromFile(file);
      const cueCount = SubtleCues.parseTimedText(uploadedTrack.text).length;
      if (!cueCount) throw new Error("No timed subtitle cues were found in that file.");
      update({ uploadedTrack, secondarySource: "upload" });
      elements.subtitleFile.value = "";
    } catch (error) {
      elements.sourceNote.textContent = error.message;
      elements.sourceNote.classList.add("is-error");
    }
  }

  async function refreshPageStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      pageStatus = await chrome.tabs.sendMessage(tab.id, { type: "GET_SUBTLE_STATUS" });
    } catch (_error) {
      pageStatus = null;
    }
    elements.siteStatus.classList.toggle("is-ready", Boolean(pageStatus?.playerFound));
    elements.platform.textContent = pageStatus?.platform || "Open YouTube or Netflix";
    elements.statusDetail.textContent = pageStatus?.playerFound
      ? (pageStatus.error || (pageStatus.nativeCaptionsFound ? "captions detected" : "player ready"))
      : "waiting for a player";
    renderSourceControls();
    renderSourceStatus();
  }

  function queueSave() {
    clearTimeout(saveTimer);
    elements.saveStatus.textContent = "Saving…";
    saveTimer = setTimeout(() => saveNow().catch(showError), 160);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    await chrome.storage.local.set({ [SubtleState.STORAGE_KEY]: state });
    elements.saveStatus.textContent = "Saved";
    setTimeout(() => { elements.saveStatus.textContent = ""; }, 900);
  }

  function showError(error) {
    elements.saveStatus.textContent = error?.message || "Unable to save settings.";
  }

  return { start };
});
