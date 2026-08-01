# Subtle

Subtle makes captions easier to read on YouTube, Netflix, BBC iPlayer and Disney+. It styles each site's native captions and can add a synchronised second line from platform captions or a local SRT/VTT file.

![Subtle marquee Promo](/promos/marquee-1400x560.png)

## What it does

- Restyle native captions with nine presets, 18 local font choices, independent surface and edge controls, alignment, spacing, blur, size and manual height controls.
- Wrap long YouTube captions into a centred, movie-like reading block or retain the site's original line width.
- Keep YouTube's native draggable caption position by default; choose a manual top or bottom anchor only when you need an exact height.
- Optimise YouTube Shorts with an inherited style, smaller text scale, safe reading width and a separate vertical offset.
- Add a second caption language on YouTube when the video supplies that track.
- Add a second language supplied with the current Netflix title.
- Style Disney+ captions inside its player and add a second language supplied by the title's HLS caption tracks.
- Preserve BBC iPlayer's programme and speaker colours while changing typography, edges and caption surfaces.
- Add a local SRT or VTT second line on YouTube, Netflix, BBC iPlayer or Disney+.
- Keep the second line attached to the complete native caption group as Netflix moves dialogue around the frame.
- Shift imported captions forwards or backwards to correct timing.
- Filter sound descriptions, music cues, speaker labels and custom literal words or phrases when requested.
- Keep all preferences and imported files on the device.

![A screenshot of Subtle's popup on YouTube with a second caption line](/screenshots/screenshot.png)

## Install locally

1. Run `pnpm package` or use the `subtle.zip` download from the companion site.
2. Extract the ZIP.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** and select **Load unpacked**.
5. Choose the extracted extension directory.
6. Open YouTube, Netflix, BBC iPlayer or Disney+, then open Subtle and select **Enable Subtle on…**. Chrome grants only that service and reloads the tab once.

The companion site is in `website/`. Its download is a development preview; the extension has not yet been published to the Chrome Web Store.

## Privacy

Subtle processes the current playback time, native caption elements and the caption metadata already supplied to supported video pages. On YouTube, it reuses the player's caption request to ask YouTube for the selected translated track. On Netflix, it requests the selected title track from a Netflix-provided CDN URL inside the active tab. On Disney+, it reads the title's HLS subtitle manifest and assembles the selected WebVTT segments inside the active tab. BBC iPlayer support reads only the rendered caption DOM and does not use a page bridge. Platform track URLs and caption text are not written to extension storage.

When the popup opens on a supported page, it may capture one low-quality image of the visible tab for the local style preview. The image remains in popup memory only and is discarded when the popup closes; it is never stored or transmitted by Subtle.

Subtle has no accounts, analytics, advertising, remote scripts or translation service. Imported files are not uploaded. Site access is optional: Subtle requests the current supported service only when you select its enable button, and removes its registered scripts if that access is revoked. `activeTab` identifies the service opened with the toolbar button, `scripting` registers its local bridge and runtime, and `storage` keeps settings on-device.

Platform caption requests stay between the active tab and YouTube or Netflix infrastructure. Subtle does not send caption data to its own server or to an external translation provider. This privacy statement was last updated on 2 August 2026.

## Limitations

- Picture in Picture mode does not display subtitles. This is a limitation of the browser's implementation.
- YouTube second-language availability depends on the caption tracks supplied with each video.
- Netflix second-language availability depends on the tracks packaged with each title; Subtle does not machine-translate Netflix captions.
- Disney+ second-language availability depends on the HLS WebVTT tracks packaged with each title; forced-only and image-based tracks are not used.
- BBC iPlayer currently supports its native caption track and a local SRT/VTT second line; it does not expose a platform second-language selector in Subtle.
- YouTube's timed-text request and the Netflix and Disney+ player manifests are private interfaces and can change without notice.
- Netflix DFXP and IMSC tracks retain timing and text but not every authored position or typographic treatment.
- Netflix ad transitions can temporarily interrupt the second line while the title player changes state.
- Imported files must be smaller than 2 MB and contain valid timed cues.
- Creator-positioned or heavily styled captions may not preserve every original layout detail after styling.
- Named font choices use local and site-provided fonts with system fallbacks; their exact appearance depends on fonts available on the device.

## Development

The Manifest V3 extension has no runtime dependencies or build step. Runtime consumes one deep caption-provider interface with internal YouTube, Netflix, BBC iPlayer and Disney+ implementations. Shared SRT, WebVTT, TTML, DFXP and IMSC parsing lives in the cue module, while provider-specific identity, discovery, selection and loading stay behind the provider seam. Page bridges remain separate—and optional—because only services with private caption APIs need them.

Supported-site configuration is centralised in `lib/site-access.js`. The service worker dynamically registers the correct main-world bridge and isolated runtime only for origin groups the user has granted, making another service a registry and provider addition rather than a manifest-wide edit.

The YouTube page bridge passively captures the player's proof-bearing timed-text request because tokenless URLs from player metadata return empty responses. The Netflix page bridge requests all title tracks and captures bounded track metadata from the player manifest. The Disney+ bridge captures the master HLS manifest, keeps playlist URLs private, and assembles a selected segmented WebVTT track onto the title timeline. Track URLs never cross into settings or storage. Player adapters traverse open BBC and Disney+ shadow roots while the renderer follows the union of visible native caption boxes.

The proof-token approach was informed by the MIT-licensed [yt-dual-subs](https://github.com/gythiro/yt-dual-subs) implementation. Subtle uses its own smaller bridge and keeps parsing and rendering in isolated extension modules.

```sh
pnpm check
pnpm test
pnpm package
pnpm --dir website install
pnpm --dir website check
```
