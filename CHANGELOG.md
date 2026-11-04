# Changelog

## 1.0.2.43

- Audio player: the lyrics and queue toggle now moves every part — panel, cover, title lines and controls — on one 360 ms curve, so the whole player switches in step instead of trailing behind.

## 1.0.2.42

- Desktop audio player: opening or closing the lyrics (and queue) panel now glides the cover, the title and the controls to their new places with the panel, instead of jumping there while only the panel moved.

## 1.0.2.41

- Audio player: the lyrics and queue panels now slide in and out over 640 ms on an evenly decelerating curve — a smooth scroll into place rather than a fade, on the desktop (96 px) and the phone (24 px).

## 1.0.2.40

- Desktop audio player: the lyrics (and queue) panel now slides in and out 64 px, so the transition is visible on a wide screen.

## 1.0.2.39

- Phone audio player: opening and closing the lyrics (and play queue) panel fades and rises it over 420 ms, as on the desktop player; closing no longer snaps shut.

## 1.0.2.38

- Phone home: no banner, so the page opens on My Media. Library tiles sit three to a screen, Continue Watching cards at two to a screen, and each row heading shows the library's own name with a blue 更多 link, as in the reference.

## 1.0.2.37

- Phone episode rail: the blue outline jumps straight onto the tapped episode instead of sliding across the strip; only the strip scrolls to center it. The season heading now opens the same picker as the version selector — the native one on Safari, the anchored menu elsewhere. The header buttons on video details are one pane of light glass, aligned as in the reference.

## 1.0.2.36

- Phone episode rail: the blue outline and the strip scroll now move on one eased 400 ms curve, so the outline glides straight to the new episode instead of overshooting and being dragged back. Rapid taps continue from the current position, a swipe during the motion keeps the finger in control, and a new width keeps the outline on its card. Switching seasons slides the new episodes in from the side of the season order.

## 1.0.2.35

- Suppress duplicate phone card navigation and recover artwork after scrolling or returning to a cached page.
- Open phone shows directly to the episode rail. Switch seasons and specials in place, with a moving blue outline for the selected episode.

## 1.0.2.34

- Apply the detail button reflections on desktop over Emby's native shadow reset.

## 1.0.2.33

- Give detail playback and secondary buttons a soft inset reflection.
- Use separate season and episode pages for multi-season shows on phones, with in-place previews for single-season shows.
- Extend phone slides across media browsing and details. Start once the title is ready without waiting for artwork or classifying the clicked item.

## 1.0.2.32

- Slide the full phone series route in from the right and back out over the previous page.
- Drive artwork directly from scroll position on supported browsers. Keep episode cards and the series artwork steady while tapping through episodes.

## 1.0.2.31

- Match the reference phone series scroll: the backdrop stays anchored as it zooms out and fades, and the logo and episode controls scroll at full size.

## 1.0.2.30

- Keep the phone episode strip in place when switching to an episode with a longer or shorter synopsis.
- Put item commands in the floating header for all phone video details. Use quieter controls for unavailable playback options.

## 1.0.2.29

- Close the phone synopsis reader with browser Back while keeping the episode page, selection and scroll position.

## 1.0.2.28

- Use the phone episode strip on single-season series pages while retaining Emby's season navigation for multi-season series.

## 1.0.2.27

- Keep episode card resizing smooth when another episode is selected mid-animation, and center the latest selection using the rail's layout coordinates.

## 1.0.2.26

- Continue interrupted desktop lyrics and queue transitions from the current position instead of jumping to the old destination.

## 1.0.2.25

- Let a late phone spotlight logo fade in after the swipe settles, keeping the title and metadata aligned throughout.

## 1.0.2.24

- Commit a phone alphabet index tap once when WebKit also emits a native click after touch.

## 1.0.2.23

- Phone season details start on the first episode. An episode switch updates the title, technical information, track options and selection together.

## 1.0.2.22

- Match the phone season and episode layout to the reference, with a blue play button, a compact floating header and blue season and episode controls.
- Show the current letter in the center of the screen while scrubbing the library index. Safari's native selectors retain keyboard focus feedback without drawing a ring on touch.

## 1.0.2.21

- Keep the phone player's artwork centered at its intended square size when lyrics and the queue are closed.

## 1.0.2.20

- The phone episode strip shows two and a half cards at the start and centers later selections with half of each neighbouring card visible.
- Phone video details share five controls across video types, keep the header within reach during scrolling, and clamp the synopsis inside its own text container. Episode selections use a blue outline, a soft title transition, and a backdrop fade matching the home banner.
- The phone library index supports touch scrubbing. Album actions are four circles in a row, and the player gives artwork more space when its side panels are closed.
- The rounded audio bar keeps its frosted backdrop. Desktop lyrics, queue and playback settings slide and fade. Fast phone home swipes finish the current movement before starting the next.

## 1.0.2.19

- Compact phone video details keep the episode strip in view and open long descriptions in a reader. Season and episode entrances move right in one 480 ms transition.
- Phone Safari uses native track pickers. Other browsers use a compact anchored menu. Watched and favourite controls respond immediately and restore their prior state on failure.
- The audio footer blurs the page behind it. Desktop lyrics animate out, and phone transport controls slide and resize the lyrics area.

## 1.0.2.18

- Phone show and episode details use a full-width backdrop, centered playback, and five circular controls. Episode selection updates the detail panel without navigation. Version, audio, and subtitle menus use the browser's native select control.
- Phone home banners slide horizontally. The drawer and bottom audio bar use neutral frosted glass.
- The phone music player puts shuffle and repeat above the queue and lets lyrics expand after inactivity or a downward scroll.

## 1.0.2.17 — 2026-11-03

- Phone album details place a larger cover beside the left-aligned title, artist and metadata. The existing play/shuffle buttons and favourite/more controls remain underneath across the full width. Long titles and genres wrap without clipping; the layout also works with Album Tint off and leaves desktop and other detail types unchanged.

## 1.0.2.16 — 2026-11-02

- Top-level library tabs use a clearer directional slide and fade: right-hand tabs enter from the right and left-hand tabs from the left. Motion scales with the viewport, waits for custom content/native scroll bodies, and cancels cleanly on rapid switches.
- Series covers and titles now use the same poster transition into collection details and back as normal cards. Returning hides only the series cover, keeping its title rows visible. Phone and reduced-motion behaviour is retained.

## 1.0.2.15 — 2026-11-02

- Video option selectors and menus share the detail artwork's 12px corners. Selected rows have a persistent light-grey background with dark text and fill the menu width without dark inset strips; the outer menu clips the row at its rounded edges.

## 1.0.2.14 — 2026-11-02

- Video option menus remove their top and bottom inset so the first and last option highlights meet the menu edges. Side inset, small corners, selection dot and text padding are retained.

## 1.0.2.13 — 2026-11-02

- Video detail options use smaller corners: 6px on the selectors, 8px on their desktop menus and 4px on entries. The selected dot, spacing and alignment stay the same.

## 1.0.2.12 — 2026-11-02

- Search includes album artists and finds their albums by album-artist name, full pinyin or initials. Artist results use the existing cards and also appear in drawer suggestions. Artist catalogues are cached per library, and an unavailable artist lookup does not hide title results.

## 1.0.2.11 — 2026-11-02

- Select menus on desktops: the chosen entry has a dot in front of its first line instead of a check mark at the right end, and every entry has the same 10px on all four sides (the menu 6px around its entries).

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
