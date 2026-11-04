/*
 * Album Tint for Emby Web — Apple-Music-style background that follows the album art.
 * Part of BetterTheEmby (injected by its server plugin). Kill switch for one browser:
 *   localStorage.setItem('albumtint.disabled', '1')  (AlbumTint.disable() / AlbumTint.enable())
 */
(function () {
    'use strict';
    if (window.AlbumTint) return;

    var FADE_MS = 900;
    var BAR_FADE_MS = 260; // now-playing bar show/hide
    // cover corners like Apple Music: ~3% of the art, but kept to a small fixed range (about 8px on the
    // album page, capped at 10px on the big player cover) instead of growing with the size
    var RADIUS_MIN = 6, RADIUS_PCT = 3, RADIUS_MAX = 10;
    function coverRadius(width) { return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, width * RADIUS_PCT / 100)); }
    var DISABLED_KEY = 'albumtint.disabled';
    var STYLE = [
        '#albumtint-bg{position:fixed;inset:0;pointer-events:none;contain:strict}',
        '#albumtint-bg>div{position:absolute;inset:0;opacity:0;transition:opacity ' + FADE_MS + 'ms ease;will-change:opacity}',
        '#albumtint-bg>div.albumtint-on{opacity:1}',
        // the theme's flat background sits under our layer; header/footer/drawer get see-through tints
        'html.albumtint-page .backgroundContainer{background:transparent!important}',
        // Hide inherited artist art as soon as the album is known, including while its palette is loading.
        // Phone layout makes native backdrop children explicitly visible for Safari's bar handling. Hide the
        // drawing descendants as well, so that rule cannot reveal artist artwork over an album palette.
        'html.albumtint-music .backdropContainer,html.albumtint-music .backdropContainer *{visibility:hidden!important}',
        '@media(max-width:40em){html.mui.mui-phonelayout.albumtint-page{background-color:var(--albumtint-base,var(--mui-page))!important}}',
        'html.albumtint-page body{background:transparent}',
        'html.albumtint-page .skinHeader-withBackground,html.albumtint-page .skinHeader-blurred{background:transparent!important}',
        'html.albumtint-page .mainDrawer.drawer-docked{background:rgba(0,0,0,.18)!important}',
        // Emby slides the now-playing bar out (transform, 220ms) when the player opens and back in when you
        // leave; fade it instead. Emby adds .hide on transitionend, which the opacity transition fires as well.
        '.nowPlayingBar-footer{will-change:opacity}',
        '.nowPlayingBar-footer-transition{transition:opacity ' + BAR_FADE_MS + 'ms ease,background-color ' + FADE_MS + 'ms ease!important}',
        '.nowPlayingBar-hidden{transform:none!important;opacity:0;pointer-events:none}',
        // Emby paints the bar's backdrop on .appfooter, which would stay behind as a strip while the bar fades.
        // From 50em up the footer holds nothing but the bar, so the backdrop moves onto the bar itself and fades
        // with it (below 50em the footer also carries Emby's bottom tabs and keeps its own backdrop).
        'html.albumtint-audio .appfooter:has(.nowPlayingBar-footer:not(.hide):not(.nowPlayingBar-hidden)){' +
            'border-radius:14px 14px 0 0;background:rgba(24,24,28,.92)!important}',
        '@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){' +
            'html.albumtint-audio .appfooter:has(.nowPlayingBar-footer:not(.hide):not(.nowPlayingBar-hidden)){' +
                'background:rgba(24,24,28,.61)!important;backdrop-filter:blur(28px) saturate(125%)!important;-webkit-backdrop-filter:blur(28px) saturate(125%)!important}}',
        'html.albumtint-audio .appfooter .nowPlayingBar-footer{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
        'html.albumtint-osd .dialog.albumtint-settings.dialog-animated:not(.dialog-close){' +
            'animation:albumtint-settings-in 420ms cubic-bezier(.22,.8,.24,1) both!important}',
        'html.albumtint-osd .dialog.albumtint-settings.dialog-close{' +
            'animation:albumtint-settings-out 220ms ease-in both!important}',
        '@keyframes albumtint-settings-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}',
        '@keyframes albumtint-settings-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px)}}',
        // cover: one radius for image, frame and glow; an even halo all around in the album's light tone
        'html{--albumtint-radius:clamp(' + RADIUS_MIN + 'px,' + RADIUS_PCT + '%,' + RADIUS_MAX + 'px)}',
        // Emby clips around the cover (contain:paint on the card, overflow:hidden on the containers flush
        // with its top edge), which cut the glow into a square. Unclip the card; give the containers room
        // with padding + an equal negative margin so the layout stays put.
        'html.albumtint-page .osdRemoteControlImageCard,html.albumtint-page .osdRemoteControlImageCardBox,' +
            'html.albumtint-page .detailImageContainerCard,html.albumtint-page .detailImageContainerCard-cardBox' +
            '{contain:none!important;overflow:visible!important;background:transparent!important;box-shadow:none!important;border:0!important;outline:0!important}',
        'html.albumtint-osd .osdPosterContainer{padding-top:64px!important;padding-bottom:64px!important;margin-top:-64px!important;margin-bottom:-64px!important}',
        'html.albumtint-page .topDetailsMain{padding-top:64px!important;margin-top:-64px!important}',
        'html.albumtint-page .albumtint-cover{border-radius:var(--albumtint-radius)!important;overflow:hidden!important;background:transparent!important;' +
            'box-shadow:0 0 0 1px rgba(255,255,255,.08),0 0 22px 0 var(--albumtint-glow,rgba(255,255,255,.17)),' +
            '0 0 56px 8px var(--albumtint-glow-soft,rgba(255,255,255,.08))!important;transition:box-shadow ' + FADE_MS + 'ms ease}',
        'html.albumtint-page .albumtint-cover img{border-radius:inherit!important;box-shadow:none!important}',
        // Apple's hairline edge on the art itself
        'html.albumtint-page .albumtint-cover::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
            'box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}',
        // lyrics: soft fade at both edges, distance-based blur, glowing current line, our own eased scroll
        'html.albumtint-osd .lyricsScroller{scroll-behavior:auto!important;' +
            '-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 var(--albumtint-fade-top,18%),#000 70%,transparent 100%);' +
            'mask-image:linear-gradient(to bottom,transparent 0,#000 var(--albumtint-fade-top,18%),#000 70%,transparent 100%)}',
        // lyrics start at the top; the current line moves down until it reaches the optical middle (a bit
        // above center, like mature players), then the list
        // follows it. Room below the last line lets the ending lines reach the middle too.
        'html.albumtint-osd .osdLyricsItemsContainer{padding-bottom:50vh!important}',
        'html.albumtint-osd .lyricsItem{font-size:225%;font-weight:700;line-height:1.22;margin:.12em 0}',
        'html.albumtint-osd .lyricsItem .listItemBodyText{overflow:visible!important;color:rgba(255,255,255,.34);' +
            'filter:blur(calc(var(--albumtint-d,3) * var(--albumtint-d,3) * .32px));transform-origin:var(--lyrics-transform-origin);' +
            'transition:transform .7s cubic-bezier(.2,.8,.2,1),filter .7s ease,color .7s ease,text-shadow .7s ease}',
        'html.albumtint-osd .lyricsItem-selected .listItemBodyText,html.albumtint-osd .lyricsItem.albumtint-cur .listItemBodyText{color:#fff;filter:none;transform:scale(1.09);' +
            // contour glow, as mature lyric players do it (Spicy Lyrics / am-lyrics use a ~4-5px glow that hugs the
            // glyphs): a tight white rim plus a small halo in the album's hue
            'text-shadow:0 0 3px rgba(255,255,255,.6),0 0 10px var(--albumtint-lyric-glow,rgba(255,255,255,.3))}',
        // hover lights up the whole line group (set by script), instead of Emby's per-row box: quickly on, slowly off
        'html.albumtint-osd .lyricsScroller.albumtint-manual .listItemBodyText,html.albumtint-osd .lyricsItem.albumtint-hov .listItemBodyText{filter:none}',
        'html.albumtint-osd .lyricsItem.albumtint-hov .listItemBodyText{color:rgba(255,255,255,.8);' +
            'transition:transform .7s cubic-bezier(.2,.8,.2,1),filter .22s ease,color .22s ease,text-shadow .7s ease}',
        'html.albumtint-osd .lyricsItem-selected.albumtint-hov .listItemBodyText,html.albumtint-osd .lyricsItem.albumtint-cur.albumtint-hov .listItemBodyText{color:#fff}',
        'html.albumtint-osd .lyricsItem .listItem-content::before{display:none!important}',
        // fixed side padding, so lines of different sizes stay left-aligned (Emby uses ch units)
        'html.albumtint-osd .lyricsItem .listItem-content{padding-inline:14px!important}',
        // bilingual LRC: lines sharing a timestamp form one group (original + translation), NetEase style
        'html.albumtint-osd .lyricsItem.albumtint-lead{margin-top:.34em;margin-bottom:0}',
        'html.albumtint-osd .lyricsItem.albumtint-lead .listItem-content{padding-bottom:0!important}',
        'html.albumtint-osd .lyricsItem.albumtint-sub{font-size:160%;font-weight:600;line-height:1.15;margin-top:-.25em;margin-bottom:.34em}',
        'html.albumtint-osd .lyricsItem.albumtint-sub .listItem-content{padding-top:0!important}',
        // Keep the desktop lyric scale; on a phone leave enough room for a whole phrase and its translation.
        '@media(max-width:40em){' +
            'html.albumtint-osd .lyricsItem{font-size:clamp(1.125rem,5.6vw,1.5rem);line-height:1.4}' +
            'html.albumtint-osd .lyricsItem.albumtint-sub{font-size:clamp(.875rem,3.8vw,1rem);line-height:1.4}' +
            'html.albumtint-osd .lyricsItem-selected .listItemBodyText,html.albumtint-osd .lyricsItem.albumtint-cur .listItemBodyText{transform:scale(1.04)}' +
        '}',
        'html.albumtint-osd .lyricsItem,html.albumtint-osd .lyricsItem:hover,html.albumtint-osd .lyricsItem:focus,' +
            'html.albumtint-osd .lyricsItem .listItem-content{background:transparent!important;box-shadow:none!important}',
        // every line is a "play from here" button (Emby seeks on click). A plate slides under the line the pointer is
        // on (while a finger scrolls: the line at the anchor) and shows the time that line starts at.
        'html.albumtint-osd .lyricsItem{cursor:pointer}',
        'html.albumtint-osd .lyricsScroller{scrollbar-width:none}',
        'html.albumtint-osd .lyricsScroller::-webkit-scrollbar{display:none}',
        '.albumtint-lslider{position:relative;isolation:isolate}',
        '.albumtint-lhl{position:absolute;left:0;top:0;z-index:-1;pointer-events:none;opacity:0;' +
            'transition:transform .34s cubic-bezier(.22,.8,.24,1),width .34s cubic-bezier(.22,.8,.24,1),height .34s cubic-bezier(.22,.8,.24,1),opacity .2s ease}',
        '.albumtint-lhl.albumtint-lhl-on{opacity:1}',
        '.albumtint-lhl::before{content:"";position:absolute;inset:0;border-radius:14px;background:rgba(255,255,255,.075);' +
            'box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);transition:background-color .18s ease,transform .18s ease}',
        '.albumtint-lhl.albumtint-lhl-press::before{background:rgba(255,255,255,.13);transform:scale(.985)}',
        '.albumtint-lhl.albumtint-lhl-tap::before{animation:albumtint-lhl-tap .5s ease-out}',
        '@keyframes albumtint-lhl-tap{from{background:rgba(255,255,255,.22);transform:scale(.975)}to{background:rgba(255,255,255,.075);transform:none}}',
        '.albumtint-lhl-time{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:1px;' +
            'padding:3px 9px 3px 5px;border-radius:999px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.85);' +
            'font-size:13px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:.02em;white-space:nowrap}',
        '.albumtint-lhl-time .md-icon{font-size:17px}',
        // the hover overlay is a sibling of the cover, not a child: give it the same corners, no gray wash
        'html.albumtint-page .osdRemoteControlImageCardBox .cardOverlayContainer,html.albumtint-page .detailImageContainerCard-cardBox .cardOverlayContainer' +
            '{border-radius:var(--albumtint-radius)!important;overflow:hidden!important;background:linear-gradient(to bottom,transparent 55%,rgba(0,0,0,.38))!important}',
        // page <-> player transition: a copy of the cover flies between the two positions
        'html.albumtint-hide-osdcover .osdRemoteControlImageCardContent,html.albumtint-hide-pagecover .view-item-item .detailImage,' +
            'html.albumtint-hide-barcover .nowPlayingBarImage{visibility:hidden!important}',
        '.albumtint-fly{position:fixed;z-index:100000;pointer-events:none;background:center/cover no-repeat;' +
            'box-shadow:0 0 0 1px rgba(255,255,255,.08),0 0 22px 0 var(--albumtint-glow,rgba(255,255,255,.17)),0 0 56px 8px var(--albumtint-glow-soft,rgba(255,255,255,.08))}'
    ].join('\n');

    // ---------- color helpers ----------
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
        if (max !== min) {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return { h: h, s: s, l: l };
    }
    function hsl(c, a) {
        var s = 'hsl' + (a == null ? '(' : 'a(') + c.h.toFixed(1) + ',' + (c.s * 100).toFixed(1) + '%,' + (c.l * 100).toFixed(1) + '%';
        return s + (a == null ? ')' : ',' + a + ')');
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function hueDist(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

    // Dominant colors: bucket pixels (4 bits/channel), merge near buckets, score by population and chroma.
    function extract(img) {
        var N = 64, canvas = document.createElement('canvas');
        canvas.width = canvas.height = N;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, N, N);
        var data = ctx.getImageData(0, 0, N, N).data, buckets = {}, total = 0;
        for (var i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 200) continue;
            var r = data[i], g = data[i + 1], b = data[i + 2];
            var key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
            var k = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
            k.n++; k.r += r; k.g += g; k.b += b; total++;
        }
        var list = Object.keys(buckets).map(function (key) {
            var k = buckets[key];
            return { n: k.n, r: k.r / k.n, g: k.g / k.n, b: k.b / k.n };
        }).sort(function (a, b) { return b.n - a.n; });

        var clusters = [];
        list.forEach(function (c) {
            for (var j = 0; j < clusters.length; j++) {
                var m = clusters[j], dr = m.r - c.r, dg = m.g - c.g, db = m.b - c.b;
                if (dr * dr + dg * dg + db * db < 42 * 42) {
                    var n = m.n + c.n;
                    m.r = (m.r * m.n + c.r * c.n) / n; m.g = (m.g * m.n + c.g * c.n) / n; m.b = (m.b * m.n + c.b * c.n) / n; m.n = n;
                    return;
                }
            }
            clusters.push({ n: c.n, r: c.r, g: c.g, b: c.b });
        });
        clusters.forEach(function (c) {
            c.hsl = rgbToHsl(c.r, c.g, c.b);
            var chroma = c.hsl.s * (1 - Math.abs(2 * c.hsl.l - 1));
            // near-white / near-black areas (paper, line art) count, but much less than real color
            c.score = (c.n / total) * (0.15 + chroma * 2.2);
        });
        clusters.sort(function (a, b) { return b.score - a.score; });

        var picked = [];
        for (var x = 0; x < clusters.length && picked.length < 3; x++) {
            var c = clusters[x];
            if (c.n / total < 0.015) continue;
            var distinct = picked.every(function (p) {
                return hueDist(p.hsl.h, c.hsl.h) > 22 || Math.abs(p.hsl.l - c.hsl.l) > 0.22 || Math.abs(p.hsl.s - c.hsl.s) > 0.35;
            });
            if (distinct) picked.push(c);
        }
        if (!picked.length) picked.push(clusters[0] || { hsl: { h: 0, s: 0, l: 0.2 } });
        while (picked.length < 3) picked.push(picked[picked.length - 1]);
        return picked.map(function (c) { return c.hsl; });
    }

    // Map art colors to a dark, readable Apple-Music-like scheme (white text stays readable).
    function buildScheme(colors) {
        function deep(c, lBase, lSpan, sMax) {
            var s = c.s < 0.08 ? c.s : clamp(c.s * 0.9 + 0.1, 0, sMax);
            return { h: c.h, s: s, l: clamp(lBase + c.l * lSpan, 0.06, 0.36) };
        }
        var main = deep(colors[0], 0.13, 0.13, 0.7);
        var second = deep(colors[1], 0.12, 0.16, 0.7);
        var third = deep(colors[2], 0.10, 0.14, 0.65);
        var glow = { h: main.h, s: main.s, l: clamp(main.l + 0.09, 0, 0.42) };
        var floor = { h: main.h, s: main.s * 0.8, l: clamp(main.l * 0.45, 0.04, 0.12) };
        var vivid = colors.slice().sort(function (a, b) { return b.s - a.s; })[0];
        var accent = vivid.s < 0.15 ? { h: 0, s: 0, l: 0.85 } : { h: vivid.h, s: clamp(vivid.s, 0.45, 0.85), l: 0.72 };
        return {
            main: main,
            background: [
                'radial-gradient(110% 80% at 12% 0%,' + hsl(glow, 0.95) + ' 0%,' + hsl(glow, 0) + ' 62%)',
                'radial-gradient(90% 70% at 92% 18%,' + hsl(second, 0.85) + ' 0%,' + hsl(second, 0) + ' 60%)',
                'radial-gradient(120% 90% at 45% 112%,' + hsl(third, 0.8) + ' 0%,' + hsl(third, 0) + ' 62%)',
                'linear-gradient(180deg,' + hsl(main) + ' 0%,' + hsl(floor) + ' 100%)'
            ].join(','),
            // the halo around the cover: soft and spread out; a white cover glows a lot by itself, so even less
            glow: colors[0].s < 0.12 ? (colors[0].l > 0.75 ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.17)') : hsl({ h: colors[0].h, s: clamp(colors[0].s, 0.35, 0.7), l: 0.78 }, 0.26),
            glowSoft: colors[0].s < 0.12 ? (colors[0].l > 0.75 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.08)') : hsl({ h: colors[0].h, s: clamp(colors[0].s, 0.35, 0.7), l: 0.72 }, 0.12),
            lyricGlow: colors[0].s < 0.12 ? 'rgba(255,255,255,.3)' : hsl({ h: colors[0].h, s: clamp(colors[0].s, 0.45, 0.7), l: 0.85 }, 0.45),
            accent: hsl(accent)
        };
    }

    // ---------- image loading (cached per URL) ----------
    var schemeCache = {};
    function loadImage(url, cors) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            if (cors) img.crossOrigin = 'anonymous';
            img.decoding = 'async';
            img.onload = function () { resolve(img); };
            img.onerror = reject;
            img.src = url;
        });
    }
    function schemeFor(url) {
        if (schemeCache[url]) return schemeCache[url];
        var p = loadImage(url, true).catch(function () { return loadImage(url, false); })
            .then(function (img) { return buildScheme(extract(img)); });
        p.catch(function () { delete schemeCache[url]; });
        return (schemeCache[url] = p);
    }

    // ---------- Emby glue ----------
    function api() { return window.ApiClient; }
    var itemCache = {};
    function getItem(id) {
        var a = api();
        if (!a || !a.getCurrentUserId()) return Promise.reject(new Error('no session'));
        var view = document.querySelector('.itemView:not(.hide)'), controller = view && view.controller;
        if (controller && controller.params && String(controller.params.id) === String(id) && controller.dataPromise) {
            return controller.dataPromise.then(function () {
                var item = controller.currentItem;
                if (item && String(item.Id) === String(id)) return item;
                return a.getItem(a.getCurrentUserId(), id);
            });
        }
        if (!itemCache[id]) {
            itemCache[id] = a.getItem(a.getCurrentUserId(), id);
            itemCache[id].catch(function () { delete itemCache[id]; });
        }
        return itemCache[id];
    }
    // Album art URL for an album or a track (falls back to the track's own art).
    function artUrl(item) {
        var a = api(), id, tag;
        if (!item || !a) return null;
        if (item.Type === 'MusicAlbum' && item.ImageTags && item.ImageTags.Primary) { id = item.Id; tag = item.ImageTags.Primary; }
        else if (item.AlbumId && item.AlbumPrimaryImageTag) { id = item.AlbumId; tag = item.AlbumPrimaryImageTag; }
        else if (item.ImageTags && item.ImageTags.Primary) { id = item.Id; tag = item.ImageTags.Primary; }
        else if (item.PrimaryImageItemId && item.PrimaryImageTag) { id = item.PrimaryImageItemId; tag = item.PrimaryImageTag; }
        if (!id) return null;
        // getImageUrl scales widths by devicePixelRatio and can rewrite quality. Palette extraction needs the
        // same pixels on every screen, rather than a different compressed image on a high-DPI phone.
        return a.getUrl('Items/' + id + '/Images/Primary', { tag: tag, maxWidth: 160, quality: 90 });
    }

    function routeInfo() {
        var h = location.hash || '';
        var q = h.indexOf('?') >= 0 ? h.slice(h.indexOf('?') + 1) : '';
        var params = {};
        q.split('&').forEach(function (kv) {
            var i = kv.indexOf('=');
            if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
        });
        return { path: h.replace(/^#!?\/?/, '').split('?')[0].toLowerCase(), id: params.id };
    }

    var pm = null, events = null, playingUrl = null;
    function playingAudioItem() {
        try {
            if (!pm || !pm.isPlayingAudio()) return null;
            var item = pm.currentItem(pm.getCurrentPlayer());
            return item && (item.MediaType === 'Audio' || item.Type === 'Audio') ? item : null;
        } catch (e) { return null; }
    }

    // ---------- applying ----------
    var root = document.documentElement, layers = null, front = 0, pageToken = 0, pageUrl = null;
    var VARS = ['--background-hue', '--background-saturation', '--background-lightness', '--theme-accent-text-color', '--albumtint-glow', '--albumtint-glow-soft',
        '--albumtint-lyric-glow', '--albumtint-base'];

    function ensureDom() {
        if (layers && layers[0].isConnected) return true;
        var anchor = document.querySelector('.backgroundContainer');
        if (!anchor) return false;
        var host = document.getElementById('albumtint-bg');
        if (!host) {
            host = document.createElement('div');
            host.id = 'albumtint-bg';
            host.innerHTML = '<div></div><div></div>';
            anchor.parentNode.insertBefore(host, anchor.nextSibling);
        }
        layers = [host.children[0], host.children[1]];
        return true;
    }

    function setPage(url) {
        root.classList.toggle('albumtint-music', !!url);
        if (url === pageUrl) return;
        pageUrl = url;
        var token = ++pageToken;
        setEnhancer(!!url);
        if (!url) {
            root.classList.remove('albumtint-page');
            VARS.forEach(function (v) { root.style.removeProperty(v); });
            if (layers) layers.forEach(function (l) { l.classList.remove('albumtint-on'); });
            return;
        }
        schemeFor(url).then(function (s) {
            if (token !== pageToken || !ensureDom()) return;
            var next = layers[1 - front];
            next.style.background = s.background;
            next.classList.add('albumtint-on');
            layers[front].classList.remove('albumtint-on');
            front = 1 - front;
            root.style.setProperty('--background-hue', s.main.h.toFixed(1));
            root.style.setProperty('--background-saturation', (s.main.s * 60).toFixed(1) + '%');
            root.style.setProperty('--background-lightness', (s.main.l * 100 * 0.8).toFixed(1) + '%');
            root.style.setProperty('--theme-accent-text-color', s.accent);
            root.style.setProperty('--albumtint-glow', s.glow);
            root.style.setProperty('--albumtint-glow-soft', s.glowSoft);
            root.style.setProperty('--albumtint-lyric-glow', s.lyricGlow);
            // Mobile art fades into the document at Safari's bars. Use the palette's real base there, rather
            // than the darker, desaturated theme tint used for Emby's controls.
            root.style.setProperty('--albumtint-base', hsl(s.main));
            root.classList.add('albumtint-page');
        }, function (e) {
            if (token === pageToken) { setPage(null); console.warn('[AlbumTint]', e); }
        });
    }

    // Music uses its cover palette, never the parent artist's backdrop. Hook the native backdrop decision
    // too, so the unused full-screen image is not fetched or briefly painted before Album Tint updates.
    var backdropHooked = false;
    function hookBackdrop() {
        if (backdropHooked || !window.Emby || typeof Emby.importModule !== 'function') return;
        backdropHooked = true;
        Emby.importModule('./modules/backdrop/backdrop.js').then(function (m) {
            var bg = m.default || m, get = bg.getBackdropsFromOptions, set = bg.setBackdrops;
            function music(items) {
                return !isDisabled() && items && items.length && items.every(function (it) {
                    return (it.Type === 'MusicAlbum' || (it.Type === 'Audio' && it.MediaType === 'Audio')) && artUrl(it);
                });
            }
            bg.getBackdropsFromOptions = function (items, options) {
                return music(items) ? [] : get.apply(this, arguments);
            };
            bg.setBackdrops = function (items, options) {
                if (music(items)) { setPage(artUrl(items[0])); return set.call(this, [], options); }
                return set.apply(this, arguments);
            };
        }, function () { backdropHooked = false; });
    }

    // ---------- cover halo + Apple-Music-style lyrics ----------
    var COVERS = [
        ['.view-videoosd-videoosd:not(.hide) .osdRemoteControlImageCardBox', '.osdRemoteControlImageCardContent'],
        ['.view-item-item:not(.hide) .detailImageContainerCard-cardBox', '.detailImage']
    ];
    var LYRIC_ANCHOR = 0.42, GLIDE_MS = 750, MANUAL_MS = 3000;
    // the seek plate: room around the text (vertically it stays inside the row's own padding), gap before the time
    var PLATE_PAD_X = 12, PLATE_PAD_Y = 4, PLATE_GAP = 10;
    var enhanceTimer = 0;

    function setEnhancer(on) {
        if (on && !enhanceTimer) { enhanceTimer = setInterval(enhance, 300); enhance(); }
        else if (!on && enhanceTimer) { clearInterval(enhanceTimer); enhanceTimer = 0; }
    }
    function enhance() {
        COVERS.forEach(function (c) {
            var box = document.querySelector(c[0]);
            if (box) decorateCover(box, box.querySelector(c[1]));
        });
        var list = document.querySelector('.view-videoosd-videoosd:not(.hide) .osdLyricsItemsContainer');
        if (list) enhanceLyrics(list);
        rememberCovers();
    }

    function decorateCover(box, content) {
        if (content) content.classList.add('albumtint-cover');
    }

    function lyricItems(list) { return list.querySelectorAll('.lyricsItem'); }

    // Emby keeps the timed events on the items container; rows carry their index
    function ticksOf(list, el) {
        var row = list.items && list.items[+el.getAttribute('data-index')];
        return row && row.StartPositionTicks != null ? row.StartPositionTicks : null;
    }
    // the line plus its neighbours with the same timestamp (a translation line, a romanization line...)
    function groupOf(list, el) {
        var items = Array.prototype.slice.call(lyricItems(list)), i = items.indexOf(el), t = ticksOf(list, el);
        if (i < 0 || t == null) return [el];
        var a = i, b = i;
        while (a > 0 && ticksOf(list, items[a - 1]) === t) a--;
        while (b < items.length - 1 && ticksOf(list, items[b + 1]) === t) b++;
        return items.slice(a, b + 1);
    }

    // --albumtint-d = distance (in line groups) from the current group, drives the blur
    function markDistances(list) {
        if (list.__albumtintMarkQueued) return;
        list.__albumtintMarkQueued = true;
        setTimeout(function () {
            list.__albumtintMarkQueued = false;
            var items = lyricItems(list), groups = [], sel = -1, last;
            for (var i = 0; i < items.length; i++) {
                var t = ticksOf(list, items[i]);
                if (t == null || t !== last) groups.push([]);
                last = t;
                groups[groups.length - 1].push(items[i]);
                if (items[i].classList.contains('lyricsItem-selected')) sel = groups.length - 1;
            }
            groups.forEach(function (members, g) {
                var d = Math.min(sel < 0 ? g + 1 : Math.abs(g - sel), 4);
                members.forEach(function (el, k) {
                    el.classList.toggle('albumtint-lead', k === 0 && members.length > 1);
                    el.classList.toggle('albumtint-sub', k > 0);
                    el.classList.toggle('albumtint-cur', g === sel);
                    if (el.__albumtintD !== d) { el.__albumtintD = d; el.style.setProperty('--albumtint-d', d); }
                });
            });
        }, 16);
    }

    // els: the current line group; its middle goes to the anchor
    function glide(scroller, els, instant) {
        cancelAnimationFrame(scroller.__albumtintRaf);
        clearTimeout(scroller.__albumtintSettle);
        var sRect = scroller.getBoundingClientRect();
        var top = els[0].getBoundingClientRect().top, bottom = els[els.length - 1].getBoundingClientRect().bottom;
        var target = scroller.scrollTop + (top - sRect.top) + (bottom - top) / 2 - scroller.clientHeight * LYRIC_ANCHOR;
        target = clamp(target, 0, scroller.scrollHeight - scroller.clientHeight);
        var from = scroller.scrollTop, delta = target - from;
        function set(v) { scroller.scrollTop = v; if (scroller.__albumtintFade) scroller.__albumtintFade(); }
        scroller.__albumtintGlideEnd = 0;
        if (instant || document.hidden || Math.abs(delta) < 1) { set(target); return; }
        var t0 = performance.now();
        scroller.__albumtintGlideEnd = t0 + GLIDE_MS;
        function step(now) {
            var t = clamp((now - t0) / GLIDE_MS, 0, 1);
            var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            set(from + delta * e);
            if (t < 1) scroller.__albumtintRaf = requestAnimationFrame(step);
        }
        scroller.__albumtintRaf = requestAnimationFrame(step);
        // background tabs pause rAF; make sure we still end up on the line
        scroller.__albumtintSettle = setTimeout(function () {
            cancelAnimationFrame(scroller.__albumtintRaf);
            set(target);
        }, GLIDE_MS + 150);
    }

    // 1:19, or 1:02:05 past an hour
    function clock(ticks) {
        var s = Math.floor(ticks / 1e7), m = Math.floor(s / 60);
        s %= 60;
        return (m >= 60 ? Math.floor(m / 60) + ':' + ('0' + m % 60).slice(-2) : m) + ':' + ('0' + s).slice(-2);
    }

    function enhanceLyrics(list) {
        if (list.__albumtint) return;
        var scroller = list.closest('.lyricsScroller');
        if (!scroller) return;
        list.__albumtint = true;
        var manualUntil = 0, manualTimer = 0;
        // shown: the line group under the plate; mouse: the resting pointer; aiming: a finger is scrolling;
        // pending: a clicked group waiting to become the current one
        var plate = null, shown = null, mouse = null, aiming = false, pending = null, reaimTimer = 0, lastPointer = 'mouse';

        function current() { return list.querySelector('.lyricsItem-selected'); }
        function rowOf(t) { return t && t.closest ? t.closest('.lyricsItem') : null; }
        // the line under the pointer; in the margin between two lines, the nearer one (so the plate doesn't blink
        // off and on while the pointer crosses over); below the last line, none
        function rowAt(t, y) {
            var row = rowOf(t);
            if (row || t !== list) return row;
            var rows = lyricItems(list), best = null, bestD = 16;
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i].getBoundingClientRect(), d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
                if (d < bestD) { bestD = d; best = rows[i]; }
            }
            return best;
        }

        // Emby calls this whenever the current line changes; replace its native jump with an eased glide
        var original = list.scrollToIndex;
        list.scrollToIndex = function (index, options, focus) {
            var el = lyricItems(list)[index];
            if (!el) return original && original.apply(list, arguments);
            if (focus && el.focus) el.focus({ preventScroll: true });
            markDistances(list);
            if (pending) {
                // a clicked line is on its way: don't glide to the lines the seek passes on the way there
                if (pending.group.indexOf(el) < 0 && Date.now() < pending.until) return;
                pending = null;
            }
            if (Date.now() >= manualUntil) glide(scroller, groupOf(list, el));
        };

        function endManual() {
            manualUntil = 0;
            clearTimeout(manualTimer);
            scroller.classList.remove('albumtint-manual');
        }
        function onManual() {
            manualUntil = Date.now() + MANUAL_MS;
            cancelAnimationFrame(scroller.__albumtintRaf);
            clearTimeout(scroller.__albumtintSettle);
            scroller.__albumtintGlideEnd = 0;
            scroller.classList.add('albumtint-manual');
            clearTimeout(manualTimer);
            manualTimer = setTimeout(function () {
                scroller.classList.remove('albumtint-manual');
                if (aiming) { aiming = false; if (!mouse) setHover(null); }
                var el = current();
                if (el && list.isConnected) glide(scroller, groupOf(list, el));
            }, MANUAL_MS);
        }
        scroller.addEventListener('wheel', onManual, { passive: true });
        // a finger that scrolls the lyrics aims at the line at the anchor (a tap alone scrolls nothing, so it doesn't)
        scroller.addEventListener('touchstart', function () { aiming = true; onManual(); }, { passive: true });

        // no top fade while the first lines sit at the top; it grows in as the list starts to scroll
        function updateFade() {
            var pct = Math.min(18, scroller.scrollTop / Math.max(1, scroller.clientHeight) * 100);
            scroller.style.setProperty('--albumtint-fade-top', pct.toFixed(1) + '%');
        }
        scroller.__albumtintFade = updateFade;
        scroller.addEventListener('scroll', function () {
            updateFade();
            if (aiming) onManual(); // momentum keeps it in manual mode
            if (!reaimTimer) reaimTimer = setTimeout(reaim, 40);
        }, { passive: true });
        updateFade();

        // the plate lives in the scrolling content, behind the text, so it moves with the lines
        var slider = list.parentNode;
        if (slider && slider.nodeType === 1) {
            slider.classList.add('albumtint-lslider');
            plate = document.createElement('div');
            plate.className = 'albumtint-lhl';
            plate.innerHTML = '<span class="albumtint-lhl-time"><i class="md-icon">play_arrow</i><span></span></span>';
            plate.addEventListener('animationend', function () { plate.classList.remove('albumtint-lhl-tap'); });
            slider.appendChild(plate);
        }
        // around the group's text (not the whole row), with the group's start time at its end
        function placePlate(group) {
            if (!plate) return;
            var box = null;
            (group || []).forEach(function (row) {
                var t = row.querySelector('.listItemBodyText');
                if (!t || !t.firstChild) return;
                var range = document.createRange();
                range.selectNodeContents(t);
                var r = range.getBoundingClientRect();
                if (!r.width) return;
                box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) }
                    : { l: r.left, t: r.top, r: r.right, b: r.bottom };
            });
            if (!box) { plate.classList.remove('albumtint-lhl-on'); shown = null; return; }
            shown = group;
            var ticks = ticksOf(list, group[0]), chip = plate.firstChild;
            chip.style.display = ticks == null ? 'none' : '';
            if (ticks != null) chip.lastChild.textContent = clock(ticks);
            var s = slider.getBoundingClientRect();
            var x = box.l - s.left - PLATE_PAD_X, y = box.t - s.top - PLATE_PAD_Y;
            var w = Math.min(box.r - box.l + 2 * PLATE_PAD_X + (ticks == null ? 0 : chip.offsetWidth + PLATE_GAP), s.width - x);
            var h = box.b - box.t + 2 * PLATE_PAD_Y;
            // coming back: appear in place (fade only), not slide over from wherever it was last
            var appear = !plate.classList.contains('albumtint-lhl-on');
            if (appear) plate.style.transition = 'opacity .2s ease';
            plate.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
            plate.style.width = w.toFixed(1) + 'px';
            plate.style.height = h.toFixed(1) + 'px';
            if (appear) { void plate.offsetWidth; plate.style.transition = ''; }
            plate.classList.add('albumtint-lhl-on');
        }

        // hovering any line of a group highlights the whole group
        function setHover(el) {
            var on = el ? groupOf(list, el) : [];
            if (on.length && shown && on[0] === shown[0]) return;
            Array.prototype.forEach.call(list.querySelectorAll('.albumtint-hov'), function (x) {
                if (on.indexOf(x) < 0) x.classList.remove('albumtint-hov');
            });
            on.forEach(function (x) { x.classList.add('albumtint-hov'); });
            placePlate(on.length ? on : null);
        }
        function aimAtAnchor() {
            var y = scroller.getBoundingClientRect().top + scroller.clientHeight * LYRIC_ANCHOR, rows = lyricItems(list), best = null, bestD = Infinity;
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i].getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - y);
                if (d < bestD) { bestD = d; best = rows[i]; }
            }
            setHover(best);
        }
        // The pointer is on a line now. While a glide runs, the plate stays with its line (a clicked one, say) and
        // catches up with the pointer once the glide is over, instead of hopping over every line that slides by
        // (Chrome sends hover events for those too).
        function pointTo(t, y) {
            var wait = (scroller.__albumtintGlideEnd || 0) - performance.now();
            if (wait > 0) { clearTimeout(reaimTimer); reaimTimer = setTimeout(reaim, wait + 30); return; }
            setHover(rowAt(t, y));
        }
        // the lines moved under a resting pointer (wheel, glide) or a scrolling finger: aim again
        function reaim() {
            reaimTimer = 0;
            if (!list.isConnected) return;
            if (aiming) aimAtAnchor();
            else if (mouse) pointTo(document.elementFromPoint(mouse.x, mouse.y), mouse.y);
        }
        list.addEventListener('pointerover', function (e) {
            if (e.pointerType !== 'mouse') return;
            mouse = { x: e.clientX, y: e.clientY };
            if (!aiming) pointTo(e.target, e.clientY);
        });
        list.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'mouse') return;
            mouse = { x: e.clientX, y: e.clientY };
            if (e.target === list && !aiming) pointTo(list, e.clientY);
        }, { passive: true });
        list.addEventListener('pointerleave', function (e) {
            if (e.pointerType !== 'mouse') return;
            mouse = null;
            if (plate) plate.classList.remove('albumtint-lhl-press');
            if (!aiming) setHover(null);
        });
        list.addEventListener('pointerdown', function (e) {
            lastPointer = e.pointerType;
            var row = rowOf(e.target);
            if (plate && row && e.pointerType === 'mouse' && shown && shown.indexOf(row) >= 0) plate.classList.add('albumtint-lhl-press');
        });
        ['pointerup', 'pointercancel'].forEach(function (name) {
            list.addEventListener(name, function () { if (plate) plate.classList.remove('albumtint-lhl-press'); });
        });

        // Emby seeks on the click. The plate flashes, and the line glides to the middle as soon as it is current
        // (Emby itself doesn't scroll to the line that has focus, which a clicked line does).
        function followPending() {
            if (!pending) return;
            var c = current();
            if (c && pending.group.indexOf(c) >= 0) { var g = pending.group; pending = null; glide(scroller, g); }
            else if (Date.now() > pending.until) pending = null;
        }
        list.addEventListener('click', function (e) {
            var row = rowOf(e.target);
            if (!row || ticksOf(list, row) == null) return;
            aiming = false;
            endManual();
            setHover(row);
            if (plate) { plate.classList.remove('albumtint-lhl-tap'); void plate.offsetWidth; plate.classList.add('albumtint-lhl-tap'); }
            pending = { group: groupOf(list, row), until: Date.now() + 2500 };
            followPending();
            // a finger leaves no hover behind: let the plate go once it has flashed
            if (lastPointer !== 'mouse') setTimeout(function () { if (!mouse && !aiming) setHover(null); }, 700);
        });
        // a line that turns current grows; the plate follows once it has
        list.addEventListener('transitionend', function (e) {
            if (shown && e.propertyName === 'transform' && shown.some(function (r) { return r.contains(e.target); })) placePlate(shown);
        });

        new MutationObserver(function () {
            markDistances(list);
            followPending();
            if (shown && !shown[0].isConnected) { shown = null; pending = null; setHover(null); } // another song
        }).observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        markDistances(list);
        var sel = current();
        if (sel) glide(scroller, groupOf(list, sel), true);
    }

    // ---------- album page / now-playing bar <-> full-screen player transition ----------
    var FLY_MS = 560, FLY_EASE = 'cubic-bezier(.22,.8,.24,1)';
    var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var osdCover = null, pageCover = null, barSource = null, prevViewOsd = false;

    function boxOf(el) {
        var r = el && el.getBoundingClientRect();
        return r && r.width > 4 && r.height > 4 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    }
    function imageOf(el) {
        var img = el.querySelector('img');
        if (img && (img.currentSrc || img.src)) return img.currentSrc || img.src;
        var m = /url\(["']?([^"')]+)/.exec(getComputedStyle(el).backgroundImage || '');
        return m ? m[1] : '';
    }
    function cornerOf(el, box) {
        if (el.classList.contains('albumtint-cover')) return coverRadius(box.width);
        var v = getComputedStyle(el).borderTopLeftRadius;
        return /%$/.test(v) ? box.width * parseFloat(v) / 100 : parseFloat(v) || 0;
    }
    function snapshot(el) {
        var box = boxOf(el);
        return box && el.style.visibility !== 'hidden' ? { box: box, src: imageOf(el), radius: cornerOf(el, box), at: Date.now() } : null;
    }
    // called from the enhancer tick, so we know where the covers were right before a view switch
    function rememberCovers() {
        var osd = document.querySelector('.view-videoosd-videoosd:not(.hide) .albumtint-cover');
        var page = document.querySelector('.view-item-item:not(.hide) .albumtint-cover');
        if (osd) osdCover = snapshot(osd) || osdCover;
        if (page) pageCover = snapshot(page) || pageCover;
    }
    function isPlayingAlbumArt(src) {
        var item = playingAudioItem();
        return !!(item && src && item.AlbumId && src.indexOf('/Items/' + item.AlbumId + '/') >= 0);
    }

    // Fly a copy of the art from `from` to the element findTarget() returns. Everything happens without a
    // visible gap: the destination (and source) covers are hidden by classes on <html> in the same frame the
    // view switches, and the copy sits still on the source spot until the destination has been laid out.
    // Only one copy is ever in the air: navigating again mid-flight continues from where the copy is now.
    var activeFlight = null;
    function flight(from, hideClasses, findTarget) {
        if (reduceMotion) return;
        if (activeFlight) from = activeFlight.stop() || from;
        if (!from || !from.box) return;
        var srcs = from.srcs || [from.src].filter(Boolean);
        var now = { box: from.box, radius: from.radius };
        var ghost = document.createElement('div');
        ghost.className = 'albumtint-fly';
        place(ghost, now.box, now.radius);
        setImages(ghost, srcs);
        document.body.appendChild(ghost);
        hideClasses.forEach(function (c) { root.classList.add(c); });
        var finished = false, self;
        function done() {
            if (finished) return;
            finished = true;
            hideClasses.forEach(function (c) { root.classList.remove(c); });
            ghost.remove();
            if (activeFlight === self) activeFlight = null;
        }
        self = activeFlight = {
            // hand the current position over to the next flight and vanish in the same frame
            stop: function () {
                if (finished) return null;
                var state = { box: now.box, radius: now.radius, srcs: srcs };
                done();
                return state;
            }
        };
        waitFor(function () {
            var el = findTarget();
            return el && boxOf(el) ? el : null;
        }, function (first) {
            if (finished) return;
            var start = { box: now.box, radius: now.radius }, last = boxOf(first);
            var barRadius = first.classList.contains('nowPlayingBarImage') ? cornerOf(first, last) : null;
            // sharp destination art on top, the already-loaded source image underneath
            var src = imageOf(first);
            if (src && srcs.indexOf(src) < 0) srcs = [src].concat(srcs);
            setImages(ghost, srcs);
            // re-measure the destination every frame: the page may still be re-laying out (or swap the
            // element) while we fly, and the copy has to land exactly where the cover really is
            var t0 = performance.now();
            (function step(ts) {
                if (finished) return;
                var el = findTarget(), box = el && boxOf(el);
                if (box) last = box;
                var t = clamp(((ts || performance.now()) - t0) / FLY_MS, 0, 1), e = ease(t);
                var toRadius = barRadius != null ? barRadius : coverRadius(last.width);
                now = {
                    box: {
                        left: mix(start.box.left, last.left, e), top: mix(start.box.top, last.top, e),
                        width: mix(start.box.width, last.width, e), height: mix(start.box.height, last.height, e)
                    },
                    radius: mix(start.radius, toRadius, e)
                };
                place(ghost, now.box, now.radius);
                if (t < 1) requestAnimationFrame(step);
                else done();
            })();
            setTimeout(done, FLY_MS + 400);
        }, 600, function () {
            // the destination never showed up (navigated elsewhere, unusual layout): fade out instead of hanging
            if (finished) return;
            if (ghost.animate) ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
            setTimeout(done, 220);
        });
        setTimeout(done, 600 + FLY_MS + 600);
    }
    function setImages(el, srcs) {
        el.style.backgroundImage = srcs.map(function (u) { return 'url("' + u.replace(/"/g, '%22') + '")'; }).join(',');
    }
    function mix(a, b, t) { return a + (b - a) * t; }
    // cubic-bezier(.22,.8,.24,1), same curve the CSS side uses
    function ease(x) {
        var x1 = 0.22, y1 = 0.8, x2 = 0.24, y2 = 1, t = x;
        for (var i = 0; i < 8; i++) {
            var cx = 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t - x;
            var dx = 3 * x1 * (1 - t) * (1 - 3 * t) + 3 * x2 * t * (2 - 3 * t) + 3 * t * t;
            if (Math.abs(cx) < 1e-4 || !dx) break;
            t = Math.min(1, Math.max(0, t - cx / dx));
        }
        return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
    }
    function place(el, box, radius) {
        el.style.left = box.left + 'px';
        el.style.top = box.top + 'px';
        el.style.width = box.width + 'px';
        el.style.height = box.height + 'px';
        el.style.borderRadius = radius + 'px';
    }
    function rise(el, delay, dy) {
        if (!el || reduceMotion || !el.animate) return;
        el.animate([{ opacity: 0, transform: 'translateY(' + (dy || 0) + 'px)' }, { opacity: 1, transform: 'none' }],
            { duration: dy ? 520 : 320, delay: delay || 0, easing: FLY_EASE, fill: 'backwards' });
    }
    // wait (briefly) for an element that Emby renders a moment after the view shows
    function waitFor(find, cb, limit, onTimeout) {
        var t0 = Date.now();
        (function poll() {
            var el = find();
            if (el) cb(el);
            else if (Date.now() - t0 < (limit || 1500)) setTimeout(poll, 40);
            else if (onTimeout) onTimeout();
        })();
    }

    function onViewShow(e) {
        var view = e.target;
        if (!view || !view.classList || !view.classList.contains('view')) return;
        // the player view gets its view-videoosd class only after viewshow, so go by the route
        var isOsd = /^(videoosd|nowplaying)/.test(routeInfo().path), wasOsd = prevViewOsd;
        prevViewOsd = isOsd;
        if (isDisabled() || !playingAudioItem()) return;

        if (isOsd && !wasOsd) {
            // source: the now-playing bar that was just clicked, else the album page cover of the playing album
            var from = barSource && Date.now() - barSource.at < 2000 ? barSource
                : pageCover && Date.now() - pageCover.at < 1500 && isPlayingAlbumArt(pageCover.src) ? pageCover : null;
            var fromBar = from === barSource;
            barSource = null;
            rise(view, 0, 0);
            // Emby swaps the header's content at once; let it arrive with the player
            rise(document.querySelector('.skinHeader'), 0, 0);
            // the viewshow target is not always the element that ends up visible, so query globally
            waitFor(function () { return document.querySelector('.view-videoosd-videoosd:not(.hide) .osdContentSection:not(.hide)'); },
                function (sec) { rise(sec, 90, 28); });
            flight(from, fromBar ? ['albumtint-hide-osdcover', 'albumtint-hide-barcover'] : ['albumtint-hide-osdcover'], function () {
                return document.querySelector('.view-videoosd-videoosd:not(.hide) .osdRemoteControlImageCardContent');
            });
        } else if (!isOsd && wasOsd && osdCover) {
            // back to the playing album's page: land on its cover; anywhere else: on the now-playing bar
            var r = routeInfo(), item = playingAudioItem(), toPage = r.path.indexOf('item') === 0 && item && r.id === item.AlbumId;
            rise(view, 0, 0);
            // the side drawer and the header come back at once in Emby; fade them in with the page and the bar.
            // Emby un-hides the drawer in its own viewshow handler, after this one: the fade applies once it shows.
            rise(document.querySelector('.skinHeader'), 0, 0);
            rise(document.querySelector('.mainDrawer'), 0, 0);
            flight(osdCover, [toPage ? 'albumtint-hide-pagecover' : 'albumtint-hide-barcover'], function () {
                return document.querySelector(toPage ? '.view-item-item:not(.hide) .detailImage' : '.nowPlayingBarImage');
            });
        }
    }
    // The player has no side drawer, so Emby widens the footer to the full window in the same task that starts
    // hiding the bar: the fading bar jumped sideways by the drawer's width, away from the cover lifting off it.
    // This runs before Emby's own viewbeforeshow handlers and keeps the footer where it is until the fade is over.
    var barPin = null;
    function onViewBeforeShow() {
        unpinBar();
        var bar = document.querySelector('.nowPlayingBar-footer'), footer = bar && bar.parentNode;
        if (!footer || !footer.classList || !footer.classList.contains('appfooter')) return;
        if (bar.classList.contains('hide') || bar.classList.contains('nowPlayingBar-hidden')) return;
        var r = footer.getBoundingClientRect();
        if (r.width < 10) return;
        // left + width rather than left + right, so a scrollbar that comes or goes doesn't move it either
        footer.style.setProperty('left', r.left + 'px', 'important');
        footer.style.setProperty('right', 'auto', 'important');
        footer.style.setProperty('width', r.width + 'px', 'important');
        var pin = barPin = { footer: footer, bar: bar, timer: 0, onEnd: null };
        Promise.resolve().then(function () {
            if (barPin !== pin) return;
            // the bar stays (a normal page change): let it follow the new layout right away, before any paint
            if (!bar.classList.contains('nowPlayingBar-hidden')) { unpinBar(); return; }
            bar.addEventListener('transitionend', pin.onEnd = function (e) {
                if (e.target === bar && e.propertyName === 'opacity') unpinBar();
            });
            pin.timer = setTimeout(unpinBar, BAR_FADE_MS + 500);
        });
    }
    function unpinBar() {
        var pin = barPin;
        if (!pin) return;
        barPin = null;
        clearTimeout(pin.timer);
        if (pin.onEnd) pin.bar.removeEventListener('transitionend', pin.onEnd);
        ['left', 'right', 'width'].forEach(function (p) { pin.footer.style.removeProperty(p); });
    }

    function onPointerDown(e) {
        // only the art / title area opens the player; buttons and sliders in the bar don't
        var info = e.target && e.target.closest && e.target.closest('.nowPlayingBarInfoContainer, .nowPlayingBarImage');
        var bar = info && info.closest('.nowPlayingBar');
        var im = bar && bar.querySelector('.nowPlayingBarImage');
        if (im) barSource = snapshot(im);
    }

    var updateTimer = 0, routeToken = 0;
    function update() {
        clearTimeout(updateTimer);
        updateTimer = setTimeout(doUpdate, 30);
    }
    function doUpdate() {
        var playing = playingAudioItem();
        root.classList.toggle('albumtint-audio', !!playing);
        if (isDisabled()) { setPage(null); setOsd(false); return; }
        playingUrl = playing ? artUrl(playing) : null;

        var r = routeInfo(), token = ++routeToken;
        var osd = /^(nowplaying|videoosd|queue)/.test(r.path) && !!playing;
        setOsd(osd);
        if (osd) { setPage(playingUrl); setupPhonePlayer(playing); return; }
        if (r.path.indexOf('item') === 0 && r.id) {
            getItem(r.id).then(function (item) {
                if (token !== routeToken) return;
                var music = item.Type === 'MusicAlbum' || (item.Type === 'Audio' && item.MediaType === 'Audio');
                setPage(music ? artUrl(item) : null);
            }, function () { if (token === routeToken) setPage(null); });
            return;
        }
        setPage(null);
    }
    var panelMotion, panelMotionFrame;
    function cancelPanelMotion() {
        cancelAnimationFrame(panelMotionFrame);
        panelMotionFrame = 0;
        if (panelMotion) panelMotion.cleanup();
    }
    function setOsd(on) {
        root.classList.toggle('albumtint-osd', on);
        if (!on) cancelPanelMotion();
    }
    function panelPose(node) {
        return node && { bounds: node.getBoundingClientRect(), opacity: getComputedStyle(node).opacity };
    }

    // Keep a short-lived visual copy while Emby immediately switches its native panel. On phones the panel is the
    // whole screen, so it fades and rises in place; the desktop panel slides sideways next to the cover.
    document.addEventListener('click', function (event) {
        var toggle = event.target.closest && event.target.closest('.btnLyrics, .osdContentSectionToggleButton');
        if (!toggle || !root.classList.contains('albumtint-osd')) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) {
            cancelPanelMotion();
            return;
        }
        var phone = matchMedia('(max-width: 40em)').matches;
        var bottom = toggle.closest('.videoOsdBottom');
        var panel = bottom && bottom.querySelector(':is(.lyricsSection,.osdPlayQueue,[data-contentsection="playqueue"].osdContentSection):not(.hide)');
        var controls = bottom && bottom.querySelector('.videoOsdBottom-maincontrols');
        if (!bottom || !panel && !controls) return;
        var before = controls && controls.getBoundingClientRect(), leaving = panelPose(panel);
        var previous = panelMotion, returning = previous && panelPose(previous.clone);
        var clone = panel && panel.cloneNode(true);
        if (clone) {
            clone.setAttribute('aria-hidden', 'true');
            clone.inert = true;
            clone.querySelectorAll('[id]').forEach(function (node) { node.removeAttribute('id'); });
        }
        var scroll = panel && panel.querySelector('.lyricsScroller, .scrollFrameY');
        var scrollTop = scroll && scroll.scrollTop;
        var motion = [], state = { cleanup: cleanup, clone: clone, panel: panel };
        function cleanup() {
            if (clone) clone.remove();
            motion.forEach(function (animation) { animation.cancel(); });
            if (panelMotion === state) panelMotion = null;
        }
        cancelAnimationFrame(panelMotionFrame);
        panelMotionFrame = requestAnimationFrame(function () {
            panelMotionFrame = 0;
            if (!bottom.isConnected || !root.classList.contains('albumtint-osd')) return;
            var next = bottom.querySelector(':is(.lyricsSection,.osdPlayQueue,[data-contentsection="playqueue"].osdContentSection):not(.hide)');
            if (next === panel) return;
            if (panelMotion) panelMotion.cleanup();
            panelMotion = state;
            var timing = { duration: 420, easing: 'cubic-bezier(.22,.8,.24,1)' };
            var out = phone ? 'translateY(18px)' : 'translateX(36px)';
            if (clone) {
                var bounds = leaving.bounds;
                Object.assign(clone.style, { position: 'fixed', pointerEvents: 'none', zIndex: '1000',
                    left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' });
                bottom.closest('.view').appendChild(clone);
                var copyScroll = clone.querySelector('.lyricsScroller, .scrollFrameY');
                if (copyScroll) copyScroll.scrollTop = scrollTop || 0;
                motion.push(clone.animate([{ opacity: leaving.opacity, transform: 'none' }, { opacity: 0, transform: out }], timing));
            }
            if (next) {
                var enter = { opacity: 0, transform: phone ? 'translateY(18px)' : 'translateX(28px)' };
                if (returning && next === previous.panel) {
                    var destination = next.getBoundingClientRect();
                    enter.opacity = returning.opacity;
                    enter.transform = 'translate(' + (returning.bounds.left - destination.left) + 'px,' +
                        (returning.bounds.top - destination.top) + 'px)';
                }
                motion.push(next.animate([enter, { opacity: 1, transform: 'none' }], timing));
            }
            // The desktop controls slide by the panel's width; on phones their height transition already covers it.
            if (controls && !phone) {
                var after = controls.getBoundingClientRect();
                motion.push(controls.animate([{ transform: 'translate(' + (before.left - after.left) + 'px,' +
                    (before.top - after.top) + 'px)' }, { transform: 'none' }], timing));
            }
            Promise.allSettled(motion.map(function (animation) { return animation.finished; })).then(cleanup);
        });
    }, true);

    function setupPhonePlayer(item) {
        var bottom = document.querySelector('.view-videoosd-videoosd:not(.hide) .videoOsdBottom');
        if (!bottom) return;
        if (bottom.__albumtintItemId !== item.Id) cancelPanelMotion();
        bottom.__albumtintItemId = item.Id;
        if (!bottom.__albumtintPhone) {
            var identity = document.createElement('button');
            identity.type = 'button';
            identity.className = 'albumtint-phone-identity';
            identity.setAttribute('aria-label', 'Toggle playback controls');
            identity.innerHTML = '<img alt=""><span><strong></strong><small></small></span>';
            var modes = document.createElement('div');
            modes.className = 'albumtint-phone-modes';
            [['shuffle', 'Shuffle', '.btnOsdShuffle-bottom'], ['repeat', 'Repeat', '.btnOsdRepeatMode-bottom']].forEach(function (spec) {
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'albumtint-mode-' + spec[0];
                button.setAttribute('aria-label', spec[1]);
                var icon = document.createElement('i');
                icon.className = 'md-icon';
                icon.textContent = spec[0];
                button.appendChild(icon);
                button.onclick = function () {
                    var native = bottom.querySelector(spec[2]);
                    if (native && !native.disabled) native.click();
                };
                modes.appendChild(button);
            });
            bottom.prepend(identity, modes);
            var idle, holdingControls = false;
            function lyricsOpen() {
                return root.classList.contains('albumtint-osd') &&
                    matchMedia('(max-width: 40em)').matches &&
                    !(window.BetterTheEmbySettings && window.BetterTheEmbySettings.phoneLayout === false) &&
                    !!bottom.querySelector('.lyricsSection:not(.hide)');
            }
            function showControls(show) {
                clearTimeout(idle);
                var open = lyricsOpen();
                var hidden = !show && open && !holdingControls;
                var controls = bottom.querySelector('.videoOsdBottom-maincontrols');
                if (controls) {
                    if (!bottom.classList.contains('albumtint-lyrics-full')) {
                        bottom.style.setProperty('--albumtint-controls-height', Math.ceil(controls.scrollHeight) + 'px');
                    }
                    if (hidden && controls.contains(document.activeElement)) identity.focus({ preventScroll: true });
                    controls.inert = hidden;
                }
                bottom.classList.toggle('albumtint-lyrics-full', hidden);
                if (!hidden && open && !holdingControls) idle = setTimeout(function () {
                    showControls(false);
                }, 3200);
            }
            identity.onclick = function () { showControls(bottom.classList.contains('albumtint-lyrics-full')); };
            var touchY, touchHandled;
            bottom.addEventListener('touchstart', function (e) {
                touchHandled = false;
                touchY = e.touches.length === 1 && e.target.closest('.lyricsSection') ? e.touches[0].clientY : null;
                if (touchY != null) clearTimeout(idle);
            }, { passive: true });
            bottom.addEventListener('touchmove', function (e) {
                if (touchHandled || touchY == null || !lyricsOpen() || !e.touches.length) return;
                var dy = e.touches[0].clientY - touchY;
                if (Math.abs(dy) < 24) return;
                touchHandled = true;
                showControls(dy > 0);
                clearTimeout(idle);
            }, { passive: true });
            function endTouch() {
                if (touchY != null) showControls(!bottom.classList.contains('albumtint-lyrics-full'));
                touchY = null;
            }
            bottom.addEventListener('touchend', endTouch, { passive: true });
            bottom.addEventListener('touchcancel', endTouch, { passive: true });
            bottom.addEventListener('wheel', function (e) {
                if (lyricsOpen() && e.target.closest('.lyricsSection') && Math.abs(e.deltaY) > 4) showControls(e.deltaY < 0);
            }, { passive: true });
            bottom.addEventListener('pointerdown', function (e) {
                if (!e.target.closest('.videoOsdBottom-maincontrols') || !lyricsOpen()) return;
                holdingControls = true;
                showControls(true);
                function release(event) {
                    if (event.pointerId !== e.pointerId) return;
                    holdingControls = false;
                    window.removeEventListener('pointerup', release, true);
                    window.removeEventListener('pointercancel', release, true);
                    showControls(true);
                }
                window.addEventListener('pointerup', release, true);
                window.addEventListener('pointercancel', release, true);
            }, { passive: true });
            var wasLyricsOpen = false;
            new MutationObserver(function () {
                var open = lyricsOpen();
                if (open !== wasLyricsOpen) { wasLyricsOpen = open; showControls(true); }
                modes.querySelectorAll('button').forEach(function (button, i) {
                    var native = bottom.querySelector(i ? '.btnOsdRepeatMode-bottom' : '.btnOsdShuffle-bottom');
                    if (!native) return;
                    var pressed = String(native.classList.contains('toggleButton-active'));
                    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
                    var glyph = native.querySelector('.md-icon');
                    if (glyph && button.firstChild.textContent !== glyph.textContent) button.firstChild.textContent = glyph.textContent;
                });
            }).observe(bottom, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
            bottom.__albumtintPhone = identity;
            showControls(true);
        }
        var identity = bottom.__albumtintPhone;
        var image = identity.querySelector('img');
        if (playingUrl && image.getAttribute('src') !== playingUrl) image.src = playingUrl;
        else if (!playingUrl) image.removeAttribute('src');
        identity.querySelector('strong').textContent = item.Name || '';
        identity.querySelector('small').textContent = (item.Artists || []).join(' · ') || item.AlbumArtist || '';
    }

    function isDisabled() {
        // turned off in the plugin's settings
        if (window.BetterTheEmbySettings && window.BetterTheEmbySettings.albumTint === false) return true;
        try { return localStorage.getItem(DISABLED_KEY) === '1'; } catch (e) { return false; }
    }

    function hookPlayback(attempt) {
        // Emby's own startup has to finish first: the AMD loader exists a moment before app.js has set up the
        // modules, and requiring playbackManager in that gap loads it half-configured so the app never starts
        if (typeof window.require !== 'function' || !window.ConnectionManager || !document.querySelector('.view')) {
            if ((attempt || 0) < 240) setTimeout(function () { hookPlayback((attempt || 0) + 1); }, 250);
            return;
        }
        hookBackdrop();
        hookSettingsMenu();
        window.require(['playbackManager', 'events'], function (p, ev) {
            pm = p && p.default ? p.default : p;
            events = ev && ev.default ? ev.default : ev;
            ['playbackstart', 'playbackstop', 'playerchange', 'trackchange'].forEach(function (name) { events.on(pm, name, update); });
            update();
        }, function (e) { console.warn('[AlbumTint] playback hook unavailable', e); });
    }

    function hookSettingsMenu() {
        if (!window.Emby || typeof Emby.importModule !== 'function') return;
        Emby.importModule('./modules/actionsheet/actionsheet.js').then(function (mod) {
            var menu = mod.default || mod;
            if (menu.__albumtintSettingsMotion) return;
            menu.__albumtintSettingsMotion = true;
            var show = menu.show;
            menu.show = function (options) {
                var anchor = options && options.positionTo;
                if (root.classList.contains('albumtint-osd') && anchor && anchor.closest &&
                    anchor.closest('.btnVideoOsdSettings') && !matchMedia('(max-width: 40em), (prefers-reduced-motion: reduce)').matches) {
                    options = Object.assign({}, options, { dialogClass: 'albumtint-settings' });
                }
                return show.call(this, options);
            };
        }).catch(function (error) { console.warn('[AlbumTint] settings motion unavailable', error); });
    }

    function start() {
        var style = document.createElement('style');
        style.id = 'albumtint-style';
        style.textContent = STYLE;
        document.head.appendChild(style);
        document.addEventListener('viewshow', update, true);
        document.addEventListener('viewshow', onViewShow, true);
        document.addEventListener('viewbeforeshow', onViewBeforeShow, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('hashchange', update);
        window.addEventListener('popstate', update);
        hookPlayback();
        update();
    }

    window.AlbumTint = {
        refresh: update,
        disable: function () { try { localStorage.setItem(DISABLED_KEY, '1'); } catch (e) { } update(); },
        enable: function () { try { localStorage.removeItem(DISABLED_KEY); } catch (e) { } update(); },
        _schemeFor: schemeFor
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
