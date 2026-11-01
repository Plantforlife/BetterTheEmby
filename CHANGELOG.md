# Changelog

## 1.0.1 — 2026-11-02

- iPhone / Safari: the status bar and toolbar take the colour of the page's art instead of showing black bands (Safari 26 extends the colour of the page and of edge elements into its bars).
- Phones: pages scroll under Safari's status bar and toolbar like an ordinary site. Each page's scroll container reaches past both edges into the strips iOS leaves outside the viewport (with as much padding inside, so content starts where it did); the home banner and detail backdrops reach up under the status bar, and the blurred page art fills the rest.
- Added to the Home Screen, Emby now runs full screen under the status bar (`apple-mobile-web-app-status-bar-style: black-translucent`).
- Phones: the header keeps Emby's own notch padding again (1.0.0 replaced it and sat too high on screens without a notch).

## 1.0.0 — 2026-11-02

First public release, as **BetterTheEmby** (formerly *Album Tint & Modern UI*, `AlbumTint.dll`).

- Settings page for every part: Modern UI, album colours, phone layout, web cache, library tabs, folder tabs, search, pinyin, NetEase.
- Library tabs: simpler tab bars, **Series** (from collections), **Artists** (one row per artist), configurable **folder tabs** for music libraries.
- Artist pages: photo or blurred cover, tinted page, *About* card; artists without a biography are looked up when an administrator opens them.
- Search: shows, films and albums; episodes and songs only by their own name; pinyin and pinyin initials with n/l alike; titles matched in the browser; the drawer's search box uses the same search.
- Pinyin A–Z index for library grids, with every letter.
- Phone layout: no bottom tab bar, search in the header, three albums to a row, calmer motion, browser bars in the page's colours.
- NetEase Cloud Music provider (artists and albums) with pacing, refusal pauses, an optional signed-in session and opt-in address rotation; Apple Music album provider.
- Faster tab switches without the double animation; dashboard pages no longer keep the previous page's art; the search page keeps its art when you come back to it.
- Text of the added parts in Chinese or English, following Emby's interface language.
