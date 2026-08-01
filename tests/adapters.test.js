const test = require("node:test");
const assert = require("node:assert/strict");
const SubtitleAdapters = require("../lib/adapters.js");

test("supported hostnames map to explicit site adapters", () => {
  assert.equal(SubtitleAdapters.forHostname("www.youtube.com").id, "youtube");
  assert.equal(SubtitleAdapters.forHostname("www.netflix.com").id, "netflix");
  assert.equal(SubtitleAdapters.forHostname("evil-youtube.com"), null);
});

test("YouTube selectors prefer a player-contained video", () => {
  const inside = { id: "inside" };
  const outside = { id: "outside" };
  const player = { querySelector: () => inside };
  const root = {
    querySelector(selector) {
      if (selector === "#movie_player") return player;
      if (selector.includes("video")) return outside;
      return null;
    }
  };

  assert.equal(SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.youtube, root), inside);
});

test("YouTube selects the Shorts player only on Shorts routes", () => {
  const movie = { id: "movie" };
  const shorts = { id: "shorts" };
  const root = {
    querySelector(selector) {
      if (selector === "#movie_player") return movie;
      if (selector === "#shorts-player") return shorts;
      return null;
    }
  };

  assert.equal(
    SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.youtube, root, { pathname: "/watch" }),
    movie
  );
  assert.equal(
    SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.youtube, root, { pathname: "/shorts/abc" }),
    shorts
  );
});

test("Netflix ignores a playing billboard and matches the title video", () => {
  const billboard = videoCandidate({ paused: false, closest: "billboard", area: 1920 * 1080 });
  const title = videoCandidate({ paused: true, area: 1280 * 720 });
  const root = { querySelectorAll: () => [billboard, title] };

  assert.equal(SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.netflix, root), title);
});

test("Netflix derives an overlay host when legacy player wrappers are absent", () => {
  const parent = { id: "video-parent" };
  const video = videoCandidate({ paused: false, parent });
  const root = { querySelectorAll: () => [video] };

  assert.equal(
    SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.netflix, root, { video }),
    parent
  );
});

test("Netflix does not attach to disconnected or ended videos", () => {
  const disconnected = videoCandidate({ paused: false });
  disconnected.isConnected = false;
  const ended = videoCandidate({ paused: false });
  ended.ended = true;

  assert.equal(
    SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.netflix, { querySelectorAll: () => [disconnected, ended] }),
    null
  );
});

test("video mutations trigger rematching while unrelated subtitle mutations do not", () => {
  const video = { nodeName: "VIDEO" };
  const container = { nodeName: "DIV", querySelector: (selector) => selector === "video" ? video : null };
  const caption = { nodeName: "SPAN", querySelector: () => null };

  assert.equal(SubtitleAdapters.mutationsContainVideo([{ addedNodes: [container], removedNodes: [] }]), true);
  assert.equal(SubtitleAdapters.mutationsContainVideo([{ addedNodes: [caption], removedNodes: [] }]), false);
});

test("native caption discovery prefers the tight visible caption box", () => {
  const fullContainer = captionCandidate("full container");
  const captionWindow = captionCandidate("current caption");
  const root = {
    querySelectorAll(selector) {
      if (selector === ".caption-window") return [captionWindow];
      if (selector === ".ytp-caption-window-container") return [fullContainer];
      return [];
    }
  };

  assert.equal(
    SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.youtube, root),
    captionWindow
  );
});

test("native caption discovery ignores empty and hidden boxes", () => {
  const empty = captionCandidate("");
  const hidden = captionCandidate("old caption", { width: 0, height: 0 });
  const root = { querySelectorAll: () => [empty, hidden] };

  assert.equal(SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.netflix, root), null);
});

function videoCandidate({ paused, closest, area = 640 * 360, parent = null }) {
  return {
    isConnected: true,
    ended: false,
    paused,
    parentElement: parent,
    clientWidth: Math.sqrt(area),
    clientHeight: Math.sqrt(area),
    closest(selector) {
      if (closest === "billboard" && selector.includes("billboard")) return {};
      if (closest === "preview" && selector.includes("preview")) return {};
      return null;
    },
    getBoundingClientRect: () => ({ width: Math.sqrt(area), height: Math.sqrt(area) })
  };
}

function captionCandidate(text, rect = { width: 240, height: 44 }) {
  return {
    isConnected: true,
    textContent: text,
    getBoundingClientRect: () => rect,
    closest: () => null
  };
}
