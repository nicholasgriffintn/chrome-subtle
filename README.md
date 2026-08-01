# Subtle

Subtle makes captions easier to read on YouTube and Netflix. It styles each site's native captions and can add a synchronised second line from platform captions or a local SRT/VTT file.

## What it does

- Restyle native captions with readable presets, seven local font families, independent text/backdrop/window colours and opacity, five edge styles, size and position controls.
- Add a translated second line on YouTube when the video supplies a caption track.
- Add a second language supplied with the current Netflix title.
- Add a local SRT or VTT second line on YouTube or Netflix.
- Keep the second line attached to the complete native caption group as Netflix moves dialogue around the frame.
- Shift imported captions forwards or backwards to correct timing.
- Hide simple bracketed sound cues such as `[Music]` when requested.
- Keep all preferences and imported files on the device.

## Install locally

1. Run `pnpm package` or use the `subtle.zip` download from the companion site.
2. Extract the ZIP.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** and select **Load unpacked**.
5. Choose the extracted extension directory, then reload any open YouTube or Netflix tab.

The companion site is in `website/`. Its download is a development preview; the extension has not yet been published to the Chrome Web Store.

## Privacy

Subtle processes the current playback time, native caption elements and the caption metadata already supplied to supported video pages. On YouTube, it reuses the player's caption request to ask YouTube for the selected translated track. On Netflix, it requests the selected title track from a Netflix-provided CDN URL inside the active tab. Netflix track URLs and caption text are not written to extension storage.

Subtle has no accounts, analytics, advertising, remote scripts or translation service. Imported files are not uploaded. The extension runs only on `youtube.com`, `youtube-nocookie.com` and `netflix.com`; its sole Chrome permission is `storage`.

Platform caption requests stay between the active tab and YouTube or Netflix infrastructure. Subtle does not send caption data to its own server or to an external translation provider. This privacy statement was last updated on 1 August 2026.

## Limitations

- YouTube translation availability depends on the caption tracks and translation support for each video.
- Netflix second-language availability depends on the tracks packaged with each title; Subtle does not machine-translate Netflix captions.
- YouTube's timed-text request and Netflix's player manifest are private interfaces and can change without notice.
- Netflix DFXP and IMSC tracks retain timing and text but not every authored position or typographic treatment.
- Netflix ad transitions can temporarily interrupt the second line while the title player changes state.
- Imported files must be smaller than 2 MB and contain valid timed cues.
- Creator-positioned or heavily styled captions may not preserve every original layout detail after styling.

## Development

The Manifest V3 extension has no runtime dependencies or build step. Runtime consumes one caption-provider interface with YouTube and Netflix adapters. Each provider owns content identity, track discovery, selection and cue loading, while overlay rendering and settings remain platform-neutral. Netflix's provider composes overlapping WebVTT, DFXP and IMSC cues into one multiline timeline so every simultaneously active line remains visible.

The YouTube page bridge passively captures the player's proof-bearing timed-text request because tokenless URLs from player metadata return empty responses. The Netflix page bridge requests all title tracks, captures bounded track metadata from the player manifest and fetches a selected track by opaque identifier. Download URLs never cross into settings or storage. Netflix player matching separately scores connected video elements and excludes billboard and preview playback before deriving an overlay host. The renderer measures the union of active native caption boxes and follows it without overriding Netflix's authored placement.

The proof-token approach was informed by the MIT-licensed [yt-dual-subs](https://github.com/gythiro/yt-dual-subs) implementation. Subtle uses its own smaller bridge and keeps parsing and rendering in isolated extension modules.

```sh
pnpm check
pnpm test
pnpm package
pnpm --dir website install
pnpm --dir website check
```
