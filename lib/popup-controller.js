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
    power: document.querySelector(".power"),
    fullPopup: document.querySelector("#full-popup"),
    limitedView: document.querySelector("#limited-view"),
    limitedEyebrow: document.querySelector("#limited-eyebrow"),
    limitedTitle: document.querySelector("#limited-title"),
    limitedDetail: document.querySelector("#limited-detail"),
    primaryPreview: document.querySelector("#primary-preview"),
    secondaryPreview: document.querySelector("#secondary-preview"),
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
  let activeTabId;
  let activePlatform = null;
  let siteAccessGranted = false;
  let stateStore;
  async function start() {
    const stored = await chrome.storage.local.get(SubtleState.STORAGE_KEY);
    state = SubtleState.normaliseState(stored[SubtleState.STORAGE_KEY]);
    stateStore = SubtlePopupStateStore.create({
      storageArea: chrome.storage.local,
      storageKey: SubtleState.STORAGE_KEY,
      onStatus: (status) => { elements.saveStatus.textContent = status; }
    });
    bindEvents();
    render();
    await refreshPageStatus();
  }

  function bindEvents() {
    elements.enabled.addEventListener("change", () => updateAndSave({ enabled: elements.enabled.checked }));
    elements.enableSite.addEventListener("click", enableCurrentSite);
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => updateAndSave({ mode: button.dataset.mode }));
    });
    elements.source.addEventListener("change", () => updateAndSave({ secondarySource: elements.source.value }));
    elements.targetLanguage.addEventListener("change", () => updateAndSave({ targetLanguage: elements.targetLanguage.value }));
    elements.fontSize.addEventListener("input", () => updateSoon({ fontSize: Number(elements.fontSize.value) }));
    elements.textOpacity.addEventListener("input", () => updateSoon({ textOpacity: Number(elements.textOpacity.value) }));
    elements.backgroundOpacity.addEventListener("input", () => updateSoon({ backgroundOpacity: Number(elements.backgroundOpacity.value) }));
    elements.windowOpacity.addEventListener("input", () => updateSoon({ windowOpacity: Number(elements.windowOpacity.value) }));
    elements.fontFamily.addEventListener("change", () => updateAndSave({ fontFamily: elements.fontFamily.value }));
    elements.edgeStyle.addEventListener("change", () => updateAndSave({ edgeStyle: elements.edgeStyle.value }));
    elements.position.addEventListener("change", () => updateAndSave({ position: elements.position.value }));
    elements.textColour.addEventListener("input", () => updateSoon({ textColor: elements.textColour.value }));
    elements.secondaryColour.addEventListener("input", () => updateSoon({ secondaryColor: elements.secondaryColour.value }));
    elements.backgroundColour.addEventListener("input", () => updateSoon({ backgroundColor: elements.backgroundColour.value }));
    elements.windowColour.addEventListener("input", () => updateSoon({ windowColor: elements.windowColour.value }));
    elements.delay.addEventListener("input", () => updateSoon({ delayMs: Number(elements.delay.value) }));
    elements.hideSoundCues.addEventListener("change", () => updateAndSave({ hideSoundCues: elements.hideSoundCues.checked }));
    chrome.runtime.onMessage.addListener(handleRuntimeStatus);
    elements.subtitleFile.addEventListener("change", importSubtitleFile);
    elements.clearUpload.addEventListener("click", () => updateAndSave({ uploadedTrack: null }));
    elements.reset.addEventListener("click", () => {
      state = SubtleState.createDefaultState();
      render();
      stateStore.save(state).catch(() => {});
    });
    document.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => updateAndSave(PRESETS[button.dataset.preset]));
    });
    [
      elements.fontSize,
      elements.textOpacity,
      elements.backgroundOpacity,
      elements.windowOpacity,
      elements.textColour,
      elements.secondaryColour,
      elements.backgroundColour,
      elements.windowColour,
      elements.delay
    ].forEach((element) => element.addEventListener("change", flushState));
    window.addEventListener("pagehide", flushState, { once: true });
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
  }

  function renderSource() {
    const view = SubtleCaptionSettings.sourceView(state, pageStatus);
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

  async function importSubtitleFile() {
    const file = elements.subtitleFile.files?.[0];
    try {
      const uploadedTrack = await SubtleImports.trackFromFile(file);
      const cueCount = SubtleCues.parseTimedText(uploadedTrack.text).length;
      if (!cueCount) throw new Error("No timed subtitle cues were found in that file.");
      updateAndSave({ uploadedTrack, secondarySource: "upload" });
      elements.subtitleFile.value = "";
    } catch (error) {
      elements.sourceNote.textContent = error.message;
      elements.sourceNote.classList.add("is-error");
    }
  }

  async function refreshPageStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    activeTabId = tab.id;
    activePlatform = SubtleSiteAccess.forUrl(tab.url);
    siteAccessGranted = activePlatform
      ? await chrome.permissions.contains(SubtleSiteAccess.permissionFor(activePlatform))
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

  function handleRuntimeStatus(message, sender) {
    if (message?.type !== "SUBTLE_STATUS" || sender.tab?.id !== activeTabId) return;
    pageStatus = message.status;
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
    elements.platform.textContent = pageStatus?.platform || activePlatform?.label || "Open YouTube or Netflix";
    elements.statusDetail.textContent = pageStatus?.playerFound
      ? (pageStatus.error || (pageStatus.nativeCaptionsFound ? "captions detected" : "player ready"))
      : "waiting for a player";
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
      const granted = await chrome.permissions.request(SubtleSiteAccess.permissionFor(activePlatform));
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
