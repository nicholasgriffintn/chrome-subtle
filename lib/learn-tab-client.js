(function exposeSubtleLearnTabClient(root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("./transcript.js") : root.SubtleTranscript
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleLearnTabClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleLearnTabClient(SubtleTranscript) {
  "use strict";

  function create(chromeApi) {
    if (!chromeApi?.tabs) throw new TypeError("Chrome tabs API is required.");

    async function getTranscript() {
      return receiveFromActive({ type: "GET_SUBTLE_TRANSCRIPT" });
    }

    async function getContext() {
      return receiveFromActive({ type: "GET_SUBTLE_LEARN_CONTEXT" });
    }

    async function applyTranslation(snapshot, expectedIdentity) {
      await assertCurrentContent(expectedIdentity);
      const response = await send({
        type: "APPLY_SUBTLE_AI_TRANSLATION",
        sourceIdentity: runtimeIdentity(expectedIdentity),
        snapshot
      }, expectedIdentity.tabId);
      if (!response?.ok) throw clientError("apply_failed", response?.error || "The translated captions could not be shown.");
      return response;
    }

    async function clearTranslation(expectedIdentity) {
      await assertCurrentContent(expectedIdentity);
      const response = await send({
        type: "CLEAR_SUBTLE_AI_TRANSLATION",
        sourceIdentity: runtimeIdentity(expectedIdentity)
      }, expectedIdentity.tabId);
      if (!response?.ok) throw clientError("clear_failed", response?.error || "The translated captions could not be cleared.");
      return response;
    }

    async function seek(seconds, expectedIdentity) {
      await assertCurrentContent(expectedIdentity);
      const response = await send({
        type: "SEEK_SUBTLE_VIDEO",
        sourceIdentity: runtimeIdentity(expectedIdentity),
        seconds
      }, expectedIdentity.tabId);
      if (!response?.ok) throw clientError("seek_failed", response?.error || "The video could not be moved to that caption.");
      return response;
    }

    async function assertCurrentContent(expectedIdentity) {
      const current = await getContext();
      if (
        !Number.isInteger(expectedIdentity?.tabId)
        || current?.identity?.tabId !== expectedIdentity.tabId
        || !SubtleTranscript.sameIdentity(current.identity, expectedIdentity)
      ) {
        throw clientError("stale_content", "The active video changed. Refresh Learn and try again.");
      }
      return current;
    }

    async function receiveFromActive(message) {
      const { tabId, response } = await sendWithTab(message);
      if (!response?.identity) throw clientError("invalid_response", "Subtle could not identify the active caption track.");
      return { ...response, identity: { ...response.identity, tabId } };
    }

    async function send(message, expectedTabId) {
      return (await sendWithTab(message, expectedTabId)).response;
    }

    async function sendWithTab(message, expectedTabId) {
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(tab?.id)) throw clientError("no_active_tab", "Open a supported video and try again.");
      if (Number.isInteger(expectedTabId) && tab.id !== expectedTabId) {
        throw clientError("stale_content", "The active video changed. Refresh Learn and try again.");
      }
      try {
        const response = await chromeApi.tabs.sendMessage(tab.id, message);
        if (!response) throw new Error("No response");
        return { tabId: tab.id, response };
      } catch (error) {
        if (error?.code) throw error;
        throw clientError("runtime_unavailable", "Subtle is not active on this tab. Enable site access from the popup first.");
      }
    }

    return { getTranscript, getContext, applyTranslation, clearTranslation, seek };
  }

  function clientError(code, message) {
    const error = new Error(message);
    error.name = "SubtleLearnTabError";
    error.code = code;
    return error;
  }

  function runtimeIdentity(identity) {
    return {
      platformId: identity?.platformId,
      contentKey: identity?.contentKey,
      languageCode: identity?.languageCode,
      transcriptFingerprint: identity?.transcriptFingerprint
    };
  }

  return { create, clientError };
});
