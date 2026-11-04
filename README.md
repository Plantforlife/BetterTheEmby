# BetterTheEmby

**English** · [中文](README.zh-CN.md)

A server plugin that gives the Emby 4.9 web client a modern look and the things it is missing: Apple-TV-style home and detail pages, Apple-Music-style album colours and lyrics, smooth motion, simpler library tabs, title and pinyin search, a phone layout, and artist and album facts from NetEase Cloud Music and Apple Music.

Everything lives in one plugin, `BetterTheEmby.dll`. On start it adds its styles and scripts to Emby's own web client, so nothing in Emby's installation is edited by hand and no separate front end is deployed. Every part can be turned off in the plugin's settings page.

> Requires **Emby Server 4.9.5.0**. The plugin follows that version's web client; pin your image to `emby/embyserver:4.9.5.0`.

## Features

### Look and motion (Modern UI)

- **Home and libraries**: a full-width banner with the title logo, rating, overview and Play / Details / Favorite. The page behind it is the banner's picture, blurred, so the banner fades into its own art. With a mouse, the art follows the card you rest on.
- **Detail pages**: a full-width backdrop with parallax, the title logo in place of the title, the poster and lines of text coming in one after another. A show, its seasons and episodes share one backdrop that stays put between them.
- **Cards**: lift and lean toward the pointer with a soft glare; a click flies the poster to the detail page and back.
- **Chrome**: frosted-glass header and menus, a pill that slides to the active tab, one highlight that slides through the drawer.
- **Library tabs**: content slides in from the selected tab's side, including first visits to Series and soundtrack categories. Switching again cancels the preceding motion.
- **Video player**: softer gradients, a bolder seek bar, glass buttons; Skip Intro slides in.
- "Reduce motion" in the system turns all motion off.

### Music (Album Tint)

- The album page, the full-screen player and the now-playing bar take the album cover's colours.
- Phones and desktops use the same cover sample; album gradients keep inherited artist artwork out.
- Apple-Music-style covers and lyrics: the current line glows, the others blur with distance, the list glides; bilingual LRC lines are kept together. Point at a line to see its time and click to jump there.
- Desktop lyrics and queue panels continue from their current position when switched mid-animation.
- The cover flies between the now-playing bar or album page and the player.

### Libraries

| Library | Tabs |
|---|---|
| Movies / TV | Shows or films · Suggestions · Favorites · **Series** |
| Music | Albums · **Artists** |
| Music libraries you list in *Folder tabs* | one tab per folder, plus an optional "all" tab |

- **Series**: built from Emby collections. Put the shows and films of one franchise into a collection and they appear in release order, with cover, years, genres and overview. The cover transitions into collection details and back like a normal card.
- **Artists**: one row per artist: photo, name, album count and genres, biography, and albums.
- **Folder tabs**: for a music library organised in folders (soundtracks by game version, by region…). Each tab shows one folder's albums in folder order (numbers by value, Chinese by pinyin), as wide tiles with their first tracks. An optional title prefix is also omitted in that library's home album rows. See [the format](docs/TECHNICAL.md#folder-tabs).
- **Artist pages**: photo, a blurred tint and an *About* card with the full biography. An artist without a biography is looked up when an administrator opens the page.
- **A–Z index**: the letter bar beside a library grid shows pinyin initials A–Z instead of Chinese characters, and every letter is there (Emby lists at most 27 characters).
- **Short version names**: a detail page's *Version* picker shows what comes after the first " - " of each name, so `天气之子 - 4K BluRay-Remux … - Xcat` reads `4K BluRay-Remux … - Xcat`: the title in front is already the page's heading.
- Video detail selectors and their desktop menus share the artwork's rounded corners. The selected entry keeps a light-grey background and a dot; its highlight fills the menu without inset strips.

### Search

- Lists **Shows, Movies, Albums and Album artists**. Albums match their title or album artist; **Episodes / Songs appear only when their own name matches**. Searching a show's name no longer lists all of its episodes.
- **Pinyin**: full pinyin or initials (`gdyg` and `guduyaogun` both find 孤独摇滚), with n and l treated alike.
- Fast: titles and album artists are cached per library and matched in the browser; a later search costs at most two server requests.
- The drawer's search box suggests the same results and opens the search page on Enter.

### Phones

- The phone episode strip starts with two and a half cards. Select a later episode to center it between its neighbours.
- Video details keep Back, Search and More in the floating header. The episode strip stays in place when the synopsis changes length, and a blue border marks the selected episode. Drag the library letter index to choose a letter. Album playback actions sit together in one row.
- Season and episode details use a compact floating header and a blue play button. The phone library index displays the current letter in the center while dragging.
- Phone home banners reserve a fixed space for the title and logo. If a logo loads during a swipe, it fades in once the slide settles.

- Compact episode details keep the episode strip near the first screen. Tap a truncated description to read it in full. Safari uses its native track picker, while other browsers show an anchored menu.

- Show and episode pages have centered playback and native version, audio, and subtitle pickers. A single-season show opens with the same swipeable episode strip as its season page. Rapid selections keep the episode cards resizing smoothly. Shuffle and repeat appear with the music queue.
- Long phone synopses open in a reader. Browser Back closes it and returns to the same place on the episode page.

- Album details show a larger cover on the left and the title, artist and metadata on the right, with full-width playback controls underneath. Long text wraps naturally.
- No tab bar along the bottom; search in the top right; albums three to a row; floating header controls use dark glass for readable text over artwork; a library with many tabs scrolls them sideways.
- Smaller lyrics and translations fit whole phrases on the full-screen player.
- Calmer motion: one short fade per page.
- Pages scroll as a whole, like an ordinary site: Safari's toolbar shrinks away as you scroll, the page goes on under the status bar and the toolbar, and a tap on the status bar goes back to the top. Each page and tab keeps its place when you come back to it.
- **Real full screen on iPhone**: in Safari, Share → *Add to Home Screen*. Opened from the Home Screen, Emby runs without Safari's bars and the page reaches under the status bar.

### Metadata: NetEase Cloud Music and Apple Music

Two metadata providers for music libraries:

- **NetEase Music**: artist biographies and photos; album descriptions, release dates, labels and covers. Strict matching (exact name or a NetEase alias); a refresh only fills empty fields.
- **Apple Music** (public iTunes Search API): album release dates, genres, labels and 1200 px covers for what NetEase doesn't have. Traditional/simplified variants of a title match, together with the artist and year.

NetEase limits how often it answers. The plugin paces its lookups (1.5 s apart by default) and pauses after a refusal; the rest is filled on later refreshes. See [NetEase](docs/TECHNICAL.md#netease-cloud-music-metadata-neteasecs) for the optional signed-in session and the opt-in address rotation.

### Faster loading

Emby's web client re-checks about 110 files on every visit. The plugin turns Emby's empty `serviceworker.js` into a cache: a repeat visit makes 7–9 requests, and on mobile-data latency the page shows in about 0.4 s instead of 1.8 s. HTTPS only.

## Install

1. Download `BetterTheEmby.dll` from the [latest release](https://github.com/Plantforlife/BetterTheEmby/releases/latest) (or build it, below).
2. Copy it into Emby's plugin folder: `<emby-config>/plugins/`.
3. Restart Emby, then reload the browser (Ctrl+F5).

Upgrading from *Album Tint & Modern UI* (`AlbumTint.dll`)? See [Upgrading](docs/TECHNICAL.md#upgrading-from-albumtint).

### Turn on the metadata providers

1. **Dashboard → Libraries**, edit your music library. Under *Music Artists* and *Music Albums*, tick **NetEase Music** in the metadata and image downloaders and move it to the top; under *Music Albums*, also tick **Apple Music** and put it second.
2. On the library, choose **Refresh metadata → Search for missing metadata**, with *Replace existing images* unticked, so only empty fields are filled.
3. If an artist was matched wrongly, use **Identify** on it and pick the right NetEase candidate.

## Settings

**Dashboard → Plugins → BetterTheEmby → Settings**. Changes apply after the web client reloads.

| Group | Settings |
|---|---|
| Look | Modern UI · Album colours and lyrics · Phone layout · Web client cache |
| Libraries | Simpler tabs · Series tab · Artists tab · Folder tabs (JSON) · Short version names |
| Search | Title search · Pinyin search · Pinyin A–Z index |
| NetEase | Pause between lookups · Rotate client address (off by default) · Cookie (optional) |

All settings and their defaults: [docs/TECHNICAL.md](docs/TECHNICAL.md#settings).

## Build

Requires the .NET SDK (6.0 or later).

```bash
# copy MediaBrowser.Common.dll, MediaBrowser.Controller.dll and MediaBrowser.Model.dll
# from your Emby server (the container's /system folder) into ./ref/
dotnet build -c Release
# -> bin/Release/netstandard2.0/BetterTheEmby.dll
```

The Emby assemblies in `ref/` belong to Emby; they are only for compiling and are not part of this repository.

## Turn off and uninstall

- **For everyone**: turn parts off in the settings page.
- **In one browser only**: in the DevTools console, `ModernUI.disable()` / `ModernUI.enable()` and `AlbumTint.disable()` / `AlbumTint.enable()`.
- **Uninstall**: Dashboard → Plugins → BetterTheEmby → Uninstall. The injected lines and files are removed at once and the browser cache is cleared; reload the page. Removing the DLL by hand: see [docs/TECHNICAL.md](docs/TECHNICAL.md#turn-off--uninstall).

## Project layout

```
BetterTheEmby.csproj   plugin project (netstandard2.0)
Plugin.cs              entry point and settings
WebInjector.cs         adds the web files on start and on saving settings, removes them on uninstall
NetEase.cs             NetEase Cloud Music metadata and image provider
AppleMusic.cs          Apple Music album provider (iTunes Search API)
web/modernui.js        Modern UI: banners, art, motion, library tabs, search, A–Z index, phone layout
web/modernui.css       Modern UI styles
web/albumtint.js       album colours, covers, lyrics, player transitions
web/serviceworker.js   web client cache
web/pinyin.js          pinyin of CJK characters (loaded when needed)
web/config.html|.js    the settings page
docs/TECHNICAL.md      how it all works
```

## Known limitations

- Made for the web client of Emby 4.9.5.0; other versions may rename the classes it relies on.
- Works in Emby's bundled web client (browsers, and apps that open the server's web page), not in Emby's native apps.
- The blurred lyrics and page art use the GPU; very old graphics may stutter.
- Some details use current CSS (`@starting-style`, `:has()`); older browsers show them without motion.
- NetEase's and Apple's web endpoints are not official APIs and may change.

## License

[MIT](LICENSE). Not affiliated with Emby, NetEase Cloud Music or Apple.
