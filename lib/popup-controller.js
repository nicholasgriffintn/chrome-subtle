(function exposeSubtlePopup(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePopup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtlePopup() {
  "use strict";

  const elements = {
    enabled: document.querySelector("#enabled"),
    power: document.querySelector(".power"),
    fullPopup: document.querySelector("#full-popup"),
    limitedView: document.querySelector("#limited-view"),
    limitedEyebrow: document.querySelector("#limited-eyebrow"),
    limitedTitle: document.querySelector("#limited-title"),
    limitedDetail: document.querySelector("#limited-detail"),
    primaryPreview: document.querySelector("#primary-preview"),
    secondaryPreview: document.querySelector("#secondary-preview"),
    stage: document.querySelector(".stage"),
    previewWindow: document.querySelector(".preview-window"),
    previewLines: document.querySelector(".preview-lines"),
    siteStatus: document.querySelector("#site-status"),
    platform: document.querySelector("#platform"),
    statusDetail: document.querySelector("#status-detail"),
    enableSite: document.querySelector("#enable-site"),
    sourcePanel: document.querySelector(".source-panel"),
    source: document.querySelector("#secondary-source"),
    platformSourceOption: document.querySelector("#platform-source-option"),
    languageField: document.querySelector("#language-field"),
    languageLabel: document.querySelector("#language-label"),
    targetLanguage: document.querySelector("#target-language"),
    uploadRow: document.querySelector("#upload-row"),
    subtitleFile: document.querySelector("#subtitle-file"),
    uploadLabel: document.querySelector("#upload-label"),
    clearUpload: document.querySelector("#clear-upload"),
    sourceNote: document.querySelector("#source-note"),
    cueCount: document.querySelector("#cue-count"),
    presetGrid: document.querySelector("#preset-grid"),
    fontSize: document.querySelector("#font-size"),
    fontSizeOutput: document.querySelector("#font-size-output"),
    secondaryScale: document.querySelector("#secondary-scale"),
    secondaryScaleOutput: document.querySelector("#secondary-scale-output"),
    fontWeight: document.querySelector("#font-weight"),
    lineHeight: document.querySelector("#line-height"),
    lineHeightOutput: document.querySelector("#line-height-output"),
    letterSpacing: document.querySelector("#letter-spacing"),
    letterSpacingOutput: document.querySelector("#letter-spacing-output"),
    textAlign: document.querySelector("#text-align"),
    textOpacity: document.querySelector("#text-opacity"),
    textOpacityOutput: document.querySelector("#text-opacity-output"),
    backgroundOpacity: document.querySelector("#background-opacity"),
    backgroundOutput: document.querySelector("#background-output"),
    windowOpacity: document.querySelector("#window-opacity"),
    windowOpacityOutput: document.querySelector("#window-opacity-output"),
    fontFamily: document.querySelector("#font-family"),
    edgeStyle: document.querySelector("#edge-style"),
    outlineWidth: document.querySelector("#outline-width"),
    outlineWidthOutput: document.querySelector("#outline-width-output"),
    position: document.querySelector("#position"),
    offset: document.querySelector("#offset"),
    offsetOutput: document.querySelector("#offset-output"),
    followNativePosition: document.querySelector("#follow-native-position"),
    youtubePositionControls: document.querySelector("#youtube-position-controls"),
    shortsSettings: document.querySelector("#shorts-settings"),
    shortsStatus: document.querySelector("#shorts-status"),
    shortsOptimised: document.querySelector("#shorts-optimised"),
    shortsScale: document.querySelector("#shorts-scale"),
    shortsScaleOutput: document.querySelector("#shorts-scale-output"),
    shortsWidth: document.querySelector("#shorts-width"),
    shortsWidthOutput: document.querySelector("#shorts-width-output"),
    shortsOffset: document.querySelector("#shorts-offset"),
    shortsOffsetOutput: document.querySelector("#shorts-offset-output"),
    movieLike: document.querySelector("#movie-like"),
    movieWidth: document.querySelector("#movie-width"),
    movieWidthOutput: document.querySelector("#movie-width-output"),
    readabilityMode: document.querySelector("#readability-mode"),
    primaryColourField: document.querySelector("#primary-colour-field"),
    bbcColourNote: document.querySelector("#bbc-colour-note"),
    textColour: document.querySelector("#text-colour"),
    secondaryColour: document.querySelector("#secondary-colour"),
    backgroundColour: document.querySelector("#background-colour"),
    windowColour: document.querySelector("#window-colour"),
    strokeColour: document.querySelector("#stroke-colour"),
    strokeOpacity: document.querySelector("#stroke-opacity"),
    strokeOpacityOutput: document.querySelector("#stroke-opacity-output"),
    shadowIntensity: document.querySelector("#shadow-intensity"),
    shadowIntensityOutput: document.querySelector("#shadow-intensity-output"),
    backgroundBlur: document.querySelector("#background-blur"),
    backgroundBlurOutput: document.querySelector("#background-blur-output"),
    captionPadding: document.querySelector("#caption-padding"),
    captionPaddingOutput: document.querySelector("#caption-padding-output"),
    captionRadius: document.querySelector("#caption-radius"),
    captionRadiusOutput: document.querySelector("#caption-radius-output"),
    delay: document.querySelector("#delay"),
    delayOutput: document.querySelector("#delay-output"),
    hideSoundCues: document.querySelector("#hide-sound-cues"),
    blockMusic: document.querySelector("#block-music"),
    blockSpeakerLabels: document.querySelector("#block-speaker-labels"),
    customBlockedTerms: document.querySelector("#custom-blocked-terms"),
    reset: document.querySelector("#reset"),
    saveStatus: document.querySelector("#save-status")
  };

  let state = SubtleState.createDefaultState();
  let pageStatus = null;
  let activeTabId;
  let activePlatform = null;
  let activeSitePermission = { origins: [] };
  let activeSurface = "video";
  let siteAccessGranted = false;
  let stateStore;
  let previewFitFrame;
  async function start() {
    const stored = await chrome.storage.local.get(SubtleState.STORAGE_KEY);
    state = SubtleState.normaliseState(stored[SubtleState.STORAGE_KEY]);
    stateStore = SubtlePopupStateStore.create({
      storageArea: chrome.storage.local,
      storageKey: SubtleState.STORAGE_KEY,
      onStatus: (status) => { elements.saveStatus.textContent = status; }
    });
    SubtlePopupTabs.create(document.querySelector(".settings-tabs"));
    renderPresets();
    bindEvents();
    render();
    await refreshPageStatus();
  }

  function bindEvents() {
    bindMainEvents();
    bindStyleEvents();
    bindCustomEvents();
    bindActions();
    chrome.runtime.onMessage.addListener(handleRuntimeStatus);
    window.addEventListener("pagehide", flushState, { once: true });
  }

  function bindMainEvents() {
    elements.enabled.addEventListener("change", () => updateAndSave({ enabled: elements.enabled.checked }));
    elements.enableSite.addEventListener("click", enableCurrentSite);
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => updateAndSave({ mode: button.dataset.mode }));
    });
    elements.source.addEventListener("change", () => updateAndSave({ secondarySource: elements.source.value }));
    elements.targetLanguage.addEventListener("change", () => updateAndSave({ targetLanguage: elements.targetLanguage.value }));
    elements.position.addEventListener("change", () => updateAndSave({ position: elements.position.value }));
    elements.followNativePosition.addEventListener("change", () => updateAndSave({ followNativePosition: elements.followNativePosition.checked }));
    elements.movieLike.addEventListener("change", () => updateAndSave({ movieLike: elements.movieLike.checked }));
    elements.readabilityMode.addEventListener("change", () => updateAndSave({ readabilityMode: elements.readabilityMode.checked }));
    elements.shortsOptimised.addEventListener("change", () => updateAndSave({ shortsOptimised: elements.shortsOptimised.checked }));
    bindContinuousNumber(elements.offset, "offset");
    bindContinuousNumber(elements.movieWidth, "movieWidth");
    bindContinuousNumber(elements.shortsScale, "shortsScale");
    bindContinuousNumber(elements.shortsWidth, "shortsWidth");
    bindContinuousNumber(elements.shortsOffset, "shortsOffset");
  }

  function bindStyleEvents() {
    for (const [element, key] of [
      [elements.fontSize, "fontSize"], [elements.secondaryScale, "secondaryScale"],
      [elements.lineHeight, "lineHeight"], [elements.letterSpacing, "letterSpacing"],
      [elements.textOpacity, "textOpacity"], [elements.strokeOpacity, "strokeOpacity"],
      [elements.backgroundOpacity, "backgroundOpacity"], [elements.windowOpacity, "windowOpacity"],
      [elements.outlineWidth, "outlineWidth"], [elements.shadowIntensity, "shadowIntensity"],
      [elements.backgroundBlur, "backgroundBlur"], [elements.captionPadding, "captionPadding"],
      [elements.captionRadius, "captionRadius"]
    ]) bindContinuousNumber(element, key);
    for (const [element, key] of [
      [elements.textColour, "textColor"], [elements.secondaryColour, "secondaryColor"],
      [elements.backgroundColour, "backgroundColor"], [elements.windowColour, "windowColor"],
      [elements.strokeColour, "strokeColor"]
    ]) bindContinuousValue(element, key);
    for (const [element, key] of [
      [elements.fontFamily, "fontFamily"], [elements.edgeStyle, "edgeStyle"], [elements.textAlign, "textAlign"]
    ]) element.addEventListener("change", () => updateAndSave({ [key]: element.value }));
    elements.fontWeight.addEventListener("change", () => updateAndSave({ fontWeight: Number(elements.fontWeight.value) }));
  }

  function bindCustomEvents() {
    elements.delay.addEventListener("input", () => updateSoon({ delayMs: Number(elements.delay.value) }));
    elements.customBlockedTerms.addEventListener("input", () => updateSoon({ customBlockedTerms: elements.customBlockedTerms.value }));
    for (const [element, key] of [
      [elements.hideSoundCues, "hideSoundCues"], [elements.blockMusic, "blockMusic"],
      [elements.blockSpeakerLabels, "blockSpeakerLabels"]
    ]) element.addEventListener("change", () => updateAndSave({ [key]: element.checked }));
    elements.delay.addEventListener("change", flushState);
    elements.customBlockedTerms.addEventListener("change", flushState);
  }

  function bindActions() {
    elements.subtitleFile.addEventListener("change", importSubtitleFile);
    elements.clearUpload.addEventListener("click", () => updateAndSave({ uploadedTrack: null }));
    elements.reset.addEventListener("click", () => {
      if (!window.confirm("Reset all settings and remove the imported subtitle file?")) return;
      state = SubtleState.createDefaultState();
      render();
      stateStore.save(state).catch(() => {});
    });
    elements.presetGrid.addEventListener("click", (event) => {
      const preset = SubtlePresets.find(event.target.closest?.("[data-preset]")?.dataset.preset);
      if (preset) updateAndSave(preset.patch);
    });
  }

  function bindContinuousNumber(element, key) {
    element.addEventListener("input", () => updateSoon({ [key]: Number(element.value) }));
    element.addEventListener("change", flushState);
  }

  function bindContinuousValue(element, key) {
    element.addEventListener("input", () => updateSoon({ [key]: element.value }));
    element.addEventListener("change", flushState);
  }

  function update(patch) {
    state = SubtleState.withPatch(state, patch);
    render();
  }

  function updateSoon(patch) {
    update(patch);
    stateStore.queue(state);
  }

  function updateAndSave(patch) {
    update(patch);
    stateStore.save(state).catch(() => {});
  }

  function flushState() {
    stateStore.flush().catch(() => {});
  }

  function render() {
    elements.enabled.checked = state.enabled;
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === state.mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    });
    elements.sourcePanel.hidden = state.mode !== "dual";
    elements.secondaryPreview.hidden = state.mode !== "dual";
    renderSource();
    elements.uploadLabel.textContent = state.uploadedTrack?.name || "Import subtitle file";
    elements.clearUpload.disabled = !state.uploadedTrack;
    renderControls();
    renderPreview();
  }

  function renderControls() {
    renderTypographyControls();
    renderPlacementControls();
    renderPlatformControls();
    renderSurfaceControls();
    renderCustomControls();
  }

  function renderTypographyControls() {
    elements.fontSize.value = String(state.fontSize);
    elements.fontSizeOutput.value = `${state.fontSize} px`;
    elements.secondaryScale.value = String(state.secondaryScale);
    elements.secondaryScaleOutput.value = `${state.secondaryScale}%`;
    elements.fontWeight.value = String(state.fontWeight);
    elements.lineHeight.value = String(state.lineHeight);
    elements.lineHeightOutput.value = state.lineHeight.toFixed(2).replace(/0$/, "");
    elements.letterSpacing.value = String(state.letterSpacing);
    elements.letterSpacingOutput.value = `${state.letterSpacing} px`;
    elements.textAlign.value = state.textAlign;
    elements.fontFamily.value = state.fontFamily;
  }

  function renderSurfaceControls() {
    elements.textOpacity.value = String(state.textOpacity);
    elements.textOpacityOutput.value = `${state.textOpacity}%`;
    elements.backgroundOpacity.value = String(state.backgroundOpacity);
    elements.backgroundOutput.value = `${state.backgroundOpacity}%`;
    elements.windowOpacity.value = String(state.windowOpacity);
    elements.windowOpacityOutput.value = `${state.windowOpacity}%`;
    elements.edgeStyle.value = state.edgeStyle;
    elements.outlineWidth.value = String(state.outlineWidth);
    elements.outlineWidthOutput.value = `${state.outlineWidth} px`;
    elements.textColour.value = state.textColor;
    elements.secondaryColour.value = state.secondaryColor;
    elements.backgroundColour.value = state.backgroundColor;
    elements.windowColour.value = state.windowColor;
    elements.strokeColour.value = state.strokeColor;
    elements.strokeOpacity.value = String(state.strokeOpacity);
    elements.strokeOpacityOutput.value = `${state.strokeOpacity}%`;
    elements.shadowIntensity.value = String(state.shadowIntensity);
    elements.shadowIntensityOutput.value = String(state.shadowIntensity);
    elements.backgroundBlur.value = String(state.backgroundBlur);
    elements.backgroundBlurOutput.value = `${state.backgroundBlur} px`;
    elements.captionPadding.value = String(state.captionPadding);
    elements.captionPaddingOutput.value = `${state.captionPadding} px`;
    elements.captionRadius.value = String(state.captionRadius);
    elements.captionRadiusOutput.value = `${state.captionRadius} px`;
  }

  function renderPlacementControls() {
    elements.position.value = state.position;
    elements.position.disabled = state.followNativePosition;
    elements.offset.value = String(state.offset);
    elements.offsetOutput.value = `${state.offset}%`;
    elements.offset.disabled = state.followNativePosition;
    elements.followNativePosition.checked = state.followNativePosition;
    elements.movieLike.checked = state.movieLike;
    elements.movieWidth.value = String(state.movieWidth);
    elements.movieWidthOutput.value = `${state.movieWidth} ch`;
    elements.movieWidth.disabled = !state.movieLike;
    elements.readabilityMode.checked = state.readabilityMode;
  }

  function renderPlatformControls() {
    const view = SubtleCaptionSettings.platformView(activePlatform, { ...pageStatus, surface: activeSurface });
    const preservesNativeColour = activePlatform?.id === "bbc";
    elements.primaryColourField.hidden = preservesNativeColour;
    elements.bbcColourNote.hidden = !preservesNativeColour;
    elements.youtubePositionControls.hidden = !view.showYouTubePosition;
    elements.shortsSettings.hidden = !view.showShortsSettings;
    elements.shortsStatus.textContent = view.shortsStatus;
    elements.shortsOptimised.checked = state.shortsOptimised;
    elements.shortsScale.value = String(state.shortsScale);
    elements.shortsScaleOutput.value = `${state.shortsScale}%`;
    elements.shortsWidth.value = String(state.shortsWidth);
    elements.shortsWidthOutput.value = `${state.shortsWidth}%`;
    elements.shortsOffset.value = String(state.shortsOffset);
    elements.shortsOffsetOutput.value = `${state.shortsOffset}%`;
    elements.shortsScale.disabled = !state.shortsOptimised;
    elements.shortsWidth.disabled = !state.shortsOptimised;
    elements.shortsOffset.disabled = !state.shortsOptimised || state.followNativePosition;
  }

  function renderCustomControls() {
    elements.delay.value = String(state.delayMs);
    elements.delayOutput.value = `${state.delayMs} ms`;
    elements.hideSoundCues.checked = state.hideSoundCues;
    elements.blockMusic.checked = state.blockMusic;
    elements.blockSpeakerLabels.checked = state.blockSpeakerLabels;
    if (elements.customBlockedTerms.value !== state.customBlockedTerms) {
      elements.customBlockedTerms.value = state.customBlockedTerms;
    }
  }

  function renderPresets() {
    const buttons = Object.entries(SubtlePresets.all()).map(([id, preset]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.preset = id;
      button.textContent = preset.label;
      button.style.setProperty("--preset-accent", preset.patch.secondaryColor);
      return button;
    });
    elements.presetGrid.replaceChildren(...buttons);
  }

  function renderSource() {
    const view = SubtleCaptionSettings.sourceView(state, pageStatus, activePlatform?.id);
    elements.platformSourceOption.textContent = view.platformSourceLabel;
    elements.platformSourceOption.disabled = view.platformSourceDisabled;
    elements.source.disabled = false;
    elements.source.value = view.secondarySource;
    elements.languageField.hidden = !view.showLanguage;
    elements.uploadRow.hidden = !view.showUpload;
    if (view.showLanguage) {
      replaceLanguageOptions(view.languageOptions);
      elements.languageLabel.textContent = view.languageLabel;
      elements.targetLanguage.disabled = view.languageDisabled;
      elements.targetLanguage.value = view.selectedLanguage;
    }
    elements.cueCount.textContent = view.cueCount;
    elements.sourceNote.classList.remove("is-error");
    elements.sourceNote.textContent = view.note;
  }

  function replaceLanguageOptions(options) {
    const signature = JSON.stringify(options);
    if (elements.targetLanguage.dataset.options === signature) return;
    elements.targetLanguage.replaceChildren(...options.map((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      return option;
    }));
    elements.targetLanguage.dataset.options = signature;
  }

  function renderPreview() {
    const preview = elements.previewWindow;
    const previewState = SubtleState.effectiveSurfaceState(
      state,
      activePlatform?.id === "youtube" ? activeSurface : "video"
    );
    const type = SubtleOverlay.typography(previewState);
    const edge = SubtleOverlay.edgeTreatment(
      previewState.edgeStyle,
      Math.max(1, Math.round(previewState.outlineWidth / 2)),
      previewState.strokeColor,
      previewState.strokeOpacity,
      previewState.shadowIntensity
    );
    preview.classList.toggle("is-movie-like", previewState.movieLike);
    preview.classList.toggle("is-shorts", previewState.surface === "shorts" && previewState.shortsOptimised);
    preview.classList.toggle("is-top", activePlatform?.id === "youtube" && !previewState.followNativePosition && previewState.position === "top");
    preview.style.setProperty("--preview-font", SubtleOverlay.fontStack(type.fontFamily));
    preview.style.setProperty("--preview-variant", SubtleOverlay.fontVariant(type.fontFamily));
    preview.style.setProperty("--preview-weight", String(type.fontWeight));
    preview.style.setProperty("--preview-line-height", String(type.lineHeight));
    preview.style.setProperty("--preview-letter-spacing", `${type.letterSpacing}px`);
    const alignment = previewState.textAlign === "auto" ? "center" : previewState.textAlign;
    preview.style.setProperty("--preview-align", alignment);
    preview.style.setProperty("--preview-justify", alignment === "left" ? "start" : alignment === "right" ? "end" : "center");
    preview.style.setProperty("--preview-row-gap", `${Math.max(3, Math.ceil(SubtleOverlay.captionRowGap(previewState) / 2))}px`);
    preview.style.setProperty("--preview-padding", `${Math.max(2, previewState.captionPadding / 2)}px`);
    preview.style.setProperty("--preview-radius", `${previewState.captionRadius}px`);
    preview.style.setProperty("--preview-blur", `${previewState.backgroundBlur}px`);
    preview.style.setProperty("--preview-max-width", `${Math.round(previewState.movieWidth * 6)}px`);
    preview.style.setProperty("--preview-shorts-width", `${previewState.shortsWidth}%`);
    preview.style.setProperty("--preview-primary-size", `${Math.min(23, Math.max(13, previewState.fontSize * 0.48))}px`);
    preview.style.setProperty("--preview-secondary-size", `${Math.min(19, Math.max(12, previewState.fontSize * previewState.secondaryScale / 210))}px`);
    preview.style.setProperty("--preview-primary", SubtleOverlay.hexToRgba(previewState.textColor, previewState.textOpacity));
    preview.style.setProperty("--preview-secondary", SubtleOverlay.hexToRgba(previewState.secondaryColor, previewState.textOpacity));
    preview.style.setProperty("--preview-bg", SubtleOverlay.hexToRgba(previewState.backgroundColor, previewState.backgroundOpacity));
    preview.style.setProperty("--preview-window", SubtleOverlay.hexToRgba(previewState.windowColor, previewState.windowOpacity));
    preview.style.setProperty("--preview-stroke", edge.stroke);
    preview.style.setProperty("--preview-shadow", edge.shadow);
    schedulePreviewFit();
  }

  function schedulePreviewFit() {
    if (previewFitFrame) cancelAnimationFrame(previewFitFrame);
    previewFitFrame = requestAnimationFrame(() => {
      previewFitFrame = undefined;
      SubtlePreviewLayout.fit(elements.stage, elements.previewWindow, elements.previewLines);
    });
  }

  async function importSubtitleFile() {
    const file = elements.subtitleFile.files?.[0];
    try {
      const uploadedTrack = await SubtleImports.trackFromFile(file);
      const cueCount = SubtleCues.parseTimedText(uploadedTrack.text).length;
      if (!cueCount) throw new Error("No timed subtitle cues were found in that file.");
      updateAndSave({ uploadedTrack, secondarySource: "upload" });
    } catch (error) {
      elements.sourceNote.textContent = error?.message || "That subtitle file could not be imported.";
      elements.sourceNote.classList.add("is-error");
    } finally {
      elements.subtitleFile.value = "";
    }
  }

  async function refreshPageStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    activeTabId = tab.id;
    activePlatform = SubtleSiteAccess.forUrl(tab.url);
    activeSitePermission = SubtleSiteAccess.permissionFor(activePlatform, tab.url);
    activeSurface = activePlatform?.id === "youtube" ? SubtleState.surfaceForUrl(tab.url) : "video";
    updatePreviewBackground(tab.windowId, Boolean(activePlatform));
    siteAccessGranted = activePlatform
      ? await chrome.permissions.contains(activeSitePermission)
      : false;
    if (!siteAccessGranted) {
      pageStatus = null;
      renderPageStatus();
      return;
    }
    await syncSiteRegistrations();
    try {
      pageStatus = await chrome.tabs.sendMessage(tab.id, { type: "GET_SUBTLE_STATUS" });
    } catch (_error) {
      pageStatus = null;
    }
    renderPageStatus();
  }

  async function updatePreviewBackground(windowId, supportedPage) {
    const image = supportedPage ? await SubtlePreviewBackground.capture(chrome.tabs, windowId) : null;
    if (image) elements.stage.style.setProperty("--preview-image", `url("${image}")`);
    else elements.stage.style.removeProperty("--preview-image");
  }

  function handleRuntimeStatus(message, sender) {
    if (message?.type !== "SUBTLE_STATUS" || sender.tab?.id !== activeTabId) return;
    pageStatus = message.status;
    activeSurface = pageStatus?.surface || activeSurface;
    renderPageStatus();
  }

  function renderPageStatus() {
    const accessView = SubtlePopupAccess.view(activePlatform, siteAccessGranted);
    const showFullPopup = accessView.kind === "full";
    elements.fullPopup.hidden = !showFullPopup;
    elements.limitedView.hidden = showFullPopup;
    elements.power.hidden = !showFullPopup;
    if (!showFullPopup) {
      elements.limitedEyebrow.textContent = accessView.eyebrow;
      elements.limitedTitle.textContent = accessView.title;
      elements.limitedDetail.textContent = accessView.detail;
      elements.enableSite.hidden = accessView.kind !== "request";
      elements.enableSite.textContent = accessView.action || "";
      return;
    }
    elements.siteStatus.classList.toggle("is-ready", Boolean(pageStatus?.playerFound));
    elements.platform.textContent = pageStatus?.platform || activePlatform?.label || "Open a supported video site";
    elements.statusDetail.textContent = pageStatus?.playerFound
      ? (pageStatus.error || (pageStatus.nativeCaptionsFound ? "captions detected" : "player ready"))
      : "waiting for a player";
    renderPlatformControls();
    renderPreview();
    renderSource();
  }

  function showStartError() {
    const view = SubtlePopupAccess.errorView();
    elements.fullPopup.hidden = true;
    elements.limitedView.hidden = false;
    elements.power.hidden = true;
    elements.limitedEyebrow.textContent = view.eyebrow;
    elements.limitedTitle.textContent = view.title;
    elements.limitedDetail.textContent = view.detail;
    elements.enableSite.hidden = true;
  }

  async function enableCurrentSite() {
    if (!activePlatform || !activeTabId) return;
    elements.enableSite.disabled = true;
    try {
      const granted = await chrome.permissions.request(activeSitePermission);
      if (!granted) {
        elements.limitedDetail.textContent = "Chrome did not grant access. You can try again when you’re ready.";
        return;
      }
      siteAccessGranted = true;
      elements.enableSite.textContent = "Enabled — reloading…";
      await syncSiteRegistrations();
      await chrome.tabs.reload(activeTabId);
      window.close();
    } catch (error) {
      elements.limitedDetail.textContent = error?.message || "Unable to enable this site.";
    } finally {
      elements.enableSite.disabled = false;
    }
  }

  async function syncSiteRegistrations() {
    const result = await chrome.runtime.sendMessage({ type: "SYNC_SUBTLE_SITE_ACCESS" });
    if (!result?.ok) throw new Error(result?.error || "Unable to enable this site.");
  }

  return { start, showStartError };
});
