# BetterTheEmby — technical notes

[README](../README.md) · [中文说明](../README.zh-CN.md)

A server plugin for Emby 4.9.5.0 that restyles and extends the bundled web client. Its parts:

- **Modern UI** (`modernui.css` + `modernui.js`): a modernized look and motion, the library tabs (series, artists, folder tabs), title and pinyin search, the pinyin A–Z index and the phone layout.
- **Album Tint** (`albumtint.js`): an Apple-Music-style background, covers and lyrics that follow the album art.
- **Web client cache** (`serviceworker.js`): makes page loads much faster, especially away from home.
- **Metadata providers** (`NetEase.cs`, `AppleMusic.cs`): artist and album facts from NetEase Cloud Music and Apple Music.
- **Settings** (`Plugin.cs`, `web/config.html` + `web/config.js`): every part can be turned off in the plugin's settings page.

Earlier versions were called *Album Tint & Modern UI* (`AlbumTint.dll`); see [Upgrading from AlbumTint](#upgrading-from-albumtint).

## Settings

Dashboard → Plugins → BetterTheEmby → Settings. The server writes the web-facing ones to `bettertheemby.settings.js` (`window.BetterTheEmbySettings`), which index.html loads before the other scripts; changes apply when the web client reloads.

| Setting | Default | What it does |
|---|---|---|
| `EnableModernUI` | on | The whole of `modernui.js` / `modernui.css` (the features below except Album Tint and the cache need it). |
| `EnableAlbumTint` | on | Album colours, covers and lyrics in the music player. |
| `EnablePhoneLayout` | on | Phones (≤ 40em): no tab bar at the bottom, search at the top right, albums three to a row, calmer motion. |
| `EnableWebCache` | on | The service worker cache; off writes a service worker that clears the cache. |
| `SimplifyLibraryTabs` | on | Libraries show only the tabs in use (see [Library tabs](#library-tabs-modernuijs-patchlibrarytabs)). |
| `EnableSeriesTab` | on | The **Series** tab in video libraries. |
| `EnableArtistFeed` | on | The **Artists** tab in music libraries. |
| `FolderTabs` | empty | Music libraries whose tabs are their folders (JSON, see [Folder tabs](#folder-tabs)). |
| `EnableSmartSearch` | on | Title search (see [Search](#search)). |
| `EnablePinyinSearch` | on | Pinyin and pinyin initials in search. |
| `EnablePinyinIndex` | on | The A–Z index beside library grids shows pinyin initials. |
| `NetEaseSpacingMs` | 1500 | Pause between two NetEase lookups (500–10000). |
| `NetEaseRotateAddress` | off | Sends a different mainland client address with every NetEase lookup (see [NetEase](#netease-cloud-music-metadata-neteasecs)). |
| `NetEaseCookie` | empty | A signed-in music.163.com session, used when an anonymous lookup is refused. |

The interface text of the added parts is Chinese when Emby's interface is Chinese (`<html lang="zh…">`) and English otherwise.

## Modern UI

Design references: the Apple TV app, Netflix's home banner, Infuse's detail pages and Jellyfin themes such as ElegantFin.

- **Base**: a deeper, cinematic dark background (#141414 instead of Emby's #1e1e1e). Emby's dashboard pages use the light theme and keep their own look; everything theme-dependent applies to the dark theme only.
- **Spotlight banner** on the home page and on a movie or TV library's 推荐 (suggestions) tab.
  - Full-width backdrop under the transparent header, with a slow Ken Burns drift.
  - The title logo, or the title if there is no logo, plus rating, year, seasons or runtime, age rating, genres and a three-line overview.
  - Buttons: Play (or Resume with a progress bar), Details and Favorite.
  - A soft glow in the art's own color.
  - It changes every 8 s with a 1.1 s crossfade. The dot of the current slide fills up as a progress bar; dots and arrows switch slides, and you can swipe on touch screens.
  - It pauses while the pointer is over it, the tab is hidden, or the banner is scrolled out of view. Scrolled back to it, the current slide starts over.
  - Content: 7 picks from the 30 newest movies and shows with backdrops, preferring ones with a title logo. The set stays the same for 30 minutes within a browser tab.
  - Backdrops are requested at 960–1920 px, never more.
- **Detail pages** of movies, shows, seasons, episodes and collections (music stays with Album Tint):
  - A full-width backdrop hero with parallax that fades out as you scroll.
  - Behind the whole page, a heavily blurred copy of the art, Infuse style.
  - The title logo in place of the title text. Episodes and seasons use the show's backdrop and logo.
  - The poster gets rounded corners and a shadow. The main Play button is solid white; the other buttons and selectors are glass pills.
  - Below 50em (phones), Emby's own backdrop strip is kept and fades into the blurred art.
  - The poster and the lines of text (title, facts, buttons, overview) come in one after another.
- **Home and library pages** (the home page; a library's grid, suggestions and other tabs, its genre pages; music libraries too):
  - Art fills the background, blurred and dimmed. Where there is a banner (home, a library's suggestions tab), it is the banner's current picture and changes with it, so the banner fades out at the bottom into its own art instead of into the flat page color. Otherwise movie and TV libraries use the backdrops of the spotlight picks; music and photo libraries use covers.
  - With a mouse, the art follows the card the pointer rests on (after 0.45 s), the way Plex does. While the pointer rests on that card, the banner turning doesn't take the art back; moving onto the banner does. Library tiles are skipped (their picture is a collage). A page you come back to shows the art it had.
  - Each picture is dimmed according to its own brightness, so a white album cover doesn't turn the page grey.
- **Cards**:
  - 10 px corners; images fade in once loaded and settle from a slight zoom.
  - On hover, the card lifts 6 px and leans up to 4–5° toward the pointer, with a soft glare that follows it (Apple TV). Its image zooms 1.06× and a shadow appears. Pressing it pushes it in slightly. The play button is a glass circle that springs in; the hover buttons fade in.
  - The resume bar is inset and rounded. The unwatched count and the watched check are small dark badges with a hairline instead of solid green dots.
  - When a page first fills, the visible cards rise in, staggered in reading order (at most 260 ms). A new sort or filter in a library grid brings them in the same way.
  - **Poster flight**: clicking a card flies its poster to the poster of the detail page (0.58 s, tracked every frame, so it lands exactly). Going back flies it into its card again. It only happens when both pictures have the same shape (not from a 16:9 thumbnail to a portrait poster) and not on phones, where the detail page shows no poster.
- **Chrome**:
  - The header turns to frosted glass when it comes back over scrolled content. Its title fades over when it changes; its buttons fade in when a page shows them and give under the pointer.
  - The header tabs are a glass segmented control with a pill that slides to the active tab. A page's new set of tabs fades in.
  - The side drawer is translucent. One highlight slides to the selected entry, instead of Emby's solid green block (which the previous version didn't fully remove). Hover highlights fade in.
  - Row arrows and library toolbar buttons are glass.
  - The letter bar of a library swells under the pointer like a dock, the letters pulling toward the grid.
- **Menus and dialogs**: menus (sort, "more", selects) are dark glass, and grow out of the button that opened them (0.26 s) and shrink away (0.15 s). Centered dialogs rise in; the page behind a modal dialog blurs slightly as it dims. Hover highlights in menus fade. Phones keep Emby's bottom sheets.
- **Page transitions**: a new page fades and rises in (300 ms). Back navigation only fades. Leaving the video player fades the page, header and drawer in together; so does the first page after the app starts. A tab switch slides the new tab's content in from the side of the tab you picked (0.26 s); the cards in it come with it instead of rising in a second time. Album Tint keeps handling the music player.
- **Dashboard pages** (settings, plugins) get no art; the previous page's art goes when one opens.
- **Video player**:
  - Smoother top and bottom gradients; the controls slide slightly as they show and hide.
  - Bolder title; a thicker seek bar that grows on hover, with a glowing fill.
  - Glass pill tabs and buttons, including Skip Intro and Up Next. Skip Intro slides up into view.
  - A play/pause pulse in the middle of the picture after a click on it or Space / K.
- `prefers-reduced-motion` turns all of the motion off.

## Album Tint

- **Album page** (MusicAlbum, or a single track's page): the page background turns into a dark gradient built from the 3 dominant colors of the album's Primary image. Header, side drawer, buttons and accent text pick up the tint too.
- **Full-screen player** (`#!/videoosd`, audio only): the background follows the track that is playing.
- **Now-playing bar**: while music plays, the bar takes on the playing album's color on every page.
- Changing album or track crossfades over 0.9 s.
- **Cover** (album page and full-screen player): image, frame and glow share one Apple-Music-style corner radius (3% of the art, kept between 6 and 10 px). There is a 1px light hairline edge, and an even halo in a light tone of the album's main color.
  - Emby clips the area around the cover: `contain: paint` on the card, and `overflow: hidden` on `.osdPosterContainer` and `.topDetailsMain`. The script unclips the card. The two containers' clip boxes grow by padding plus an equal negative margin, so nothing moves.
- **Lyrics** (full-screen player → Lyrics):
  - Look: larger, bold lines that fade out at the top and bottom edges. The blur grows with distance from the current line. The current line is scaled 1.09× with a contour glow (a 3px white rim plus a 10px halo in the album's hue). Emby's `overflow:hidden` on the text box is lifted, since it clipped any glow into a rectangle.
  - Scrolling: a 750 ms eased glide instead of Emby's jump. Lyrics start at the top; the current line moves down until it reaches the optical middle (42% of the panel height), and from there the list follows it. Scrolling the panel by hand removes the blur and pauses auto-follow for 3 s. The panel's scrollbar is hidden.
  - **Jump to a line** (Emby seeks when a line is clicked): every line shows a pointer cursor. A soft plate slides under the line the pointer is on, with that line's start time (▶ 1:19) at its end, and the line sharpens and brightens. Pressing pushes the plate in; a click flashes it, and the line glides to the middle as soon as playback gets there (Emby doesn't scroll to a line that has focus, which a clicked line does). During a glide the plate rides with its line and catches up with the pointer afterwards. On touch screens, scrolling the lyrics with a finger puts the plate on the line at the reading position; tap the line to jump there.
- **Bilingual lyrics**: lines that share an LRC timestamp (original + translation) form one group, NetEase style. The group highlights, blurs and centers as a unit. The original keeps the large size; the translation sits tightly underneath at about 70% size.
- **Page ↔ player transition**: when you open the full-screen player from the now-playing bar (or the playing album's page), a copy of the cover flies from that spot to the player cover. The player and its header fade in and the lyrics panel rises in.
  - Going back: the cover flies to the album page cover or the now-playing bar, and the page, header and side drawer fade in together.
  - Reduced motion: no flight.
  - Only one copy is in the air at a time: navigating again mid-flight makes it turn around from where it is. If the destination doesn't appear within 0.6 s, the copy fades out.
- **Now-playing bar**: the bar fades out and in in place (260 ms) instead of Emby's slide. The footer is held at its position until the fade ends; otherwise it would jump sideways when the player removes the side drawer.
- **Hover overlay**: Emby's cover hover overlay is a sibling of the cover, not a child. It now has the same rounded corners and only a light gradient at the bottom behind the buttons.

## Web client cache (loading speed)

Emby serves its ~200 web client files with `Cache-Control: public` and no lifetime. Every page load therefore asks the server about each file again (about 110 conditional requests on the login page alone). Through the reverse proxy, from outside, or on a phone that costs many round trips.

Emby registers `serviceworker.js` but ships it empty. The plugin writes a small service worker there:

- Web client files that carry a version (`?v=4.9.5.0`, or `?v=<hash>` for this plugin's own files) are kept until that version changes.
- Fonts and theme images are served from the cache and refreshed in the background.
- index.html, the API, artwork, video and audio go to the network as before. Artwork already has a one-year lifetime from Emby, so the browser's normal cache keeps it.

Measured on the login page over HTTPS, repeat visit (headless Edge):

| | requests to the server | time until the page shows |
|---|---|---|
| before (LAN) | 109 | ~220 ms |
| with the cache (LAN) | 7–9 | ~120 ms |
| before (60 ms latency, like mobile data) | 109 | ~1.8 s |
| with the cache (60 ms latency) | 7–9 | ~0.4 s |

Service workers only run on HTTPS (or localhost), so plain `http://<server>:8096` doesn't use the cache. If your reverse proxy can compress responses (gzip/brotli), turning that on also shrinks first visits.

## How it works

`BetterTheEmby.dll` is a small server plugin (`IServerEntryPoint`). Each time the server starts, and each time its settings are saved, it:

1. writes `bettertheemby.settings.js` from the settings, and the embedded `web/modernui.css`, `web/albumtint.js`, `web/modernui.js` and `web/pinyin.js` to `/system/dashboard-ui/`;
2. writes `web/serviceworker.js` over Emby's empty `/system/dashboard-ui/serviceworker.js` (or, with the cache off, a service worker that clears it);
3. adds four lines before `</head>` in `/system/dashboard-ui/index.html`, each marked `<!--bettertheemby-->`:
   - `<script src="bettertheemby.settings.js?v=<hash>" defer>`
   - `<link rel="stylesheet" href="modernui.css?v=<hash>">`
   - `<script src="albumtint.js?v=<hash>" defer>`
   - `<script src="modernui.js?v=<hash>" defer>`

   `pinyin.js` is not referenced; `modernui.js` loads it when search or the A–Z index first needs it. Before the first change the plugin saves an untouched copy to `/config/plugins/BetterTheEmby/index.html.orig-<server version>`. Lines marked `<!--albumtint-->` (versions before 1.0) are removed.

The web client lives inside the container image. An image update or `docker compose up --force-recreate` therefore resets it, and the plugin adds everything again on the next start. Only the DLL in `/config/plugins` is persistent.

The scripts use Emby's own modules (`playbackManager`, `events`, `appRouter` through the AMD `require`), `ConnectionManager.currentApiClient()` and Emby's theme variables. They hook into Emby only after its own startup has finished (`ConnectionManager` and a first view exist). Requiring `playbackManager` while app.js is still setting up the loader loads it half-configured, and the app never leaves the splash screen. Album Tint used to have this race, and it is fixed.

Images for the banners and detail pages are requested through `ApiClient.getUrl` with an exact width. `getImageUrl` multiplies the width by `devicePixelRatio` and forces quality 70; on a 1.75× screen that asked for 4480 px, 1.5 MB backdrops. The blurred page art is fetched at 320 px (backdrops) or 240 px (covers).

Some Emby details the motion relies on:

- Library grids are virtual: Emby reuses about 50 card elements and refills them while you scroll. The item behind a card comes from its container's `getItemFromElement(card)`; the cards carry no `data-id`. A batch of at least 6 cards refilled while nothing scrolled is a new sort or filter, so those rise in again; refills during scrolling don't.
- A tab switch activates the new tab's content between `beforetabchange` and `tabchange`, in the same task, so the slide can start before anything is painted.
- The drawer's selected entry is painted on `.listItem-content-bg` (solid green, `!important`), with the hover as its `::before`.
- Detail pages are animated from the DOM observer as soon as Emby fills in the title, before that state is first painted.

## Library tabs (modernui.js, `patchLibraryTabs`)

Emby 4.9 builds a library's tab bar from `getTabs()` of the view module (`./tv/tv.js`, `./videos/videos.js`, `./music/music.js`). Every tab has an `id` and an `enabled` flag, and Emby itself hides tabs without content through that flag. The script imports those ES modules with `Emby.importModule` and wraps `getTabs` and `loadTabController` on their prototypes:

- The page template has one tab slot per position, each with a fixed `data-swapnode` (itemstab/sectionstab). Tabs are therefore switched off in place (`enabled: false`), never removed, and a custom tab takes over the slot of a tab that goes away.
- `tabPlan(item)` decides per library: video libraries keep `series`/`videos`, `suggestions`, `favorites` and get **Series** (系列); music libraries keep `albums` and get **Artists** (艺人); a library listed in `FolderTabs` gets its folder tabs instead. With `SimplifyLibraryTabs` off, Emby's tabs all stay and ours only take the slot of the one they replace (Series: `folders`, Artists: `albumartists`).
- A custom tab controller follows Emby's life cycle: `new Controller(tabContent, params, options)` → `onTemplateLoaded()` (the slot arrives filled with Emby's template for that slot, which the controller replaces) → `onResume()` on every show, `onPause()`, `destroy()`.
- Cards are built with Emby's own `cardBuilder.buildCards` inside an `emby-itemscontainer`, so clicks, context menus and play buttons behave as everywhere else. In 4.9 the card text comes from `fields: ['Name', 'ProductionYear']` (`showTitle` no longer exists).
- Emby hides inactive tabs with `.tabContent:not(.is-active) { display: none }`; a custom tab may only set `display` while it is `.is-active`, or it stays on top of the other tabs.

### Series

Series are Emby collections (BoxSets). The tab lists the collections that have at least one entry in the current library. Each one shows the collection's cover (or the first entry's poster), the number of entries, the years, how many are TV series and films, genres and an overview (the collection's, else the earliest entry's), then the entries sorted by release date. The newest entry's backdrop tints the panel.

### Artists

One row per album artist, from `Artists/AlbumArtists` (fetched 20 at a time until all are in); each artist's albums load when the row scrolls near (`IntersectionObserver`, 600 px ahead). On the left the photo, a square with soft corners (no photo: the newest album's cover, blurred, with the name's first character); on the right the name, album count and genres, the biography (three lines, *More* opens it) and the albums. The photo's colours glow behind the row. Photo and name open the artist page.

### Artist pages

On a MusicArtist page the photo becomes a square with soft corners (no photo: the newest cover, blurred, with the initial), the photo's colours tint the page, and an *About* card under the albums shows the whole biography (in two columns when long), the album count, genres and a link to NetEase. When an administrator opens an artist that has no biography yet, the page asks the server to refresh that artist (fill-in only) and takes the result in when it arrives.

### Folder tabs

`FolderTabs` is a JSON array; each entry turns one music library's tabs into its folders:

```json
[
  {
    "library": "Genshin OST",
    "allTab": "全部",
    "hide": "精选原声带",
    "stripPrefix": "原神 - ",
    "shelves": [
      { "folder": "场景OST", "tab": "地区OST" },
      { "folder": "版本OST", "tab": "流星的轨迹" },
      { "folder": "EP", "tab": "EP" }
    ]
  }
]
```

- `library`: the library's name, or `/a regular expression/flags`.
- `shelves`: a folder at the top of the library and the tab that shows it (up to about ten tabs: they take over Emby's tab slots).
- `allTab` (optional): a first tab with every shelf, each under its name, as a grid of covers.
- `hide` (optional): a regular expression; albums whose name matches are left out.
- `stripPrefix` (optional): what all album titles start with, left off in the tiles.

A shelf of its own shows a header (name, album count, years, track total, *Play all*, the covers fanned out) and the albums as wide tiles with their first four tracks.

Music albums have no path in the API (Emby builds them from tags), and `SortBy=Path` doesn't follow folder names. The tab lists the shelf folder's sub folders, sorts them with `Intl.Collator('zh-Hans-CN', { numeric: true })` (numbers by value, Chinese by pinyin — the order Windows Explorer shows) and matches each album to its folder by title (`"02.蒙德 - 风与牧歌之城"` and `"原神 - 风与牧歌之城"` both read `风与牧歌之城`). A folder whose name doesn't read like its album is asked for its album directly.

## Search

`SearchView.prototype.fetchSections` (`./search/search.js`) is replaced for any search with text:

- Shows, films and albums come from a list of them fetched once (per library, kept 10 minutes) and matched in the browser: name or original title contains the search (best), then pinyin initials, then full pinyin. `n` and `l` count as the same sound on both sides. Typing `gdyg` or `guduyaogun` finds 孤独摇滚.
- Episodes and songs are asked from the server (`SearchTerm`, 80 at most) and kept only when their own name contains the search; Emby also finds them by their show's, album's or artist's name.
- The page lists one section per kind (Shows, Movies, Albums, Episodes, Songs) with large headings; empty kinds are left out. The first match's art lights the page, and comes back with the page.
- One search costs at most two server requests (plus the title list once), instead of Emby's search request and one request per kind.
- The drawer's search box (`.txtNavDrawerSearch`) suggests from the same search; Enter opens this search page (Emby would open its list view in search mode).
- `pinyin.js` maps 20,924 CJK characters to their most common pinyin (generated with pypinyin).

## Pinyin A–Z index

Emby's `AlphaPicker` lists the first character of each group of titles, at most 27 of them. `setPrefixes` is wrapped: for each pinyin initial the first character stays, labelled with the letter, in A–Z order; a click still asks the server for the titles from that character on (`NameStartsWithOrGreater`). `setCurrentFromItem` lights the letter of the current title. Without the pinyin table loaded yet, `Intl.Collator('zh-Hans-CN')` and the first character of each letter decide.

## Phone layout

Below 40em, with `EnablePhoneLayout`:

- The docked tab bar (`.appfooter .dockedtabs`) is hidden; the footer stays for the now-playing bar. Emby's header search button is shown.
- Square cards in vertical grids are a third of the width (the virtual grid measures their CSS width).
- Motion: a 200 ms fade per page; no poster flights, no detail-page choreography, no card reveals.
- Safari 26 fills its status bar and toolbar with the colour of the page and of fixed elements at the screen's edges, and Emby scrolls inside its own containers (not the document), so Safari cannot show the page under its bars the way it does on ordinary sites. Instead the colour of the top strip of the page's art, dimmed like the page (`--mui-bar`), goes to `theme-color`, the page background, Emby's full-screen `.backgroundContainer` and the footer (except while Album Tint colours the music bar), so the bars blend into the page.
- iOS leaves those strips outside the viewport but still draws there. So each page's scroll container (`.scrollFrameY`: the page or its tab) reaches `--mui-edge-top` (64px) above and `--mui-edge-bottom` (104px) below the viewport, with the same padding inside, and content scrolls under the status bar and toolbar as on an ordinary site. The home banner reaches up under the status bar as well; detail backdrops do already (they sit at the container's top). The blurred art (`#mui-bg`) and `.backgroundContainer` reach 25vh past both edges.
- With the phone layout on, the plugin adds `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`: added to the iOS Home Screen, Emby runs without Safari's bars and the page reaches under the status bar (Emby's header already keeps clear of the notch with `env(safe-area-inset-top)`).

## NetEase Cloud Music metadata (NetEase.cs)

A metadata and image provider named **NetEase Music**, for music artists and albums:

| Item | From NetEase | Endpoint |
|---|---|---|
| Artist | biography (summary plus the sections of the artist wiki) | `api/artist/introduction?id=` |
| Artist | photo (the square avatar, the main photo as an alternative) | `api/search/get/web?type=100`, `api/v1/artist/{id}` |
| Album | description, release date, label | `api/search/get/web?type=10`, `api/album/{id}` |
| Album | cover | same |

- The endpoints are the ones the NetEase web player uses; they need no login and no request encryption, only a browser User-Agent and `Referer: https://music.163.com/`. They are not an official API and may change.
- Matching is strict: an artist is matched only on its exact name or a NetEase alias/translation (`路南 Lunan (HOYO-MiX)` matches 路南 with the alias Lunan). Names that stand for several artists (`A & B`, `A, B`, `feat.`) are skipped. An album needs its exact title plus one of its album artists among the NetEase credits.
- NetEase rate-limits: after ten to a few dozen lookups it answers `{"code":405|406,"message":"操作频繁，请稍候再试"}` for minutes. Requests go out one at a time, `NetEaseSpacingMs` apart (1.5 s); a refusal is never cached, and NetEase is left alone for 5 minutes after one. A whole-library refresh therefore fills the first dozens of items at once and the rest on later refreshes.
- NetEase counts lookups by the client address given in `X-Real-IP` / `X-Forwarded-For`, not by the connection's: in a test the plain endpoints refused a server after ten lookups and kept answering the same requests carrying another address. With `NetEaseRotateAddress` (off by default) every lookup names a different mainland address. NetEase does not offer this, and it may stop working; turn it on at your own discretion.
- Optional signed-in session (`NetEaseCookie`): the whole Cookie header of a signed-in music.163.com tab, or just its `MUSIC_U` value. When an anonymous lookup is refused, the same lookup goes to the encrypted endpoints the web player itself uses (`weapi/…`, AES + RSA as the player does it) with that cookie; those have a limit of their own and refuse anonymous callers. A signed-out cookie (code 301 / 50000005) is set aside until a new one is saved. The cookie goes to music.163.com only, never to the image hosts.
- Answers are cached for six hours.

## Apple Music album facts (AppleMusic.cs)

A metadata and image provider named **Apple Music** for albums, built on the public iTunes Search API (`itunes.apple.com/search?entity=album`, no key; about 20 requests a minute, so 3 s apart). It fills release date, genre, label (from the copyright line, "℗ 2012 Warner Music Hong Kong Ltd" → "Warner Music Hong Kong Ltd") and a 1200 px cover. It searches the Taiwan, Hong Kong and US stores (the China store answers searches with nothing). Their titles use traditional characters, so a title matches with simplified/traditional variants (same length, only Chinese characters differ, at most half of them), but only together with a matching album artist and a release year within one year. The public API has no artist photos or biographies.
- The provider ids `NetEaseArtist` / `NetEaseAlbum` are stored on the item; the item page links to music.163.com. Emby's "Identify" dialog lists NetEase candidates, so a wrong match can be corrected by hand.
- Emby merges provider results into what the item already has. A refresh with "replace existing metadata" off only fills empty fields, so tags written by your ripping/tagging tool stay.

## Build

```bash
# copy MediaBrowser.Common/Controller/Model.dll from the container's /system into ./ref first
dotnet build -c Release
# -> bin/Release/netstandard2.0/BetterTheEmby.dll
```

To regenerate `web/pinyin.js`: `pip install pypinyin`, then map U+4E00–U+9FFF with `pypinyin.pinyin(ch, style=Style.NORMAL)` and write `window.MuiPinyinData = 'syllable:characters,…'`.

## Install

```bash
cp bin/Release/netstandard2.0/BetterTheEmby.dll <emby-config>/plugins/
# then restart Emby
```

Then reload the browser page (Ctrl+F5).

## Upgrading from AlbumTint

1. Stop Emby, delete `<emby-config>/plugins/AlbumTint.dll` and copy `BetterTheEmby.dll` in (the plugin id is the same, so both must not be there at once).
2. Optionally rename `<emby-config>/plugins/configurations/AlbumTint.xml` to `BetterTheEmby.xml` to keep the NetEase cookie.
3. Start Emby. The old `<!--albumtint-->` lines in index.html are replaced. The library's metadata fetchers keep their names (NetEase Music, Apple Music), so nothing changes there.
4. The Genshin OST tabs of earlier versions are now a `FolderTabs` entry (the example above).

## Turn off / uninstall

- **For one browser only**: run one of these in the DevTools console. The setting is stored in localStorage.
  - `ModernUI.disable()` turns the modern look off (the page reloads); `ModernUI.enable()` turns it back on.
  - `AlbumTint.disable()` / `AlbumTint.enable()` do the same for the album colors.
- **For everyone**: turn parts off in the plugin's settings page.
- **Uninstall (recommended)**: go to Emby Dashboard → Plugins → BetterTheEmby → Uninstall. This removes the lines from index.html at once and deletes the files. It replaces `serviceworker.js` with a version that deletes the cache and stops handling requests. No restart is needed; reload the page.
- **Manual**: Emby does not call the plugin on shutdown, so deleting only the DLL leaves the injected lines in place until the container is recreated. Do this instead:
  ```bash
  rm <emby-config>/plugins/BetterTheEmby.dll
  docker exec Emby sh -c "sed -i '/<!--bettertheemby-->/d' /system/dashboard-ui/index.html; cd /system/dashboard-ui && rm -f albumtint.js modernui.js modernui.css pinyin.js bettertheemby.settings.js"
  docker restart Emby
  ```
  `docker compose up -d --force-recreate` also restores a clean web client, including the empty `serviceworker.js`.
- A leftover backup you can delete: `<emby-config>/plugins/BetterTheEmby/` (the untouched index.html).

## Known limitations

- The add-on targets Emby 4.9.5.0's web client class names (cardBox, itemsContainer, emby-tabs-slider, videoOsdBottom, lyricsItem, scrollSlider, detailImage, nowPlayingBarImage...). Pin the image to `emby/embyserver:4.9.5.0` so an automatic update doesn't change them under you.
- Every non-current lyric line uses a CSS blur filter; very weak GPUs may stutter while lyrics scroll. The blurred page art behind library and detail pages is one more blurred full-screen layer (two while they crossfade).
- The tab slide, the dock-like letter bar, fading hover buttons and Skip Intro's slide-in use current CSS (`@starting-style`, `:has()`); older browsers simply show them without the motion.
- Bilingual grouping needs the original and translation lines to share the exact same LRC timestamp.
- The web client cache needs HTTPS. After an Emby upgrade the new version's files are fetched once and cached again; old entries are dropped as the cache fills (at most 1500 files).
- Deleting only the DLL leaves the injected lines in place; use Dashboard → Plugins → Uninstall (see above).
- The added parts work in Emby's bundled web client (browsers, and apps that open the server's web page), not in Emby's native apps.
- The metadata providers use NetEase's and Apple's public web endpoints, which are not official APIs and may change.
