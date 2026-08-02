const test = require("node:test");
const assert = require("node:assert/strict");

const LearnTabClient = require("../lib/learn-tab-client.js");
const Transcript = require("../lib/transcript.js");

test("state-changing Learn commands are not sent after the active video changes", async () => {
  const messages = [];
  let tabId = 7;
  let source = sourceSnapshot();
  const client = LearnTabClient.create({
    tabs: {
      async query() { return [{ id: tabId }]; },
      async sendMessage(_tabId, message) {
        messages.push(message);
        if (message.type === "GET_SUBTLE_LEARN_CONTEXT") {
          return { ok: true, contentKey: source.contentKey, identity: identityFor(source) };
        }
        return { ok: true, contentKey: source.contentKey };
      }
    }
  });
  const expectedIdentity = { ...identityFor(source), tabId: 7 };
  const translated = translatedSnapshot();

  tabId = 8;
  await assert.rejects(() => client.applyTranslation(translated, expectedIdentity), { code: "stale_content" });
  tabId = 7;
  source = { ...source, platformId: "netflix" };
  await assert.rejects(() => client.clearTranslation(expectedIdentity), { code: "stale_content" });
  source = { ...sourceSnapshot(), cues: [{ start: 1, end: 2, text: "Replacement track" }] };
  await assert.rejects(() => client.seek(42, expectedIdentity), { code: "stale_content" });

  assert.deepEqual(
    messages.filter((message) => message.type !== "GET_SUBTLE_LEARN_CONTEXT"),
    []
  );
});

test("Learn commands send the pinned source identity to the original active tab", async () => {
  const messages = [];
  const source = sourceSnapshot();
  const expectedIdentity = { ...identityFor(source), tabId: 7 };
  const client = LearnTabClient.create({
    tabs: {
      async query() { return [{ id: 7 }]; },
      async sendMessage(_tabId, message) {
        messages.push(message);
        if (message.type === "GET_SUBTLE_LEARN_CONTEXT") {
          return { ok: true, contentKey: source.contentKey, identity: identityFor(source) };
        }
        return { ok: true, contentKey: source.contentKey };
      }
    }
  });

  await client.applyTranslation(translatedSnapshot(), expectedIdentity);

  const apply = messages.find((message) => message.type === "APPLY_SUBTLE_AI_TRANSLATION");
  assert.deepEqual(apply.sourceIdentity, identityFor(source));
  assert.equal("tabId" in apply.sourceIdentity, false);
});

function sourceSnapshot() {
  return {
    contentKey: "video-1",
    platformId: "youtube",
    languageCode: "en",
    cues: [{ start: 1, end: 2, text: "Hello" }]
  };
}

function translatedSnapshot() {
  return {
    contentKey: "video-1",
    platformId: "youtube",
    languageCode: "es",
    cues: [{ start: 1, end: 2, text: "Hola" }]
  };
}

function identityFor(snapshot) {
  return Transcript.identityFor(snapshot);
}
