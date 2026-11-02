# Changelog

## 1.0.2 — 2026-11-02

- Phones: pages scroll the document, like an ordinary site, so Safari shrinks its toolbar as you scroll, shows the page under the status bar and the toolbar, and goes back to the top on a tap on the status bar. Emby scrolls a container per page inside a locked document, which Safari never does any of that for; on phones that container is now let out into the document and Emby's scroller reads and moves the document instead (its virtual grids and header keep working). Each page and each tab keeps its own place. This replaces 1.0.1's containers stretched past the screen's edges, which didn't work. Emby's full-screen background layer and the empty footer are transparent now: Safari painted its status bar and toolbar solid in their colour (it does that for any fixed element with a background at the screen's edge) instead of showing the page under them. And a hidden header now leaves the screen completely: Emby keeps the strip of it under the status bar on screen, frosted, which stood over the status bar as a band nothing scrolled under.
- Phones: the page now scrolls on behind the clock. Safari 26 gives the status bar to the first full-width fixed box it finds at the top edge and paints the bar solid in its colour; Emby's header was that box on every page (transparent or not), so the status bar was always a band. The header (and the footer and background layers) now let taps through to its buttons only, which Safari doesn't count.
- Phones: Safari 26 clips fixed boxes to the screen between its bars, so the blurred art behind the page stopped at the toolbar's edge and left a band of the page's colour that grew and shrank with the toolbar; the art now fades into that colour toward both edges.
- Phones: albums three to a row in the home page's rows too (Emby fitted two and a bit).
- Page changes (Anime → Movies and so on) no longer twitch: cards no longer flash for one frame before rising in (Emby fills its grids inside an animation frame, and the reveal started a frame late); a page that Emby is still filling in (its tabs, a detail page's facts, the home page's rows and banner) waits, invisible, until it is in place and comes in once instead of shifting under its own fade (at most 450 ms); cards already there come in with the page instead of rising in after it; a header title or tab bar that is fading in isn't thrown back to transparent when Emby sets it again.
- Phones: no cards rise in at all (a grid's first fill counted as a new sort and still made them rise).
- A tab switch slides the tab's content, not the tab, so the A–Z index stays put.
- Settings page: Chinese only, with English to pick at the top (remembered in the browser), instead of both languages on every line.

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
