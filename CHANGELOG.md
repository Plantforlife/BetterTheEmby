# Changelog

## 1.0.2.10 — 2026-11-02

- Select menus (version, audio, subtitles) open at the select's own left edge, with each entry's text in line with the select's text and the check mark at the right end. Emby placed them 26px to the left of the select, for a check-mark column in front of every entry, so the text lined up with nothing. This replaces 1.0.2.9's narrower column. Phones keep Emby's bottom sheets.

## 1.0.2.9 — 2026-11-02

- Option menus of selects (version, audio, subtitles): the strip in front of each entry, kept free for the check mark, is 2.6em wide instead of Emby's 3.99em, so the text starts closer to the left edge.

## 1.0.2.8 — 2026-11-02

- Detail pages: the **Version** picker shows what comes after the first " - " of each version's name ("天气之子 - 4K BluRay-Remux … - Xcat" becomes "4K BluRay-Remux … - Xcat"), leaving off the title the name starts with and the page shows already. It covers the closed picker and its menu. New setting **Short version names** (on by default). A name with no " - ", or with nothing after it, stays as it is.

## 1.0.2.7 — 2026-11-02

- Phones: smaller full-screen lyrics and translations leave room for whole phrases; desktop sizes stay the same.
- Album colours: phones and desktops sample the same 160 px cover at quality 90. Inherited artist backdrops stay hidden on phones too, and the document behind Safari's bars uses the gradient's actual base colour.
- Phones: floating header buttons and tab tracks have more opaque dark surfaces, less blur and clearer text over cards and artwork.
- Home album rows follow their music library's `stripPrefix` setting, matching folder tabs without changing album metadata or other libraries.

## 1.0.2 — 2026-11-02

- Phones: pages scroll the document, like an ordinary site, so Safari shrinks its toolbar as you scroll, shows the page under the status bar and the toolbar, and goes back to the top on a tap on the status bar. Emby scrolls a container per page inside a locked document, which Safari never does any of that for; on phones that container is now let out into the document and Emby's scroller reads and moves the document instead (its virtual grids and header keep working). Each page and each tab keeps its own place. This replaces 1.0.1's containers stretched past the screen's edges, which didn't work. Emby's full-screen background layer and the empty footer are transparent now: Safari painted its status bar and toolbar solid in their colour (it does that for any fixed element with a background at the screen's edge) instead of showing the page under them. And a hidden header now leaves the screen completely: Emby keeps the strip of it under the status bar on screen, frosted, which stood over the status bar as a band nothing scrolled under.
- Phones: the page now scrolls on behind the clock. Safari 26 (WebKit's `fixedContainerEdges`) fills the area behind the status bar with an opaque colour whenever a full-width fixed box sits at the top edge, and once found, that box keeps the status bar until it is hidden; the top edge isn't looked at again after the first scroll or tap. Emby's header was that box from the start, so in this single-page app the status bar was a band for the whole session, and the toolbar likewise picked up a band after the page art changed. The header box and the full-screen background layers are now `visibility: hidden` on phones (which WebKit skips), with their rows and pictures still visible and the header's glass drawn by a pseudo-element.
- Phones: Safari 26 clips fixed boxes to the screen between its bars, so the blurred art behind the page stopped at the toolbar's edge and left a band of the page's colour that grew and shrank with the toolbar; the art now fades into that colour toward both edges.
- Phones: the header has no frosted band any more (a fixed box can't reach behind the status bar, so the band started under it, as a dark strip below the page showing there); its buttons float on glass circles of their own and its title has a shadow.
- Phones: opening the drawer no longer turns Safari's bars black. WebKit extends a dimming layer behind the bars in its background colour, opacity aside, and Emby's was black at opacity .3; it is now `rgba(0,0,0,.3)` at full opacity, so the bars take the page's colour dimmed as much.
- Phones: a tab bar wider than the screen (a music library's folder tabs) scrolls sideways over a glass track, its tabs fading out on the side(s) with more of them, and the active tab slides to the middle.
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
