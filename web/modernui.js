/*
 * Modern UI for Emby Web (4.9.5.0): page and tab transitions, sliding highlights on the tabs and in the drawer,
 * cards that rise in, lean toward the pointer and fly to the detail page and back, images that fade in, spotlight
 * banners on the home page and the library suggestions, art behind library pages and video details, and
 * play/pause feedback in the video player; also the library tabs (series, artists, folder tabs), title and pinyin
 * search, the pinyin A-Z index and the phone layout. Styles live in modernui.css; both are injected by the
 * BetterTheEmby server plugin, whose settings arrive as window.BetterTheEmbySettings. Kill switch for one browser:
 * ModernUI.disable() / ModernUI.enable() (localStorage 'modernui.disabled').
 */
(function () {
    'use strict';
    if (window.ModernUI) return;

    var DISABLED_KEY = 'modernui.disabled';
    // the plugin's settings (its settings page); everything is on when they are missing
    var SETTINGS = Object.assign({
        modernUI: true, phoneLayout: true, simplifyTabs: true, seriesTab: true, artistFeed: true, folderTabs: '',
        smartSearch: true, pinyinSearch: true, pinyinIndex: true, shortVersionNames: true
    }, window.BetterTheEmbySettings || {});
    // text in Chinese when Emby's interface is Chinese, in English otherwise
    function L(zh, en) { return /^zh/i.test(document.documentElement.getAttribute('lang') || navigator.language || '') ? zh : en; }
    var EASE = 'cubic-bezier(.22,.8,.24,1)';
    var SLIDE_MS = 8000;
    var SPOT_COUNT = 7;
    var VIDEO_TYPES = { Movie: 1, Series: 1, Season: 1, Episode: 1, BoxSet: 1, Video: 1, Trailer: 1, MusicVideo: 1 };
    // library pages; they all carry the library (or folder) as parentId
    var LIBRARY_PATHS = /^(tv|movies|music|videos|list|livetv|collections|homevideos|musicvideos|photos|books)$/;
    var root = document.documentElement;
    var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Phones get calmer motion: one short fade per page, no flying posters, nothing coming in piece by piece
    // (on a small screen those overlap into a jumble).
    var phoneQuery = window.matchMedia ? matchMedia('(max-width: 40em)') : null;
    function isPhone() { return SETTINGS.phoneLayout !== false && !!(phoneQuery && phoneQuery.matches); }
    var finePointer = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

    function isDisabled() {
        if (SETTINGS.modernUI === false) return true;
        try { return localStorage.getItem(DISABLED_KEY) === '1'; } catch (e) { return false; }
    }

    window.ModernUI = {
        disable: function () { try { localStorage.setItem(DISABLED_KEY, '1'); } catch (e) { } location.reload(); },
        enable: function () { try { localStorage.removeItem(DISABLED_KEY); } catch (e) { } location.reload(); }
    };
    if (isDisabled()) return;

    // ---------- Emby access ----------

    function api() {
        try { return window.ConnectionManager ? window.ConnectionManager.currentApiClient() : null; } catch (e) { return null; }
    }

    function routeInfo() {
        var h = location.hash || '', i = h.indexOf('?'), params = {};
        (i >= 0 ? h.slice(i + 1) : '').split('&').forEach(function (kv) {
            var j = kv.indexOf('=');
            if (j > 0) params[decodeURIComponent(kv.slice(0, j))] = decodeURIComponent(kv.slice(j + 1));
        });
        return { path: h.replace(/^#!?\/?/, '').split('?')[0].toLowerCase(), params: params };
    }

    var itemCache = {};
    function getItem(id) {
        var a = api();
        if (!a) return Promise.reject(new Error('no api client'));
        if (!itemCache[id]) {
            itemCache[id] = a.getItem(a.getCurrentUserId(), id);
            itemCache[id].catch(function () { delete itemCache[id]; });
        }
        return itemCache[id];
    }

    // The detail controller already requests this item. Share that request instead of making the server
    // load the same person/album again while Emby is still building the page.
    function detailItem(view, id) {
        var controller = view && view.controller;
        if (controller && controller.params && String(controller.params.id) === String(id) && controller.dataPromise) {
            return controller.dataPromise.then(function () {
                var item = controller.currentItem;
                return item && String(item.Id) === String(id) ? item : getItem(id);
            });
        }
        return getItem(id);
    }

    // Person lookups can take longer than the page transition. Start the same native request when a viewer
    // rests on an actor or focuses one, and hand it to Emby once on navigation (never to later refreshes).
    var personWarm = {}, personTimer = 0, personHover = null;
    var PERSON_FIELDS = 'ShareLevel,SyncStatus,ContainerSyncStatus';
    var PERSON_EXCLUDE = 'VideoChapters,VideoMediaSources,MediaStreams';
    function warmPerson(card) {
        var item = card && cardItem(card), a = api();
        if (!a || !item || item.Type !== 'Person' || card.closest('.detailImageContainer, .dialog')) return;
        var uid = a.getCurrentUserId(), key = uid + '|' + item.Id, now = Date.now();
        Object.keys(personWarm).forEach(function (k) { if (now - personWarm[k].at > 15000) delete personWarm[k]; });
        if (personWarm[key]) return;
        if (!a.__muiPersonWarm) {
            var get = a.getItem;
            a.getItem = function (userId, id, options) {
                var k = userId + '|' + id, saved = personWarm[k];
                if (saved && Date.now() - saved.at <= 15000 && options && options.fields === PERSON_FIELDS &&
                    options.ExcludeFields === PERSON_EXCLUDE && Object.keys(options).length === 2) {
                    delete personWarm[k];
                    return saved.promise;
                }
                return get.apply(this, arguments);
            };
            a.__muiPersonWarm = true;
        }
        var record = { at: now, promise: a.getItem(uid, item.Id, { fields: PERSON_FIELDS, ExcludeFields: PERSON_EXCLUDE }) };
        personWarm[key] = record;
        record.promise.catch(function () { if (personWarm[key] === record) delete personWarm[key]; });
    }
    function onPersonIntent(e) {
        if (!e.target || !e.target.closest) return;
        var card = e.target.closest('.card');
        if (e.type === 'pointerover') {
            if (e.pointerType !== 'mouse' || card === personHover) return;
            personHover = card;
            clearTimeout(personTimer);
            if (card) personTimer = setTimeout(function () { if (card.isConnected) warmPerson(card); }, 120);
        } else {
            clearTimeout(personTimer);
            warmPerson(card);
        }
    }

    function patchPersonCredits() {
        var a = api();
        if (!a || a.__muiCredits || typeof a.getPersonCredits !== 'function' || a.isMinServerVersion('4.10.0.1')) return;
        // Emby 4.9's API client returns an empty items envelope for this unsupported endpoint, but its person
        // page expects an array of credit groups and throws on .map(). Preserve the same empty result shape
        // the renderer expects, without adding a request or changing supported credit responses.
        var get = a.getPersonCredits;
        a.getPersonCredits = function () {
            return get.apply(this, arguments).then(function (res) {
                return res && Array.isArray(res.Items) && !res.Items.length && res.TotalRecordCount === 0 ? [] : res;
            });
        };
        a.__muiCredits = true;
    }
    function emptyCredits(scope) {
        var a = api();
        if (!a || !a.__muiCredits || !scope.querySelectorAll) return;
        scope.querySelectorAll('.creditsItemsContainer').forEach(function (box) {
            var view = box.closest('.itemView'), controller = view && view.controller;
            if (controller && Array.isArray(controller.currentItemCreditTypes) && !controller.currentItemCreditTypes.length) {
                // The native renderer also resumes its hidden empty list and assumes a first credit group.
                // The DOM observer runs before that resume microtask; supply the actual empty list directly.
                box.fetchData = function () { return Promise.resolve([]); };
            }
        });
    }

    // the item behind a card: virtual grids keep it on their container, other rows put its id on the card
    function cardItem(card) {
        if (card.__album) return card.__album;
        if (card.__muiItem) return card.__muiItem;
        var ic = card.parentNode;
        if (ic && typeof ic.getItemFromElement === 'function') {
            try {
                var it = ic.getItemFromElement(card);
                if (it && it.Id) return it;
            } catch (e) { }
        }
        var id = card.getAttribute('data-id');
        return id ? { Id: id } : null;
    }

    var pm = null, events = null, player = null, hooked = false;
    function hookEmby(attempt) {
        if (hooked) return;
        // Emby's own startup has to finish first: requiring its modules while app.js is still setting up
        // (the AMD loader exists a moment before that) loads them half-configured and the app never starts
        if (typeof window.require !== 'function' || !window.ConnectionManager || !document.querySelector('.view')) {
            if ((attempt || 0) < 240) setTimeout(function () { hookEmby((attempt || 0) + 1); }, 250);
            return;
        }
        hooked = true;
        patchPersonCredits();
        patchLibraryTabs();
        if (SETTINGS.phoneLayout !== false && window.Emby && typeof Emby.importModule === 'function') {
            patchScroller().then(function (ok) { docReady = !!ok; syncDocScroll(); }, function (e) { console.warn('[ModernUI] scroller', e); });
            patchPhoneRouteMotion();
            patchPhoneMenus();
        }
        window.require(['playbackManager', 'events'], function (p, ev) {
            pm = p && p.default ? p.default : p;
            events = ev && ev.default ? ev.default : ev;
            events.on(pm, 'playerchange', bindPlayer);
            events.on(pm, 'playbackstart', bindPlayer);
            bindPlayer();
        }, function (e) { hooked = false; console.warn('[ModernUI] playback hook unavailable', e); });
    }
    function playingAudio() { try { return !!(pm && pm.isPlayingAudio()); } catch (e) { return false; } }

    function showItem(item) {
        if (isPhone()) {
            if (ignorePhoneCard(item.Id)) return;
            flyFrom = { id: item.Id, type: item.Type };
        }
        if (typeof window.require === 'function') {
            window.require(['appRouter'], function (r) {
                r = r && r.default ? r.default : r;
                if (r && r.showItem) r.showItem(item);
                else location.hash = '#!/item?id=' + item.Id + '&serverId=' + item.ServerId;
            }, function () { location.hash = '#!/item?id=' + item.Id + '&serverId=' + item.ServerId; });
        }
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function icon(name) { return el('i', 'md-icon', name); }
    function albumCount(n) { return L(n + ' 张专辑', n + (n === 1 ? ' album' : ' albums')); }
    function stripTags(s) {
        var d = document.createElement('div');
        d.innerHTML = String(s || '').replace(/<br\s*\/?>/gi, ' ');
        return (d.textContent || '').replace(/\s+/g, ' ').trim();
    }
    // Image URL with exactly this width. ApiClient.getImageUrl multiplies maxWidth by devicePixelRatio and
    // forces quality 70, which asked for 4480px, 1.5 MB backdrops on a 1.75x screen.
    function imgUrl(id, type, tag, maxWidth, quality, index) {
        return api().getUrl('Items/' + id + '/Images/' + type + (index != null ? '/' + index : ''),
            { tag: tag, maxWidth: Math.round(maxWidth), quality: quality || 85 });
    }
    // banner widths in a few steps (so the same art is fetched, and cached, at the same size), at most 1920px:
    // behind gradients and a slow zoom, more pixels only cost loading time
    function heroWidth(box) {
        var px = (box && box.clientWidth || window.innerWidth) * Math.min(1.5, window.devicePixelRatio || 1);
        var steps = [960, 1280, 1600, 1920];
        for (var i = 0; i < steps.length; i++) if (px <= steps[i]) return steps[i];
        return 1920;
    }
    function waitFor(find, cb, limit, onTimeout) {
        var t0 = Date.now();
        (function poll() {
            var found = find();
            if (found) cb(found);
            else if (Date.now() - t0 < (limit || 3000)) setTimeout(poll, 50);
            else if (onTimeout) onTimeout();
        })();
    }

    // ---------- motion helpers ----------

    // A fade with no movement leaves transform alone: any transform, even translateY(0), makes the element the
    // frame of its position:fixed children (the A-Z index of a library), which would jump while it runs.
    function rise(target, delay, dy, ms) {
        if (!target || reduceMotion || !target.animate) return null;
        var frames = dy ? [{ opacity: 0, transform: 'translateY(' + dy + 'px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0 }, { opacity: 1 }];
        return target.animate(frames, { duration: ms || 360, delay: delay || 0, easing: EASE, fill: 'backwards' });
    }
    // fades something in, unless it is fading in already: starting over would throw it back to transparent for a
    // few frames (a header title Emby sets twice, say)
    function fadeIn(target, dy, ms) {
        if (!target) return;
        var a = target.__muiFade;
        if (a && a.playState === 'running') return;
        target.__muiFade = rise(target, 0, dy, ms);
    }
    function slide(target, dx, ms) {
        if (!target || reduceMotion || !target.animate) return null;
        return target.animate([{ opacity: 0, transform: 'translateX(' + dx + 'px)' }, { opacity: 1, transform: 'none' }],
            { duration: ms || 420, easing: EASE });
    }
    // the same curve, for motion driven frame by frame
    function ease(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        var lo = 0, hi = 1, s = t, u;
        for (var i = 0; i < 16; i++) {
            s = (lo + hi) / 2;
            u = 1 - s;
            if (3 * u * u * s * .22 + 3 * u * s * s * .24 + s * s * s < t) lo = s; else hi = s;
        }
        u = 1 - s;
        return 3 * u * u * s * .8 + 3 * u * s * s + s * s * s;
    }

    // ---------- page transitions ----------

    var phoneRouteMotion = null, nativeRouteMotion = false, lastPhoneCard = null;
    function ignorePhoneCard(id) {
        var now = performance.now();
        if (phoneRouteMotion || lastPhoneCard && lastPhoneCard.id === id && now < lastPhoneCard.until) return true;
        lastPhoneCard = { id: id, until: now + 850 };
        return false;
    }
    function isMediaRoute(url) {
        var match = /(?:^|[!/])([^/?#!]+)(?:\?[^#]*)?$/i.exec(url || '');
        var path = match && match[1].toLowerCase().replace(/\.html$/, '');
        return /^(home|item|search)$/.test(path) || LIBRARY_PATHS.test(path);
    }
    function patchPhoneRouteMotion() {
        if (!document.startViewTransition || reduceMotion) return;
        Emby.importModule('./modules/viewmanager/viewmanager.js').then(function (module) {
            var manager = module.default || module;
            if (manager.__muiPhoneRoutes) return;
            manager.__muiPhoneRoutes = true;
            if (window.navigation) window.navigation.addEventListener('navigate', function (event) {
                nativeRouteMotion = !!event.hasUAVisualTransition;
            });
            // Emby has loaded the template before loadView and looks for a cached view before that.
            ['loadView', 'tryRestoreView'].forEach(function (method) {
                var original = manager[method];
                if (typeof original !== 'function') return;
                manager[method] = function (options, signal) {
                    var from = this.currentViewInfo(), args = arguments, self = this;
                    function run() { return original.apply(self, args); }
                    if (!docScroll || document.hidden || nativeRouteMotion || signal && signal.aborted ||
                        !from || !from.view || !options.params || options.params.asDialog === 'true' ||
                        options.isPluginPage || from.params && from.params.asDialog === 'true' || from.url === options.url ||
                        !isMediaRoute(from.url) || !isMediaRoute(options.url)) return run();
                    if (method === 'tryRestoreView' && !Array.from(document.querySelectorAll('.page.view')).some(function (view) {
                        return view.__muiRouteUrl === options.url && view.allowRestore !== false;
                    })) return run();
                    if (phoneRouteMotion) {
                        if (phoneRouteMotion.url === options.url && !phoneRouteMotion.signal?.aborted) {
                            return phoneRouteMotion.result;
                        }
                        phoneRouteMotion.stop();
                    }
                    return phoneRouteSlide(run, options, signal);
                };
            });
        }).catch(function () { /* Emby's own navigation is the fallback. */ });
    }

    function phoneRouteSlide(run, options, signal) {
        var back = !!options.isBack, mode = back ? 'mui-phone-pop' : 'mui-phone-push';
        var current = { stop: stop, url: options.url, signal: signal }, transition, result, timer;
        function cleanup() {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', stop);
            if (phoneRouteMotion !== current) return;
            phoneRouteMotion = null;
            root.classList.remove(mode);
        }
        function stop() {
            transition.skipTransition();
            cleanup();
        }
        root.classList.add(mode);
        transition = document.startViewTransition(async function () {
            try {
                // A skipped snapshot still invokes its callback. An aborted route must not mount a view.
                if (signal) signal.throwIfAborted();
                result = await run();
                if (phoneRouteMotion !== current) return;
                var view = result && result.classList ? result : document.querySelector('.page.view:not(.hide):not(.dialog)');
                if (!view) return;
                if (options.isBack || routeInfo().path !== 'item') return;
                // Capture once the title exists. Artwork and secondary lists can load during the slide.
                var until = performance.now() + 72;
                await new Promise(function (resolve) {
                    (function check() {
                        var title = view.querySelector('.mui-phone-video-title, .detailTextContainer .itemName-primary');
                        if (phoneRouteMotion !== current || !view.isConnected ||
                            title && title.textContent.trim() || performance.now() >= until) resolve();
                        // Chromium may suspend animation frames until the update callback completes.
                        else setTimeout(check, 24);
                    })();
                });
            } catch (error) {
                stop();
                throw error;
            }
        });
        phoneRouteMotion = current;
        timer = setTimeout(stop, 850);
        if (signal) signal.addEventListener('abort', stop, { once: true });
        transition.ready.then(function () { clearTimeout(timer); }, cleanup);
        transition.finished.then(cleanup, cleanup);
        current.result = transition.updateCallbackDone.then(function () { return result; });
        return current.result;
    }

    var prevOsd = false, firstView = true, choreo = null;
    function onViewShow(e) {
        var view = e.target;
        if (!view || !view.classList) return;
        // phones: the page comes back where it was left, a new one starts at the top (see "the document scrolls")
        if (docScroll && view.classList.contains('page')) docRestore((e.detail || {}).isRestored ? pageFrame(view) : null);
        // dashboard pages (settings, plugins) aren't views: they get no art, and the last page's goes
        if (!view.classList.contains('view')) {
            if (view.classList.contains('page')) {
                ++artToken;
                ++itemToken;
                artPage = false;
                root.classList.remove('mui-videoitem', 'mui-haslogo-page');
                setPageBg(null);
            }
            return;
        }
        var r = routeInfo(), isOsd = /^(videoosd|nowplaying)/.test(r.path), wasOsd = prevOsd;
        var detail = e.detail || {}, restored = !!detail.isRestored, back = restored || !!detail.isBack;
        view.__muiRouteUrl = detail.url;
        lastPhoneCard = null;
        prevOsd = isOsd;
        hookEmby();
        var detail = r.path === 'item';
        if (detail && !restored && !isPhone()) {
            // Only video details share the preceding video's hero. A person/album card already identifies
            // the new layout: carrying a hero there left .mui-hashero padding after the art was removed.
            var type = flyFrom && flyFrom.type;
            if (type && !VIDEO_TYPES[type]) heroCarry = null;
            else carryHero(view);
        }
        var item = view.controller && view.controller.currentItem;
        var entryType = item && String(item.Id) === String(r.params.id) ? item.Type :
            flyFrom && String(flyFrom.id) === String(r.params.id) ? flyFrom.type : null;
        var flying = startFlight(view, r, back, isOsd);
        // Album Tint animates the way into and out of the music player
        var albumTint = window.AlbumTint && (isOsd || wasOsd) && playingAudio(), entrance = [];
        if (!albumTint && !isOsd && isPhone()) {
            if (!phoneRouteMotion && !nativeRouteMotion && !restored && !(r.path === 'item' && view.__muiPhoneVideo)) {
                var surface = r.path === 'item' && view.querySelector('.itemMainScrollSlider') || view;
                var slideIn = detail && (!entryType || /^(Season|Episode)$/.test(entryType));
                var entry = slideIn ? slide(surface, 36, 300) : rise(surface, 0, 0, firstView ? 260 : 200);
                view.__muiPhoneEntry = entry;
                entrance.push(entry);
            }
        } else if (!albumTint && !isOsd) {
            if (wasOsd || firstView) {
                // leaving the video player (Emby brings back the page, the header and the drawer at once), or
                // the first page after start: the three fade in together
                var ms = firstView ? 460 : 340;
                entrance.push(rise(view, 0, 0, ms));
                entrance.push(rise(document.querySelector('.skinHeader'), 0, 0, ms));
                entrance.push(rise(document.querySelector('.mainDrawer'), 0, 0, ms));
            } else {
                // Back where it came from: going forward a page comes up into place; going back, the page we return
                // to comes down into place, from where it had gone (a poster in flight already says where it goes,
                // and detail pages bring their parts in one after another, see checkChoreo). On a detail page only
                // the content moves: its backdrop stays still (it may be the very one the last page had).
                var dy = flying || detail ? 0 : back ? -12 : 14;
                var parts = detail ? Array.prototype.filter.call(view.children, function (c) { return !c.classList.contains('mui-hero'); }) : [view];
                parts.forEach(function (p) { entrance.push(rise(p, 0, dy, restored ? 220 : 300)); });
            }
        }
        firstView = false;
        // the cards of the last page don't rise in on this one; this page's rise in with it (holdEntrance)
        revealUntil = 0;
        revealPending = [];
        var reveal = !restored && !isOsd && !isPhone();
        if (reveal && r.path === 'item') choreo = { view: view, until: Date.now() + 4000 };
        if (restored) entrance = [];
        holdEntrance(view, r, entrance, function (ready) {
            if (!reveal) return;
            revealCards(view);
            // If the server outlasted the entrance, don't make already-visible text disappear and rise again.
            if (!ready && choreo && choreo.view === view) choreo = null;
            checkChoreo();
        });
        if (phoneRouteMotion) afterShow(view, r);
        else setTimeout(function () { afterShow(view, r); }, 0);
    }

    // A page Emby is still filling in moves under its own fade: its tabs come a frame later, a detail page's facts
    // and buttons when the item arrives, the home page's rows and banner after that. So its entrance is held at its
    // first frame (invisible) until what it waits for is there and its size has stayed put for a moment, then
    // plays: the page comes in once, already in place. A page that is already complete (one we come back to) and
    // a slow server is bounded: at most HOLD_MS for libraries, 1200ms for a detail page's metadata.
    var HOLD_MS = 450, SETTLE_MS = 70, holding = 0;
    function holdEntrance(view, r, anims, done) {
        anims = anims.filter(Boolean);
        var over = false, last = null, since = 0, cap = 0;
        function release(cancelled) {
            if (over) return;
            over = true;
            clearTimeout(cap);
            holding = Math.max(0, holding - 1);
            view.__muiHold = false;
            if (view.__muiRelease === release) view.__muiRelease = null;
            anims.forEach(function (a) { try { if (cancelled) a.cancel(); else a.play(); } catch (e) { } });
            if (!cancelled && done) done(pageReady(view, r));
        }
        if (!anims.length) { if (done) done(pageReady(view, r)); return; }
        anims.forEach(function (a) { a.pause(); });
        holding++;
        view.__muiHold = true;
        view.__muiRelease = release;
        cap = setTimeout(release, r.path === 'item' ? 1200 : HOLD_MS);
        (function frame(now) {
            if (over) return;
            if (!view.isConnected || view.classList.contains('hide')) { release(true); return; }
            if (pageReady(view, r)) {
                // A person's header has its own fixed portrait slot. Filmography rows can keep changing the
                // page height below it; they must not hold this ready header or start another text sequence.
                if (r.path === 'item' && personDetail(view)) { release(); return; }
                var size = pageSize(view);
                if (size !== last) { last = size; since = now || performance.now(); }
                else if ((now || performance.now()) - since >= SETTLE_MS) { release(); return; }
            }
            requestAnimationFrame(frame);
        })();
    }
    function pageReady(view, r) {
        if (r.path === 'item') {
            var name = view.querySelector('.detailTextContainer .itemName-primary');
            var type = view.controller && view.controller.currentItem && view.controller.currentItem.Type;
            if (isPhone() && VIDEO_TYPES[type] && !view.__muiPhoneVideo) return false;
            if (view.__muiPhoneVideo && (view.__muiPhoneVideo.waitingForRail || view.__muiPhoneVideo.waitingForArt)) return false;
            return !!(name && name.textContent.trim());
        }
        if (view.classList.contains('withTabs')) {
            var tab = view.querySelector('.tabContent.is-active');
            if (!tab || tab.__muiReady === false) return false;
            var spot = spotlightTarget(); // a page with a banner waits for its rows and the banner
            return !spot || (!spot.pending && !!spot.sections.querySelector(':scope > .mui-spotlight'));
        }
        return true;
    }
    function personDetail(view) {
        var item = view && view.controller && view.controller.currentItem;
        return !!(view && view.__muiPerson) || !!(item && item.Type === 'Person');
    }
    function pageSize(view) {
        var f = pageFrame(view) || view, header = document.querySelector('.skinHeader');
        return f.scrollHeight + 'x' + f.scrollWidth + '|' + (header ? header.offsetHeight : 0);
    }

    // The version picker of a detail page names each version after its file: "Title - 4K BluRay-Remux ... - Group".
    // The title is already the page's heading, so each option shows what comes after the first " - ". Emby builds
    // the picker's menu from the options' text, so one rewrite covers the closed picker and its menu. Options Emby
    // fills in again (a new page) are rewritten as they arrive, before they are first painted.
    function shortVersionNames(scope) {
        if (SETTINGS.shortVersionNames === false || !scope || !scope.querySelectorAll) return;
        var selects = scope.matches && scope.matches('select.selectSource') ? [scope] : scope.querySelectorAll('select.selectSource');
        Array.prototype.forEach.call(selects, function (select) {
            Array.prototype.forEach.call(select.options, function (option) {
                var text = option.textContent;
                if (text === option.__muiShort) return;
                var at = text.indexOf(' - ');
                var rest = at > 0 ? text.slice(at + 3).trim() : '';
                if (!rest) return; // no title in front of it, or nothing after: keep the name as it is
                option.__muiShort = rest;
                option.textContent = rest;
            });
        });
    }

    // The menu of a select (version, audio, subtitles) opens as an action sheet that Emby places 26px left of the
    // select, to make room for a check-mark column in front of every entry; the entries' text then lined up with
    // nothing. It is placed at the select's own left edge instead, with the same space on all four sides of each entry
    // and a dot in front of the chosen one (modernui.css, .mui-select-menu). Phones keep Emby's bottom sheets.
    var selectOpened = null;
    function alignSelectMenu(sheet, retried) {
        var from = selectOpened;
        if (!from || Date.now() - from.at > 1500 || !from.wrapper.isConnected || isPhone()) return;
        if (sheet.style.position !== 'fixed' || !sheet.style.left) {
            // not placed by Emby yet (or a bottom sheet): look once more after it has had a frame
            if (!retried) requestAnimationFrame(function () { alignSelectMenu(sheet, true); });
            return;
        }
        sheet.classList.add('mui-select-menu');
        sheet.classList.toggle('mui-video-select-menu', !!from.wrapper.querySelector('select.detailTrackSelect'));
        function place() {
            if (!sheet.isConnected) return;
            var w = from.wrapper.getBoundingClientRect();
            var left = Math.min(w.left, window.innerWidth - sheet.offsetWidth - 8);
            sheet.style.left = Math.max(8, left) + 'px';
            sheet.style.minWidth = w.width + 'px';
        }
        place();
        // Emby may place it again once it has measured it
        requestAnimationFrame(place);
    }

    function afterShow(view, r) {
        syncTabs(true);
        syncNav(false);
        watchTitle();
        updatePageArt(view, r);
        updateSpotlights();
        shortVersionNames(view);
        homeAlbumTitles(view);
        markLoaded(view);
        setTimeout(function () { markLoaded(view); }, 1500);
    }

    // Detail pages: the poster and the lines of text come in one after another once Emby has filled them in.
    // Also called from the DOM observer, so it runs before the filled-in page is first painted; not while the page
    // is held (holdEntrance runs it when the page comes in).
    function checkChoreo() {
        if (!choreo) return;
        var view = choreo.view;
        if (Date.now() > choreo.until || !view.isConnected) { choreo = null; return; }
        if (view.__muiHold) return;
        var name = view.querySelector('.detailTextContainer .itemName-primary');
        if (!name || !name.textContent.trim()) return;
        choreo = null;
        if (personDetail(view)) return; // the portrait flies while the whole header fades in once
        if (reduceMotion || !document.body.animate) return;
        var parts = [], poster = view.querySelector('.detailImageContainer-main');
        if (poster && !root.classList.contains('mui-fly-detail')) parts.push(poster); // a poster in flight lands by itself
        var text = view.querySelector('.detailTextContainer');
        for (var c = text && text.firstElementChild; c; c = c.nextElementSibling) {
            if (c.offsetParent !== null) parts.push(c);
        }
        parts.forEach(function (p, i) { rise(p, 40 + i * 55, 16, 600); });
    }

    // ---------- tabs: one pill that slides to the active tab ----------

    var tabObservers = typeof WeakMap === 'function' ? new WeakMap() : null, tabsQueued = 0;
    function syncTabs(instant) {
        document.querySelectorAll('.emby-tabs-slider').forEach(function (slider) {
            if (!slider.querySelector('.emby-tab-button')) return;
            var pill = slider.querySelector('.mui-tab-pill');
            var fresh = !pill;
            if (fresh) {
                pill = el('div', 'mui-tab-pill');
                slider.insertBefore(pill, slider.firstChild);
                slider.classList.add('mui-has-pill');
                if (tabObservers && window.MutationObserver && !tabObservers.has(slider)) {
                    var mo = new MutationObserver(queueTabs);
                    mo.observe(slider, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
                    tabObservers.set(slider, mo);
                }
            }
            var active = slider.querySelector('.emby-tab-button-active');
            if (!active || !active.offsetWidth) { pill.style.opacity = '0'; return; }
            if (fresh || instant || pill.style.opacity === '0') pill.style.transition = 'none';
            pill.style.opacity = '1';
            pill.style.width = active.offsetWidth + 'px';
            pill.style.height = active.offsetHeight + 'px';
            pill.style.transform = 'translate(' + active.offsetLeft + 'px,' + active.offsetTop + 'px)';
            if (pill.style.transition === 'none') {
                pill.offsetWidth; // apply the jump before turning the slide back on
                pill.style.transition = '';
            }
            fitTabBar(slider, active, fresh || instant);
        });
    }
    // Phones: a tab bar wider than the screen (a library's folder tabs) scrolls sideways over a glass track, fading
    // out on the side(s) with more tabs (modernui.css), and brings the active tab to the middle when it changes
    function fitTabBar(slider, active, instant) {
        var bar = slider.parentNode;
        if (!bar || !bar.classList || !bar.classList.contains('tabs-viewmenubar')) return;
        var over = isPhone() && bar.scrollWidth > bar.clientWidth + 1;
        bar.classList.toggle('mui-tabs-overflow', over);
        if (!over) { bar.__muiActive = null; return; }
        if (!bar.__muiEdges) {
            bar.__muiEdges = function () {
                var max = bar.scrollWidth - bar.clientWidth;
                bar.classList.toggle('mui-tabs-start', bar.scrollLeft <= 6);
                bar.classList.toggle('mui-tabs-end', bar.scrollLeft >= max - 6);
            };
            bar.addEventListener('scroll', bar.__muiEdges, { passive: true });
        }
        if (instant || bar.__muiActive !== active) {
            bar.__muiActive = active;
            var br = bar.getBoundingClientRect(), ar = active.getBoundingClientRect();
            var left = Math.max(0, Math.min(bar.scrollWidth - bar.clientWidth, bar.scrollLeft + ar.left - br.left - (br.width - ar.width) / 2));
            try { bar.scrollTo({ left: left, behavior: instant || reduceMotion ? 'instant' : 'smooth' }); } catch (e) { bar.scrollLeft = left; }
        }
        bar.__muiEdges();
    }
    function queueTabs() {
        if (tabsQueued) return;
        tabsQueued = requestAnimationFrame(function () { tabsQueued = 0; syncTabs(false); });
    }

    // phones: the tab we leave keeps its place in the document (see "the document scrolls")
    function onBeforeTabChange(e) {
        var bar = e.target;
        if (bar && bar.classList && bar.classList.contains('tabs-viewmenubar')) stopTabSlide(document.querySelector('.view.withTabs:not(.hide)'));
        if (docScroll && bar && bar.classList && bar.classList.contains('tabs-viewmenubar')) docSave(pageFrame());
    }

    function stopTabSlide(view) {
        if (!view || !view.__muiTabSlide) return;
        view.__muiTabSlide.cancel();
        view.__muiTabSlide = null;
    }

    // a tab switch: the new tab's content slides in from the side of the tab that was picked
    function onTabChange(e) {
        setTimeout(function () { syncTabs(false); updateSpotlights(); updatePageArt(); }, 0);
        var d = e.detail || {}, bar = e.target, to = d.selectedTabIndex, from = d.previousIndex;
        if (!bar || !bar.classList || !bar.classList.contains('tabs-viewmenubar')) return;
        if (to == null || from == null || +from < 0 || +to === +from) return;
        // Emby has made the new tab active by now: it comes back where it was left
        if (docScroll) docRestore(pageFrame());
        if (reduceMotion || !window.MutationObserver) return;
        var view = document.querySelector('.view.withTabs:not(.hide)');
        if (!view) return;
        var direction = +to > +from ? 1 : -1, done = false, timer;
        var tabs = view.controller && view.controller.getTabs ? view.controller.getTabs() : [];
        var custom = tabs[to] && tabs[to].mui;
        // A new custom tab is activated before its controller/template and data have arrived.
        // Keep its direction, and let the controller start the one slide when the body is complete.
        if (view.__muiCancelTabEnter) view.__muiCancelTabEnter();
        revealUntil = 0;
        revealPending = [];
        function cancel() {
            done = true;
            clearTimeout(timer);
            mo.disconnect();
            view.removeEventListener('mui:tabready', enter);
            if (view.__muiCancelTabEnter === cancel) view.__muiCancelTabEnter = null;
        }
        function enter() {
            var c = view.querySelector('.tabContent.is-active[data-index="' + to + '"]');
            if (done || !c || !view.isConnected || view.classList.contains('hide') || (custom && c.__muiReady !== true)) return;
            var content = c.querySelector(':scope > .scrollSlider, :scope > .mui-tabbody');
            if (!content) return; // a native tab can activate before its template has arrived
            cancel();
            // one movement: the cards it brings (or Emby builds again) come with it, they don't rise in as well
            revealUntil = 0;
            revealPending = [];
            // its content moves, not the tab itself, whose A-Z index is fixed to the screen
            var phone = isPhone(), width = c.clientWidth || view.clientWidth || window.innerWidth;
            var distance = phone ? Math.min(32, Math.max(20, width * .07)) : Math.min(96, Math.max(40, width * .06));
            stopTabSlide(view);
            var animation = view.__muiTabSlide = slide(content, direction * distance, phone ? 260 : 360);
            if (animation) animation.finished.then(clear, clear);
            function clear() { if (view.__muiTabSlide === animation) view.__muiTabSlide = null; }
        }
        // Emby has usually activated the content already (between beforetabchange and tabchange, in this same
        // task, so nothing has been painted yet)
        // A custom controller can finish before Emby activates it, or the other way around. Listen for both;
        // either signal starts the same single entrance, before the completed content is painted.
        var mo = new MutationObserver(enter);
        mo.observe(view, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
        view.addEventListener('mui:tabready', enter);
        view.__muiCancelTabEnter = cancel;
        timer = setTimeout(cancel, 10000);
        enter();
    }

    // ---------- drawer: one highlight that slides to the selected entry ----------

    var navQueued = 0, navDrawer = null, navMo = null;
    function syncNav(instant) {
        var drawer = document.querySelector('.mainDrawer');
        var slider = drawer && drawer.querySelector('.mainDrawerScrollSlider');
        if (!slider) return;
        if (navDrawer !== drawer && window.MutationObserver) {
            if (navMo) navMo.disconnect();
            navDrawer = drawer;
            navMo = new MutationObserver(queueNav);
            navMo.observe(drawer, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
            drawer.addEventListener('transitionend', queueNav); // "My media" folding open or shut
        }
        var pill = slider.querySelector(':scope > .mui-nav-pill');
        if (!pill) {
            pill = el('div', 'mui-nav-pill');
            slider.insertBefore(pill, slider.firstChild);
            drawer.classList.add('mui-has-navpill');
            instant = true;
        }
        var sel = slider.querySelector('.navMenuOption-selected .listItem-content-bg');
        if (!sel || !sel.offsetWidth || sel.closest('.collapseContent:not(.expanded)')) { pill.style.opacity = '0'; return; }
        var sr = slider.getBoundingClientRect(), r = sel.getBoundingClientRect();
        // from nowhere (or on the first run) it appears in place instead of sliding in from the last entry
        var jump = instant || pill.style.opacity !== '1';
        if (jump) pill.style.transition = 'opacity .25s ease';
        pill.style.opacity = '1';
        pill.style.width = r.width + 'px';
        pill.style.height = r.height + 'px';
        pill.style.transform = 'translate(' + (r.left - sr.left) + 'px,' + (r.top - sr.top) + 'px)';
        if (jump) {
            pill.offsetWidth;
            pill.style.transition = '';
        }
    }
    function queueNav() {
        if (navQueued) return;
        navQueued = requestAnimationFrame(function () { navQueued = 0; syncNav(false); });
    }

    // ---------- header title: fades over when it changes ----------

    var titleEl = null, titleSig = null;
    function watchTitle() {
        var t = document.querySelector('.skinHeader .pageTitle');
        if (!t || t === titleEl || !window.MutationObserver) return;
        titleEl = t;
        titleSig = t.className + '|' + t.textContent;
        new MutationObserver(function () {
            var sig = t.className + '|' + t.textContent;
            if (sig === titleSig) return;
            titleSig = sig;
            fadeIn(t, 5, 320);
        }).observe(t, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // ---------- images fade in once loaded; cards rise in when a page fills ----------

    function isCardImage(t) { return t && t.tagName === 'IMG' && t.classList.contains('cardImage'); }
    function markImg(img) { if (!img.classList.contains('mui-ld')) img.classList.add('mui-ld'); }
    function onImageEvent(e) { if (isCardImage(e.target)) markImg(e.target); }
    function checkImg(img) { if (img.complete && (img.naturalWidth || !img.getAttribute('src'))) markImg(img); }
    function markLoaded(scope) {
        if (scope && scope.querySelectorAll) scope.querySelectorAll('img.cardImage:not(.mui-ld)').forEach(checkImg);
    }

    var revealUntil = 0, revealPending = [], revealSeen = typeof WeakSet === 'function' ? new WeakSet() : null;
    var lastScroll = 0, lastPick = 0;
    function revealCards(view) {
        if (reduceMotion || !document.body.animate) return;
        revealUntil = Date.now() + 2500;
        queueReveal(view.querySelectorAll('.card'));
    }
    // The cards start rising at once, not a frame later: Emby's virtual grids fill their cards inside an animation
    // frame, and a reveal put off to the next one let that frame paint them fully shown, after which they dropped
    // back to transparent and rose (a flash, then the same cards again).
    function queueReveal(cards, again) {
        for (var i = 0; i < cards.length; i++) {
            if (again && revealSeen) revealSeen.delete(cards[i]);
            revealPending.push(cards[i]);
        }
        flushReveal();
    }
    function flushReveal() {
        var vh = window.innerHeight, vw = window.innerWidth, batch = [];
        revealPending.forEach(function (card) {
            if (!card.isConnected || (revealSeen && revealSeen.has(card))) return;
            if (revealSeen) revealSeen.add(card);
            // the poster of a detail page comes in with the page (or flies in), not as one of the cards
            if (card.parentNode && card.parentNode.classList && card.parentNode.classList.contains('detailImageContainer')) return;
            // a virtual grid refills its cards in place, so the card itself moves (its box is replaced)
            var target = card.classList.contains('virtualScrollItem') ? card : card.querySelector('.cardBox');
            if (!target) return;
            var r = target.getBoundingClientRect();
            if (r.width && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) batch.push({ el: target, top: r.top, left: r.left });
        });
        revealPending = [];
        batch.sort(function (a, b) { return Math.abs(a.top - b.top) > 8 ? a.top - b.top : a.left - b.left; });
        batch = batch.slice(0, 48);
        // reading order, spread over at most 260ms however many cards there are
        var step = Math.min(18, 260 / Math.max(1, batch.length - 1));
        batch.forEach(function (c, i) { rise(c.el, Math.round(i * step), 14, 380); });
    }

    // ---------- cards lean toward the pointer, with a soft glare (Apple TV) ----------

    var tilt = null, tiltFrame = 0, tiltX = 0, tiltY = 0;
    function onPointerMove(e) {
        if (e.pointerType !== 'mouse' || reduceMotion || isPhone()) return;
        var t = e.target, card = t && t.closest ? t.closest('.card-hoverable') : null, ic = card && card.parentNode;
        var box = ic && ic.classList && ic.classList.contains('itemsContainer') && !ic.classList.contains('detailImageContainer') &&
            !ic.classList.contains('osdPosterContainer') ? card.querySelector(':scope > .cardBox') : null;
        var media = box && box.querySelector('.cardImageContainer');
        if ((tilt && tilt.box) !== (media ? box : null)) {
            if (tilt) endTilt();
            if (media) tilt = { box: box, rect: media.getBoundingClientRect(), since: performance.now(), close: false };
        }
        if (!tilt) return;
        tiltX = (e.clientX - tilt.rect.left) / tilt.rect.width;
        tiltY = (e.clientY - tilt.rect.top) / tilt.rect.height;
        if (!tiltFrame) tiltFrame = requestAnimationFrame(applyTilt);
    }
    function applyTilt(now) {
        tiltFrame = 0;
        if (!tilt) return;
        // the side under the pointer comes up toward the viewer, where the glare is
        var x = Math.min(1, Math.max(0, tiltX)), y = Math.min(1, Math.max(0, tiltY)), s = tilt.box.style;
        s.setProperty('--mui-rx', ((y - 0.5) * 8).toFixed(2) + 'deg');
        s.setProperty('--mui-ry', ((0.5 - x) * 10).toFixed(2) + 'deg');
        // the lift eases in first; after that the card follows the pointer closely
        if (!tilt.close && now - tilt.since > 320) {
            tilt.close = true;
            tilt.box.classList.add('mui-tilt');
        }
    }
    function endTilt() {
        var b = tilt.box;
        tilt = null;
        b.classList.remove('mui-tilt');
        b.style.removeProperty('--mui-rx');
        b.style.removeProperty('--mui-ry');
    }

    // ---------- a card's poster flies to the detail page, and back ----------

    var flyFrom = null, flyBack = null, lastCard = null, flight = null;

    // corner radius in px; Album Tint's covers use clamp(6px, 3%, 10px), which stays unresolved here
    function radiusOf(e) {
        var v = getComputedStyle(e).borderTopLeftRadius, m;
        if (/^[\d.]+px$/.test(v)) return parseFloat(v);
        if ((m = /^clamp\(([\d.]+)px,\s*([\d.]+)%,\s*([\d.]+)px\)$/.exec(v))) return Math.min(+m[3], Math.max(+m[1], e.offsetWidth * m[2] / 100));
        if ((m = /^([\d.]+)%$/.exec(v))) return e.offsetWidth * m[1] / 100;
        return 10;
    }
    function sameShape(a, b) { return Math.abs(a.width / a.height - b.width / b.height) < 0.2 * b.width / b.height; }

    // the picture of a card, or of a list row (a season's episodes are a list), and its url
    function mediaOf(card) {
        return card.classList.contains('mui-series-cover') ? card : card.querySelector('.cardImageContainer, .listItemImage, .mui-gs-cover');
    }
    function pictureOf(media) {
        var img = media && media.querySelector('img');
        if (img) return img.complete && img.naturalWidth ? img.currentSrc || img.src : null;
        var m = media && /url\(["']?([^"')]+)["']?\)/.exec(media.style.backgroundImage || '');
        return m ? m[1] : null;
    }
    function noteCardClick(e) {
        flyFrom = null;
        if (reduceMotion || e.button) return;
        var t = e.target, card = t.closest('.card, .listItem, .mui-gs-tile, .mui-series-cover');
        if (!card && t.closest('.mui-series-name')) card = t.closest('.mui-series').querySelector('.mui-series-cover');
        if (!card || card.closest('.detailImageContainer, .osdPosterContainer, .dialog, .mainDrawer, .lyricsScroller')) return;
        if (t.closest('.mui-gs-play')) return;
        var act = t.closest('[data-action]');
        if (act && card.contains(act) && act.getAttribute('data-action') !== 'link') return; // play, menu...
        var it = cardItem(card);
        if (!it) return;
        if (isPhone()) {
            if (!card.matches('.mui-gs-tile, .mui-series-cover') && ignorePhoneCard(it.Id)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            flyFrom = { id: it.Id, type: it.Type || card.getAttribute('data-type') || card.getAttribute('data-itemtype') };
            return;
        }
        var media = mediaOf(card), src = pictureOf(media);
        if (!src) return;
        var r = media.getBoundingClientRect();
        if (!r.width || !r.height) return;
        flyFrom = { id: it.Id, type: it.Type, card: card, rect: r, src: src, radius: radiusOf(media), at: Date.now() };
    }

    // where the poster of a detail page is, when it is on screen (for the flight back to its card)
    function posterSpot(view) {
        var card = view.querySelector('.detailImageContainer-main .card');
        var media = card && card.querySelector('.cardImageContainer'), img = media && media.querySelector('img');
        if (!media || !img || !img.complete || !img.naturalWidth) return null;
        var r = media.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return null;
        return { id: card.getAttribute('data-id'), rect: r, src: img.currentSrc || img.src, radius: radiusOf(media), at: Date.now() };
    }
    function onViewBeforeHide(e) {
        var view = e.target;
        if (!view || !view.classList) return;
        if (view.__muiRelease) view.__muiRelease(true);
        if (view.__muiPhoneEntry) { view.__muiPhoneEntry.cancel(); view.__muiPhoneEntry = null; }
        if (view.__muiPhoneVideo) view.__muiPhoneVideo.closeOverlays();
        if (view.__muiCancelTabEnter) view.__muiCancelTabEnter();
        stopTabSlide(view);
        // phones: where the page was left, for when it comes back (see "the document scrolls")
        if (docScroll && view.classList.contains('page')) docSave(pageFrame(view));
        if (!view.classList.contains('itemView')) return;
        flyBack = posterSpot(view);
        rememberHero(view);
    }

    function startFlight(view, r, back, isOsd) {
        if (flight) flight.end();
        var from = flyFrom, home = flyBack;
        flyFrom = flyBack = null;
        if (isOsd || reduceMotion || document.hidden || isPhone()) return false;
        var fresh = function (x) { return x && Date.now() - x.at < 3000; };
        if (!back && fresh(from) && r.path === 'item' && r.params.id === from.id) return flyToDetail(view, from);
        if (back && fresh(home) && home.id) return flyToCard(view, home);
        return false;
    }

    // a copy of the picture, laid over the page at the spot it starts from
    function newFlight(spot, onEnd) {
        var g = el('div', 'mui-fly'), img = el('img');
        img.alt = '';
        img.src = spot.src;
        g.appendChild(img);
        place(g, spot.rect, spot.radius);
        document.body.appendChild(g);
        var f = {
            ghost: g, frame: 0, ended: false,
            end: function () {
                if (f.ended) return;
                f.ended = true;
                cancelAnimationFrame(f.frame);
                clearTimeout(f.safety);
                if (flight === f) flight = null;
                if (onEnd) onEnd();
                // the real picture is back underneath: the copy fades away over it
                g.classList.add('mui-fly-out');
                setTimeout(function () { g.remove(); }, 260);
            }
        };
        f.safety = setTimeout(f.end, 5000); // never leave a copy hanging (a tab throttled in the background, say)
        flight = f;
        return f;
    }
    function place(g, r, radius) {
        var s = g.style;
        s.left = r.left + 'px';
        s.top = r.top + 'px';
        s.width = r.width + 'px';
        s.height = r.height + 'px';
        s.borderRadius = radius + 'px';
    }
    // from a to wherever dest() is now: re-measured every frame, since the page under it may still move
    function fly(f, a, ra, dest, rb, ms, landed) {
        var t0 = 0, last = a;
        function step(now) {
            if (f.ended) return;
            if (!t0) t0 = now;
            var b = dest() || last, p = Math.min(1, (now - t0) / ms), k = ease(p);
            last = b;
            place(f.ghost, {
                left: a.left + (b.left - a.left) * k, top: a.top + (b.top - a.top) * k,
                width: a.width + (b.width - a.width) * k, height: a.height + (b.height - a.height) * k
            }, ra + (rb - ra) * k);
            if (p < 1) f.frame = requestAnimationFrame(step);
            else landed();
        }
        f.frame = requestAnimationFrame(step);
    }
    // the destination's sharper picture, laid over the copy as soon as it has loaded
    function sharpen(g, img) {
        var src = img && (img.currentSrc || img.getAttribute('src'));
        if (!src || src === g.firstChild.src) return;
        var hi = el('img', 'mui-sharp');
        hi.alt = '';
        hi.onload = function () { hi.classList.add('mui-ld'); };
        hi.src = src;
        g.appendChild(hi);
    }
    function whenLoaded(img, limit, cb) {
        if (!img || (img.complete && img.naturalWidth)) { cb(); return; }
        var done = false, timer = setTimeout(go, limit);
        function go() { if (done) return; done = true; clearTimeout(timer); cb(); }
        img.addEventListener('load', go, { once: true });
        img.addEventListener('error', go, { once: true });
    }

    function flyToDetail(view, from) {
        lastCard = { id: from.id, el: from.card };
        var person = from.type === 'Person', placeholder = null;
        if (person) view.__muiPerson = true;
        root.classList.add('mui-fly-detail'); // the page's own poster stays hidden until the copy lands on it
        var f = newFlight(from, function () {
            root.classList.remove('mui-fly-detail');
            if (placeholder && placeholder.classList.contains('mui-person-placeholder')) placeholder.remove();
        });
        function realPoster() {
            return view.querySelector('.detailImageContainer-main .card:not(.mui-person-placeholder) .cardImageContainer');
        }
        waitFor(function () {
            if (f.ended) return 'off';
            if (!person && !pageReady(view, { path: 'item' })) return null;
            var box = view.querySelector('.detailImageContainer-main');
            if (!box) return null;
            if (getComputedStyle(box).display === 'none') return 'off'; // phones show no poster there
            if (person && !box.querySelector('.cardImageContainer') && box.clientWidth && !placeholder) {
                // Use Emby's own portrait geometry before the slow person query finishes. This is invisible
                // beneath the flying copy, and is replaced by Emby's real card when metadata arrives.
                placeholder = el('div', 'card portraitCard detailImageContainerCard mui-person-placeholder');
                placeholder.setAttribute('aria-hidden', 'true');
                var cardBox = el('div', 'detailImageContainerCard-cardBox cardBox');
                cardBox.appendChild(el('div', 'cardContent cardImageContainer cardPadder-portrait'));
                placeholder.appendChild(cardBox);
                box.appendChild(placeholder);
            }
            var m = box.querySelector('.cardImageContainer'), b = m && m.getBoundingClientRect();
            return b && b.width && b.height ? m : null;
        }, function (dest) {
            if (dest === 'off' || f.ended || !sameShape(from.rect, dest.getBoundingClientRect())) { f.end(); return; }
            sharpen(f.ghost, dest.querySelector('img'));
            fly(f, from.rect, from.radius, function () {
                // Emby may render the poster again while the copy is in the air: follow the current one
                var real = realPoster();
                if (real && real !== dest) { dest = real; sharpen(f.ghost, real.querySelector('img')); }
                return dest.isConnected ? dest.getBoundingClientRect() : null;
            }, radiusOf(dest), 580, function () {
                // Hand over only once the page's own picture is there, and show it at once (no fade of its own):
                // the copy then fades away over the same picture. Otherwise the copy went, the spot was empty for a
                // moment, and the picture faded in a second time.
                waitFor(function () { return f.ended ? 'off' : realPoster(); }, function (real) {
                    if (real === 'off' || f.ended) return;
                    var img = real.querySelector('img');
                    whenLoaded(img, 3000, function () {
                        var card = real.closest('.card');
                        if (card) card.classList.add('mui-landing');
                        if (img && img.naturalWidth) markImg(img);
                        f.end();
                        if (card) setTimeout(function () { card.classList.remove('mui-landing'); }, 400);
                    });
                }, 3000, f.end);
            });
        }, 1200, f.end);
        return true;
    }

    function flyToCard(view, spot) {
        var card = lastCard && lastCard.id === spot.id && lastCard.el && lastCard.el.isConnected && view.contains(lastCard.el) &&
            (cardItem(lastCard.el) || {}).Id === spot.id ? lastCard.el : findCard(view, spot.id);
        var media = card && mediaOf(card), b = media && media.getBoundingClientRect();
        if (!b || !b.width || b.bottom < 0 || b.top > window.innerHeight || b.right < 0 || b.left > window.innerWidth || !sameShape(spot.rect, b)) return false;
        card.classList.add('mui-fly-target');
        var f = newFlight(spot, function () { card.classList.remove('mui-fly-target'); });
        fly(f, spot.rect, spot.radius, function () { return media.isConnected ? media.getBoundingClientRect() : null; },
            radiusOf(media), 500, f.end);
        return true;
    }
    function findCard(view, id) {
        var cards = view.querySelectorAll('.itemsContainer > .card, .itemsContainer > .listItem, .mui-gs-tile, .mui-series-cover');
        for (var i = 0; i < cards.length; i++) {
            if (cards[i].parentNode.classList.contains('detailImageContainer')) continue;
            var it = cardItem(cards[i]);
            if (it && it.Id === id) return cards[i];
        }
        return null;
    }

    // ---------- spotlight banner: home page and library suggestions ----------

    var spotCache = {};
    function spotlightItems(parentId) {
        var key = parentId || 'home', a = api();
        if (spotCache[key]) return spotCache[key];
        try {
            var saved = JSON.parse(sessionStorage.getItem('mui.spot.' + key) || 'null');
            if (saved && Date.now() - saved.at < 30 * 60000 && saved.items && saved.items.length) return (spotCache[key] = Promise.resolve(saved.items));
        } catch (e) { }
        if (!a) return Promise.reject(new Error('no api client'));
        var query = {
            IncludeItemTypes: 'Movie,Series', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', ImageTypes: 'Backdrop',
            Limit: 30, ImageTypeLimit: 1, EnableImageTypes: 'Backdrop,Logo,Primary', EnableUserData: true,
            Fields: 'Overview,Genres,ProductionYear,CommunityRating,OfficialRating,RunTimeTicks,ChildCount,EndDate,Status'
        };
        if (parentId) query.ParentId = parentId;
        spotCache[key] = a.getItems(a.getCurrentUserId(), query).then(function (res) {
            var all = (res.Items || []).filter(function (it) { return it.BackdropImageTags && it.BackdropImageTags.length; });
            // the newest ones that have a title logo first, then pick a few of those at random
            var withLogo = all.filter(function (it) { return it.ImageTags && it.ImageTags.Logo; });
            var pool = withLogo.length >= SPOT_COUNT ? withLogo.slice(0, SPOT_COUNT * 2) : withLogo.concat(all.filter(function (it) { return withLogo.indexOf(it) < 0; })).slice(0, SPOT_COUNT * 2);
            for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
            var items = pool.slice(0, SPOT_COUNT).map(function (it) {
                var ud = it.UserData || {};
                return {
                    Id: it.Id, ServerId: it.ServerId, Name: it.Name, Type: it.Type, Overview: stripTags(it.Overview),
                    Genres: (it.Genres || []).slice(0, 3), Year: it.ProductionYear, Rating: it.CommunityRating, Official: it.OfficialRating,
                    Ticks: it.RunTimeTicks, Seasons: it.ChildCount, EndDate: it.EndDate, Status: it.Status,
                    Backdrop: it.BackdropImageTags[0], Logo: it.ImageTags && it.ImageTags.Logo,
                    Position: ud.PlaybackPositionTicks || 0, Favorite: !!ud.IsFavorite
                };
            });
            try { sessionStorage.setItem('mui.spot.' + key, JSON.stringify({ at: Date.now(), items: items })); } catch (e) { }
            return items;
        });
        spotCache[key].catch(function () { delete spotCache[key]; });
        return spotCache[key];
    }

    // where a banner belongs right now: the home tab of the home page, or a library's suggestions tab.
    // Returns null for other pages, or { pending: true } while Emby is still filling in the sections.
    function spotlightTarget() {
        // Phones open straight onto My Media: no banner. The home's blurred art still comes from the library's picks.
        if (isPhone()) return null;
        var r = routeInfo(), parentId = null, home = r.path === 'home' || r.path === 'home.html';
        if (!home) {
            if (!/^(videos|tv|movies)$/.test(r.path) || !r.params.parentId || r.params.tab !== 'suggestions') return null;
            parentId = r.params.parentId;
        }
        var view = document.querySelector('.view.withTabs:not(.hide)');
        var content = view && view.querySelector('.tabContent.is-active');
        if (!content || content.offsetParent === null) return { pending: true };
        if (home && content.getAttribute('data-index') !== '0') return null; // the favorites tab
        var sections = content.querySelector('.sections, .verticalSections');
        if (!sections || !sections.querySelector('.verticalSection')) return { pending: true };
        return { sections: sections, scroller: content, parentId: parentId };
    }

    var spotlights = [], spotWait = 0;
    function updateSpotlights() {
        var t = spotlightTarget();
        clearTimeout(spotWait);
        if (t && t.pending) {
            // try again shortly; the sections arrive a moment after the page shows
            var tries = (updateSpotlights.tries || 0) + 1;
            updateSpotlights.tries = tries;
            if (tries < 60) spotWait = setTimeout(updateSpotlights, 100);
            t = null;
        } else updateSpotlights.tries = 0;
        root.classList.toggle('mui-onspotlight', !!t);
        spotlights.forEach(function (s) { s.setActive(!!t && s.sections === t.sections); });
        if (!t) return;
        var existing = spotlights.filter(function (s) { return s.sections === t.sections; })[0];
        if (existing) { existing.ensureAttached(); return; }
        var record = { sections: t.sections, setActive: function () { }, ensureAttached: function () { } };
        spotlights.push(record);
        spotlightItems(t.parentId).then(function (items) {
            if (!items.length) return;
            var s = createSpotlight(items, t.sections);
            record.setActive = s.setActive;
            record.ensureAttached = s.ensureAttached;
            s.ensureAttached();
            var now = spotlightTarget();
            s.setActive(!!now && now.sections === t.sections);
        }, function (e) { console.warn('[ModernUI] spotlight', e); });
        // forget banners whose page Emby has thrown away
        spotlights = spotlights.filter(function (s) { return s.sections.isConnected; });
    }

    function metaLine(it) {
        var meta = el('div', 'mui-sl-meta');
        if (it.Rating) {
            var star = el('span');
            star.appendChild(el('i', 'md-icon md-icon-fill mui-star', 'star'));
            star.appendChild(document.createTextNode(Number(it.Rating).toFixed(1)));
            meta.appendChild(star);
        }
        if (it.Year) meta.appendChild(el('span', '', it.Type === 'Series' && it.EndDate && it.Status === 'Ended' ? it.Year + '–' + new Date(it.EndDate).getFullYear() : String(it.Year)));
        if (it.Type === 'Series' && it.Seasons) meta.appendChild(el('span', '', L(it.Seasons + ' 季', it.Seasons + (it.Seasons > 1 ? ' seasons' : ' season'))));
        else if (it.Ticks) {
            var min = Math.round(it.Ticks / 600000000);
            meta.appendChild(el('span', '', min >= 60 ? Math.floor(min / 60) + L(' 小时 ', ' h ') + (min % 60) + L(' 分钟', ' min') : min + L(' 分钟', ' min')));
        }
        if (it.Official) meta.appendChild(el('span', 'mui-sl-badge', it.Official));
        if (it.Genres.length) meta.appendChild(el('span', '', it.Genres.join(' · ')));
        return meta;
    }

    function createSpotlight(items, sections) {
        var a = api();
        var host = el('div', 'mui-spotlight');
        var shade = el('div', 'mui-sl-shade');
        var dots = el('div', 'mui-sl-dots');
        var prev = el('button', 'mui-sl-arrow mui-sl-prev'), next = el('button', 'mui-sl-arrow mui-sl-next');
        prev.type = next.type = 'button';
        prev.setAttribute('aria-label', L('上一个', 'Previous'));
        next.setAttribute('aria-label', L('下一个', 'Next'));
        prev.appendChild(icon('chevron_left'));
        next.appendChild(icon('chevron_right'));
        host.style.setProperty('--mui-sl-ms', SLIDE_MS + 'ms');

        var slides = [], infos = [], dotEls = [];
        items.forEach(function (it, i) {
            var slide = el('div', 'mui-sl-slide');
            var img = el('img');
            img.alt = '';
            img.decoding = 'async';
            img.draggable = false;
            slide.appendChild(img);
            slide.addEventListener('click', function () { showItem(it); });
            slides.push(slide);

            var info = el('div', 'mui-sl-info');
            var title = el('h1', 'mui-sl-title', it.Name);
            if (it.Logo) {
                var logoSlot = el('div', 'mui-sl-logo-slot');
                var logo = el('img', 'mui-sl-logo');
                logo.alt = it.Name;
                logo.decoding = 'async';
                logo.hidden = true;
                logo.onload = function revealLogo() {
                    if (swipeMotion && swipeMotion.playState === 'running') {
                        swipeMotion.finished.then(revealLogo, revealLogo);
                        return;
                    }
                    logo.hidden = false;
                    title.hidden = true;
                };
                logo.dataset.src = imgUrl(it.Id, 'Logo', it.Logo, 600, 90);
                logoSlot.append(logo, title);
                info.appendChild(logoSlot);
            } else info.appendChild(title);
            info.appendChild(metaLine(it));
            if (it.Overview) info.appendChild(el('p', 'mui-sl-overview', it.Overview));

            var actions = el('div', 'mui-sl-actions');
            var play = el('button', 'mui-btn mui-btn-primary');
            play.type = 'button';
            play.appendChild(icon('play_arrow'));
            var resume = it.Position > 0 && it.Ticks;
            play.appendChild(el('span', '', resume ? L('继续播放', 'Resume') : L('播放', 'Play')));
            if (resume) {
                var bar = el('span', 'mui-sl-progress'), fill = el('i');
                fill.style.width = Math.min(100, it.Position / it.Ticks * 100).toFixed(1) + '%';
                bar.appendChild(fill);
                play.appendChild(bar);
            }
            play.addEventListener('click', function () {
                if (!pm) return showItem(it);
                var opts = { ids: [it.Id], serverId: it.ServerId };
                if (resume) opts.startPositionTicks = it.Position;
                pm.play(opts);
            });
            var more = el('button', 'mui-btn mui-btn-glass');
            more.type = 'button';
            more.appendChild(icon('info'));
            more.appendChild(el('span', '', L('详细信息', 'Details')));
            more.addEventListener('click', function () { showItem(it); });
            var fav = el('button', 'mui-btn mui-btn-glass mui-btn-round');
            fav.type = 'button';
            fav.setAttribute('aria-label', L('收藏', 'Favorite'));
            var favIcon = el('i', 'md-icon' + (it.Favorite ? ' md-icon-fill' : ''), 'favorite');
            fav.appendChild(favIcon);
            fav.addEventListener('click', function () {
                var on = !it.Favorite;
                a.updateFavoriteStatus(a.getCurrentUserId(), it.Id, on).then(function () {
                    it.Favorite = on;
                    favIcon.classList.toggle('md-icon-fill', on);
                    try {
                        var key = 'mui.spot.' + (routeInfo().params.parentId || 'home'), saved = JSON.parse(sessionStorage.getItem(key) || 'null');
                        if (saved) { saved.items.forEach(function (x) { if (x.Id === it.Id) x.Favorite = on; }); sessionStorage.setItem(key, JSON.stringify(saved)); }
                    } catch (e) { }
                });
            });
            actions.appendChild(play);
            actions.appendChild(more);
            actions.appendChild(fav);
            info.appendChild(actions);
            infos.push(info);

            var dot = el('button', 'mui-sl-dot');
            dot.type = 'button';
            dot.setAttribute('aria-label', it.Name);
            dot.addEventListener('click', function () { go(i, true); });
            dotEls.push(dot);
            dots.appendChild(dot);
        });

        slides.forEach(function (s) { host.appendChild(s); });
        host.appendChild(shade);
        infos.forEach(function (x) { host.appendChild(x); });
        if (items.length > 1) { host.appendChild(dots); host.appendChild(prev); host.appendChild(next); }

        var index = -1, timer = 0, active = false, hovering = false, swipeMotion, nextSlide;
        function art(i) {
            var img = slides[i].firstChild;
            if (!img.getAttribute('src')) {
                img.onload = function () { tint(slides[i], img); };
                img.src = imgUrl(items[i].Id, 'Backdrop', items[i].Backdrop, heroWidth(host), 80, 0);
            }
            var logo = infos[i].querySelector('.mui-sl-logo');
            if (logo && !logo.getAttribute('src')) logo.src = logo.dataset.src;
        }
        function go(i, manual) {
            var n = items.length;
            i = ((i % n) + n) % n;
            if (swipeMotion && swipeMotion.playState === 'running') {
                nextSlide = { index: i, direction: manual };
                art(i);
                return;
            }
            if (i === index) return;
            var old = index;
            index = i;
            art(i);
            if (n > 1) art((i + 1) % n);
            if (n > 2 && isPhone()) art((i + n - 1) % n);
            slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
            infos.forEach(function (x, k) { x.classList.toggle('is-active', k === i); });
            dotEls.forEach(function (d, k) {
                d.classList.toggle('is-active', k === i);
                if (k === i) { d.style.animation = 'none'; d.offsetWidth; d.style.animation = ''; }
            });
            // restart the Ken Burns drift and the dot's fill
            var img = slides[i].firstChild;
            img.style.animation = 'none';
            img.offsetWidth;
            img.style.animation = '';
            if (isPhone() && old >= 0 && !reduceMotion && host.animate) {
                var direction = manual || 1;
                var dx = host.clientWidth * (direction < 0 ? -1 : 1);
                var options = { duration: 360, easing: EASE };
                [slides[i], infos[i], slides[old], infos[old]].forEach(function (node) {
                    var incoming = node === slides[i] || node === infos[i];
                    var motion = node.animate([
                        { transform: 'translateX(' + (incoming ? dx : 0) + 'px)', opacity: 1, visibility: 'visible' },
                        { transform: 'translateX(' + (incoming ? 0 : -dx) + 'px)', opacity: 1, visibility: 'visible' }
                    ], options);
                    if (node === slides[i]) swipeMotion = motion;
                });
                swipeMotion.finished.then(function () {
                    var queued = nextSlide;
                    nextSlide = null;
                    if (queued && active && host.isConnected) go(queued.index, queued.direction);
                }, function () {});
            }
            spotArt(host, items[i]);
            if (old >= 0 || manual) schedule();
        }
        function schedule() {
            clearTimeout(timer);
            if (!active || items.length < 2 || reduceMotion) return;
            timer = setTimeout(function () {
                if (!active) return;
                if (hovering || !seen || document.hidden || host.offsetParent === null) { schedule(); return; }
                go(index + 1);
            }, SLIDE_MS);
        }
        // start the current slide over (its dot fills from empty again)
        function restart() {
            var dot = dotEls[index];
            if (dot) { dot.classList.remove('is-active'); dot.offsetWidth; dot.classList.add('is-active'); }
            schedule();
        }
        // the slides only turn while the banner is in view; scrolled back to it, the current one starts over
        var seen = true;
        if (window.IntersectionObserver) {
            new IntersectionObserver(function (entries) {
                var now = entries[entries.length - 1].intersectionRatio > 0.2;
                if (now === seen) return;
                seen = now;
                setPaused();
                if (seen && active) restart();
            }, { threshold: [0, 0.2, 0.4] }).observe(host);
        }
        function setPaused() { host.classList.toggle('is-paused', hovering || !seen || !active || document.hidden); }
        // the pointer on the banner brings the page's art back to the banner's picture
        host.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { hovering = true; setPaused(); spotArt(host, items[index], true); } });
        host.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hovering = false; setPaused(); schedule(); } });
        host.addEventListener('focusin', function () { hovering = true; setPaused(); });
        host.addEventListener('focusout', function () { hovering = false; setPaused(); schedule(); });
        document.addEventListener('visibilitychange', setPaused);
        prev.addEventListener('click', function (e) { e.stopPropagation(); go(index - 1, -1); });
        next.addEventListener('click', function (e) { e.stopPropagation(); go(index + 1, 1); });

        // swipe on touch screens
        var sx = null, sy = 0, skipClick = 0;
        host.addEventListener('click', function (e) {
            if (Date.now() < skipClick) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
        host.addEventListener('pointercancel', function () { sx = null; });
        host.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
        host.addEventListener('pointerup', function (e) {
            if (sx === null) return;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            sx = null;
            if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                skipClick = Date.now() + 300;
                var step = dx < 0 ? 1 : -1;
                go((nextSlide ? nextSlide.index : index) + step, step);
            }
        });

        function layout() {
            // reach up under the transparent header, and line the text up with the rows below
            var pull = parseFloat(getComputedStyle(sections).paddingTop) || 0;
            host.style.setProperty('--mui-pull', pull + 'px');
            var pad = sections.querySelector('.padded-left-page');
            if (pad) host.style.setProperty('--mui-padx', getComputedStyle(pad).paddingLeft);
        }
        var mo = window.MutationObserver ? new MutationObserver(function () { if (host.parentNode !== sections) ensureAttached(); }) : null;
        if (mo) mo.observe(sections, { childList: true });
        function ensureAttached() {
            if (host.parentNode !== sections || sections.firstElementChild !== host) sections.insertBefore(host, sections.firstElementChild);
            layout();
        }
        window.addEventListener('resize', function () { if (host.isConnected) layout(); });

        go(0);
        return {
            ensureAttached: ensureAttached,
            setActive: function (on) {
                if (active === on) return;
                active = on;
                setPaused();
                if (on) restart(); // the page came back
                else clearTimeout(timer);
            }
        };
    }

    // the art's own color, darkened, for the glow under the banner text (sampled from the loaded image)
    function tint(slide, img) {
        setTimeout(function () {
            try {
                var c = document.createElement('canvas'), w = 24, h = 14;
                c.width = w; c.height = h;
                var g = c.getContext('2d', { willReadFrequently: true });
                g.drawImage(img, 0, 0, w, h);
                var d = g.getImageData(0, 0, w, h).data, r = 0, gr = 0, b = 0, n = 0;
                for (var i = 0; i < d.length; i += 4) {
                    var mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
                    var weight = 1 + (mx - mn) / 32; // colorful pixels count more than grey ones
                    r += d[i] * weight; gr += d[i + 1] * weight; b += d[i + 2] * weight; n += weight;
                }
                var hsl = toHsl(r / n, gr / n, b / n);
                slide.style.setProperty('--mui-tint', 'hsla(' + hsl[0].toFixed(0) + ',' + Math.min(70, hsl[1] * 100 + 15).toFixed(0) + '%,' + Math.min(38, Math.max(22, hsl[2] * 100)).toFixed(0) + '%,.9)');
            } catch (e) { }
        }, 50);
    }
    function toHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
        if (mx !== mn) {
            var d = mx - mn;
            s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= 60;
        }
        return [h, s, l];
    }

    // ---------- art behind the page: the banner's or the library's on home and library pages, the video's on its details ----------

    var bgLayers = null, bgFront = 0, bgWant = null, bgShown = null, bgBusy = 0, bgTimer = 0;
    var artToken = 0, itemToken = 0, artPage = false;
    function ensureBg() {
        if (bgLayers && bgLayers[0].isConnected) return true;
        var anchor = document.querySelector('.backgroundContainer');
        if (!anchor) return false;
        var host = document.getElementById('mui-bg');
        if (!host) {
            host = el('div');
            host.id = 'mui-bg';
            host.appendChild(el('div'));
            host.appendChild(el('div'));
            anchor.parentNode.insertBefore(host, anchor.nextSibling);
        }
        bgLayers = [host.children[0], host.children[1]];
        return true;
    }
    // Crossfades to url (kind 'lib' or 'item'). A change that comes in while a crossfade runs waits for it, so a
    // layer never swaps its picture while it is still fading out.
    function setPageBg(url, kind) {
        var want = url ? kind + '|' + url : null;
        if (want === bgWant) return;
        bgWant = want;
        root.classList.toggle('mui-pagebg', !!url);
        root.classList.toggle('mui-itembg', !!url && kind === 'item');
        clearTimeout(bgTimer);
        function show() {
            if (bgWant !== want || !ensureBg()) return;
            if (!url) { bgLayers.forEach(function (l) { l.classList.remove('mui-on'); }); bgShown = null; barColour(null); return; }
            var wait = bgBusy - Date.now();
            if (wait > 0) { bgTimer = setTimeout(show, wait); return; }
            if (bgShown === want) return;
            var next = bgLayers[1 - bgFront];
            next.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
            next.classList.toggle('mui-lib', kind === 'lib');
            // dim bright art more than dark art, so every page ends up about as dark (a white album cover would
            // otherwise turn the page grey)
            var lib = kind === 'lib', lum = lumaOf(probe);
            var bgb = Math.max(.2, Math.min(lib ? .62 : .5, (lib ? .18 : .14) / Math.max(lum, .05)));
            next.style.setProperty('--mui-bgb', bgb.toFixed(3));
            barColour(probe, bgb);
            next.classList.add('mui-on');
            bgLayers[bgFront].classList.remove('mui-on');
            bgFront = 1 - bgFront;
            bgShown = want;
            bgBusy = Date.now() + 900;
        }
        if (!url) { show(); return; }
        var probe = new Image();
        probe.onload = show;
        probe.src = url;
    }
    // the colour of the top edge of the page's art, as dim as the page shows it, for the browser's bars
    var themeMeta = null, themeDefault = null;
    function barColour(img, dim) {
        if (!themeMeta) {
            themeMeta = document.querySelector('meta[name="theme-color"]');
            if (!themeMeta) { themeMeta = document.createElement('meta'); themeMeta.name = 'theme-color'; document.head.appendChild(themeMeta); }
            themeDefault = themeMeta.getAttribute('content') || '#141414';
        }
        var colour = themeDefault;
        if (img) {
            try {
                var c = document.createElement('canvas');
                c.width = 8; c.height = 2;
                var g = c.getContext('2d', { willReadFrequently: true });
                // the blurred layer shows the picture scaled to cover; its top strip is what sits under the bar
                g.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * .2, 0, 0, 8, 2);
                var d = g.getImageData(0, 0, 8, 2).data, r = 0, gr = 0, b = 0, n = d.length / 4;
                for (var i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
                var k = (dim || .4) / n;
                colour = 'rgb(' + Math.round(r * k) + ',' + Math.round(gr * k) + ',' + Math.round(b * k) + ')';
            } catch (e) { }
        }
        if (themeMeta.getAttribute('content') !== colour) themeMeta.setAttribute('content', colour);
        // the page background and the layers at the screen's edges, which Safari extends into its bars
        root.style.setProperty('--mui-bar', colour);
    }
    // average brightness (0..1) of a loaded image, from a 16x9 copy
    function lumaOf(img) {
        try {
            var c = document.createElement('canvas'), w = 16, h = 9;
            c.width = w; c.height = h;
            var g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0, w, h);
            var d = g.getImageData(0, 0, w, h).data, sum = 0;
            for (var i = 0; i < d.length; i += 4) sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
            return sum / (d.length / 4) / 255;
        } catch (e) { return .35; }
    }

    function backdropOf(item) {
        if (item.BackdropImageTags && item.BackdropImageTags.length) return { id: item.Id, tag: item.BackdropImageTags[0] };
        if (item.ParentBackdropItemId && item.ParentBackdropImageTags && item.ParentBackdropImageTags.length) return { id: item.ParentBackdropItemId, tag: item.ParentBackdropImageTags[0] };
        return null;
    }
    function logoOf(item) {
        if (item.ImageTags && item.ImageTags.Logo) return { id: item.Id, tag: item.ImageTags.Logo };
        if (item.ParentLogoItemId && item.ParentLogoImageTag) return { id: item.ParentLogoItemId, tag: item.ParentLogoImageTag };
        return null;
    }
    // a small copy is enough for the heavily blurred background
    function artUrl(item) {
        var bd = backdropOf(item);
        if (bd) return imgUrl(bd.id, 'Backdrop', bd.tag, 320, 60, 0);
        if (item.ImageTags && item.ImageTags.Primary) return imgUrl(item.Id, 'Primary', item.ImageTags.Primary, 240, 60);
        return null;
    }

    // parentId null: the home page (its banner's picks, or covers from anywhere)
    var libArt = {};
    function libraryArt(parentId) {
        if (libArt[parentId]) return libArt[parentId];
        var p = spotlightItems(parentId).then(function (items) {
            if (items.length) return items.map(function (it) { return imgUrl(it.Id, 'Backdrop', it.Backdrop, 320, 60, 0); });
            // music and photo libraries have no backdrops; their covers work as well, blurred
            var a = api(), query = {
                Recursive: true, SortBy: 'Random', Limit: 6, ImageTypes: 'Primary', EnableImageTypes: 'Primary',
                ImageTypeLimit: 1, IncludeItemTypes: 'MusicAlbum,Movie,Series,Video,Photo,BoxSet'
            };
            if (parentId) query.ParentId = parentId;
            return a.getItems(a.getCurrentUserId(), query).then(function (res) {
                return (res.Items || []).map(artUrl).filter(Boolean);
            });
        });
        libArt[parentId] = p;
        p.catch(function () { delete libArt[parentId]; });
        return p;
    }

    function updatePageArt(view, r) {
        r = r || routeInfo();
        view = view || document.querySelector('.view:not(.hide)');
        var token = ++artToken, pid = r.params.parentId, lib = !!pid && LIBRARY_PATHS.test(r.path);
        artPage = lib || r.path === 'home' || r.path === 'home.html';
        if (r.path.indexOf('item') === 0 && r.params.id) { updateItemPage(view, r); return; }
        ++itemToken;
        root.classList.remove('mui-videoitem', 'mui-haslogo-page');
        // the search page comes back with the art of its first match
        if (r.path === 'search' && view && view.__muiArt) { setPageBg(view.__muiArt, 'lib'); return; }
        if (!artPage) { setPageBg(null); return; }
        // a page that comes back shows the art it had (the banner's last picture, or the last card the pointer
        // rested on)
        if (view && view.__muiArt) {
            setPageBg(view.__muiArt, 'lib');
            if (!isPhone()) return;
        }
        libraryArt(lib ? pid : null).then(function (urls) {
            if (token !== artToken || !urls.length) return;
            if (view && !view.__muiArt) view.__muiArt = urls[0]; // the banner's first picture: its picks are shuffled already
            setPageBg(view && view.__muiArt || urls[0], 'lib');
            if (!view || !isPhone() || reduceMotion || urls.length < 2) return;
            function rotate() {
                if (token !== artToken || !view.isConnected || view.classList.contains('hide') || !isPhone()) return;
                if (!document.hidden && !root.classList.contains('mui-onspotlight')) {
                    var choices = urls.filter(function (url) { return url !== view.__muiArt; });
                    if (choices.length) {
                        view.__muiArt = choices[Math.floor(Math.random() * choices.length)];
                        setPageBg(view.__muiArt, 'lib');
                    }
                }
                setTimeout(rotate, SLIDE_MS);
            }
            setTimeout(rotate, SLIDE_MS);
        }, function () { });
    }
    // The banner's current picture lights the page behind it, so the banner fades into its own art. Skipped while
    // the pointer rests on the card whose art is showing; force: the pointer just came onto the banner.
    function spotArt(host, it, force) {
        var view = host.closest('.view');
        if (!view || !it || !it.Backdrop || (pinnedCard && !force)) return;
        var url = imgUrl(it.Id, 'Backdrop', it.Backdrop, 320, 60, 0);
        view.__muiArt = url;
        if (artPage && !view.classList.contains('hide') && host.offsetParent !== null) setPageBg(url, 'lib');
    }

    // on home and library pages the art follows the card the pointer rests on, the way Plex does
    // (pinnedCard: the card under the pointer whose art is showing)
    var hoverCard = null, hoverTimer = 0, pinnedCard = null;
    function onPointerOver(e) {
        if (e.pointerType !== 'mouse' || !artPage || isPhone()) return;
        var card = e.target && e.target.closest ? e.target.closest('.card') : null;
        if (card === hoverCard) return;
        hoverCard = card;
        pinnedCard = null;
        clearTimeout(hoverTimer);
        if (!card || card.closest('.dialog')) return;
        hoverTimer = setTimeout(function () {
            if (hoverCard !== card || !artPage || !card.isConnected) return;
            // a library tile's picture is a collage of posters, which only blurs into mud
            var it = cardItem(card), url = it && it.Type && it.Type !== 'CollectionFolder' && it.Type !== 'UserView' ? artUrl(it) : null;
            if (!url) return;
            var view = card.closest('.view');
            if (view) view.__muiArt = url;
            pinnedCard = card;
            setPageBg(url, 'lib');
        }, 450);
    }

    // ---------- video detail pages: backdrop hero, title logo, blurred art behind the page ----------

    // A show, its seasons and its episodes share one backdrop. The detail page we leave hands its backdrop to the
    // next one, which shows it straight away (instead of going dark and fading the same picture in again) and
    // swaps it only if its own is a different one.
    var heroCarry = null;
    function rememberHero(view) {
        var hero = view.querySelector(':scope > .mui-hero:not(.mui-hero-leaving)'), img = hero && hero.querySelector('img');
        var opacity = hero ? parseFloat(hero.style.opacity || '1') : 0, shift = hero && /translate3d\(0px?,\s*(-?[\d.]+)px/.exec(hero.style.transform || '');
        heroCarry = img && img.complete && img.naturalWidth && opacity > 0.02
            ? { src: img.getAttribute('src'), opacity: opacity, shift: shift ? +shift[1] : 0, at: Date.now() } : null;
    }
    function carryHero(view) {
        var carry = heroCarry;
        heroCarry = null;
        if (!carry || Date.now() - carry.at > 4000 || view.querySelector(':scope > .mui-hero')) return;
        var hero = el('div', 'mui-hero mui-hero-still'), img = el('img', 'mui-ld');
        img.alt = '';
        img.src = carry.src;
        hero.appendChild(img);
        hero.dataset.carried = '1';
        view.insertBefore(hero, view.firstChild);
        view.classList.add('mui-hashero');
        bindParallax(view, hero);
        // it was scrolled away (faded and shifted up) on the last page; the new page starts at the top
        if (!reduceMotion && hero.animate && (carry.opacity < 0.98 || carry.shift)) {
            hero.animate([{ opacity: carry.opacity, transform: 'translate3d(0,' + carry.shift + 'px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
                { duration: 520, easing: EASE });
        }
    }
    function leaveHero(hero, after) {
        setTimeout(function () {
            hero.classList.add('mui-hero-leaving');
            setTimeout(function () { hero.remove(); }, 750);
        }, after || 0);
    }

    function updateItemPage(view, r) {
        var token = ++itemToken;
        function clear() {
            setPageBg(null);
            root.classList.remove('mui-videoitem', 'mui-haslogo-page');
            if (view) view.classList.remove('mui-hashero');
            var carried = view && view.querySelector(':scope > .mui-hero[data-carried]');
            if (carried) leaveHero(carried);
        }
        detailItem(view, r.params.id).then(function (item) {
            if (token !== itemToken) return;
            // Scope the phone album header by item type, independently of Album Tint or available artwork.
            if (view) view.classList.toggle('mui-albumpage', item.Type === 'MusicAlbum');
            if (view && VIDEO_TYPES[item.Type]) phoneVideoDetails(view, item);
            if (item.Type === 'MusicArtist') { clear(); artistPage(view, item, token); return; }
            if (!VIDEO_TYPES[item.Type]) { clear(); return; }
            var bd = backdropOf(item), logo = logoOf(item);
            root.classList.add('mui-videoitem');
            root.classList.toggle('mui-haslogo-page', !!logo);
            setPageBg(artUrl(item), 'item');
            waitFor(function () {
                var v = view && view.classList.contains('itemView') && !view.classList.contains('hide') ? view : document.querySelector('.itemView:not(.hide)');
                return v && v.querySelector('.detailMainContainer .itemName-primary') ? v : null;
            }, function (v) {
                if (token !== itemToken) return;
                decorateItemView(v, item, bd, logo);
                // Emby fills in parts of the page again a moment later (user data, versions); put the logo back
                [800, 2000].forEach(function (ms) {
                    setTimeout(function () { if (token === itemToken && v.isConnected) decorateItemView(v, item, bd, logo); }, ms);
                });
            });
        }, function () { if (token === itemToken) clear(); });
    }

    // ---------- Phone video details: keep the native season navigation and preview episodes in place ----------

    function phoneEpisodeClick(e) {
        if (!isPhone() || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
        if (e.target.closest('button[data-action]:not([data-action="link"]),.cardOverlayButton,.cardOverlayFab-primary,.multiSelectCheckbox')) return false;
        var card = e.target.closest('.mui-phone-episode');
        var view = card && card.closest('.itemView'), state = view && view.__muiPhoneVideo;
        var item = state && cardItem(card);
        if (!item || !item.Id || (item.Type && item.Type !== 'Episode')) return false;
        e.preventDefault();
        e.stopImmediatePropagation();
        state.select(item, card);
        return true;
    }

    function phoneVideoDetails(view, base) {
        if (!isPhone()) return;
        var nativeTop = view.querySelector('.topDetailsContainer');
        if (!nativeTop || !view.contains(nativeTop)) return;
        if (view.__muiPhoneVideo && view.__muiPhoneVideo.baseId === base.Id) {
            view.__muiPhoneVideo.sync();
            return;
        }
        if (view.__muiPhoneVideo) view.__muiPhoneVideo.destroy();
        var panel = el('section', 'mui-phone-video-head');
        var art = el('div', 'mui-phone-video-art');
        var body = el('div', 'mui-phone-video-body');
        var badge = el('img', 'mui-phone-video-logo');
        badge.alt = base.SeriesName || base.Name || '';
        badge.hidden = true;
        var title = el('h1', 'mui-phone-video-title');
        var facts = el('p', 'mui-phone-video-facts secondaryText');
        var genres = el('p', 'mui-phone-video-genres secondaryText');
        var play = button(L('播放', 'Play'), 'play_arrow', 'mui-phone-video-play');
        play.appendChild(el('span', '', L('播放', 'Play')));
        var actions = el('div', 'mui-phone-video-actions');
        var watched = button(L('已播放', 'Watched'), 'check_circle_outline');
        var favorite = button(L('收藏', 'Favorite'), 'favorite_border');
        actions.append(watched, favorite);
        var specs = [
            ['.selectSource', 'movie', L('版本', 'Version')],
            ['.selectAudio', 'headphones', L('音频', 'Audio')],
            ['.selectSubtitles', 'subtitles', L('字幕', 'Subtitles')]
        ];
        var safariPicker = /Version\/[\d.]+.*Safari\//i.test(navigator.userAgent) &&
            !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPiOS|YaBrowser|DuckDuckGo|GSA\//i.test(navigator.userAgent);
        var pickerButtons = [];
        var menu = null, menuAnchor = null, reader = null;
        var selects = specs.map(function (spec, index) {
            var control = el('label', 'mui-phone-video-control');
            if (safariPicker) control.appendChild(icon(spec[1]));
            else {
                control = button(spec[2], spec[1]);
                control.setAttribute('aria-haspopup', 'listbox');
                control.onclick = function () { openPicker(index, control); };
                pickerButtons[index] = control;
            }
            var select = el('select');
            select.setAttribute('aria-label', spec[2]);
            select.title = spec[2];
            select.addEventListener('pointerdown', function () { select.classList.add('mui-pointer-focus'); });
            select.addEventListener('blur', function () { select.classList.remove('mui-pointer-focus'); });
            if (safariPicker) control.appendChild(select);
            else select.hidden = true;
            actions.appendChild(control);
            return select;
        });
        var overview = el('button', 'mui-phone-video-overview');
        var overviewText = el('span', 'mui-phone-video-overview-text');
        overview.appendChild(overviewText);
        overview.type = 'button';
        overview.setAttribute('aria-haspopup', 'dialog');
        overview.onclick = openOverview;
        var status = el('div', 'mui-phone-video-status secondaryText');
        status.setAttribute('role', 'status');
        body.append(badge, title, facts, genres, play, actions, overview, status);
        panel.append(art, body);
        nativeTop.before(panel);
        view.classList.add('mui-phone-video');
        var seriesDetail = /^(Series|Season|Episode)$/.test(base.Type);
        view.classList.toggle('mui-phone-series-detail', seriesDetail);
        var seriesBackdrop = seriesDetail && backdropOf(base);
        var activeSeason = null, seasonRequest = 0, seasonMenuOpen = false, ring, ringX = 0;
        var railResize = null, railWidth = 0;
        var episodeCards = new Map(), currentCard = null, pendingId = null;
        var selected = base, selection = 0, imageRequest = 0, timer, observer, rail, sources = [];
        var baseLogo = logoOf(base);
        var currentArt = '', wantedArt = '', artFade, titleFade, destroyed = false, pending = false;
        var seriesGenres = base.Genres || [];
        if (base.SeriesId && (!seriesGenres.length || !seriesBackdrop || !baseLogo)) getItem(base.SeriesId).then(function (series) {
            if (destroyed) return;
            if (!seriesGenres.length) seriesGenres = series.Genres || [];
            seriesBackdrop = seriesBackdrop || backdropOf(series);
            baseLogo = baseLogo || logoOf(series);
            if (active()) render(selected);
        }).catch(function () {});
        var state = view.__muiPhoneVideo = { baseId: base.Id, select: selectEpisode, sync: sync, destroy: destroy,
            closeOverlays: closeOverlays, openCommands: openCommands };
        syncPhoneVideoHeader();

        function openCommands(anchor) {
            var a = api(), item = selected;
            if (!a) return;
            Promise.all([a.getCurrentUser(), Emby.importModule('./modules/itemcontextmenu.js')]).then(function (results) {
                if (!active() || selected !== item) return;
                return (results[1].default || results[1]).show({ items: [item], user: results[0],
                    positionTo: anchor, positionY: 'below', positionX: 'right', open: false, play: false,
                    playFromBeginning: true, showSeason: true, showSeries: true, share: true, edit: true, editImages: true
                });
            }).catch(function () {});
        }

        function button(label, glyph, cls) {
            var b = el('button', cls || 'mui-phone-video-control');
            b.type = 'button';
            b.setAttribute('aria-label', label);
            b.title = label;
            b.appendChild(icon(glyph));
            return b;
        }
        function closeMenu(restoreFocus) {
            if (!menu) return;
            menu.remove();
            menu = null;
            document.removeEventListener('pointerdown', dismissMenu, true);
            document.removeEventListener('keydown', dismissMenu, true);
            window.removeEventListener('scroll', dismissMenu, true);
            window.removeEventListener('resize', dismissMenu);
            menuAnchor.setAttribute('aria-expanded', 'false');
            if (restoreFocus) menuAnchor.focus({ preventScroll: true });
        }
        function dismissMenu(event) {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'pointerdown' && (menu.contains(event.target) || menuAnchor.contains(event.target))) return;
            if (event.type === 'scroll' && menu.contains(event.target)) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
            closeMenu(event.key === 'Escape');
        }
        // Anchored list of options (track versions, audio, subtitles, seasons): one menu for every picker.
        function openListMenu(anchor, label, rows, choose) {
            if (menu && menuAnchor === anchor) { closeMenu(true); return; }
            closeMenu(false);
            menuAnchor = anchor;
            menu = el('div', 'mui-phone-track-menu');
            menu.setAttribute('role', 'listbox');
            menu.setAttribute('aria-label', label);
            anchor.setAttribute('aria-expanded', 'true');
            rows.forEach(function (row) {
                var item = el('button', '', row.label);
                item.type = 'button';
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', !!row.selected);
                item.onclick = function () {
                    choose(row.value);
                    closeMenu(true);
                };
                menu.appendChild(item);
            });
            document.body.appendChild(menu);
            var rect = anchor.getBoundingClientRect();
            var viewport = window.visualViewport;
            var right = viewport ? viewport.offsetLeft + viewport.width : document.documentElement.clientWidth;
            var bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
            var left = viewport ? viewport.offsetLeft : 0;
            var top = viewport ? viewport.offsetTop : 0;
            menu.style.maxWidth = Math.max(0, right - left - 16) + 'px';
            menu.style.maxHeight = Math.max(0, bottom - top - 16) + 'px';
            menu.style.left = Math.max(left + 8, Math.min(rect.left, right - menu.offsetWidth - 8)) + 'px';
            menu.style.top = Math.max(top + 8, Math.min(rect.bottom + 4, bottom - menu.offsetHeight - 8)) + 'px';
            popAnchor = rect;
            morphPopover(menu);
            document.addEventListener('pointerdown', dismissMenu, true);
            document.addEventListener('keydown', dismissMenu, true);
            window.addEventListener('scroll', dismissMenu, true);
            window.addEventListener('resize', dismissMenu);
            if (anchor.matches(':focus-visible')) {
                (menu.querySelector('[aria-selected="true"]') || menu.firstElementChild).focus({ preventScroll: true });
            }
        }
        function openPicker(index, anchor) {
            var select = selects[index];
            if (select.disabled) return;
            openListMenu(anchor, specs[index][2], Array.prototype.map.call(select.options, function (option) {
                return { value: option.value, label: option.label, selected: option.selected };
            }), function (value) {
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        var dialogHelper;
        function closeOverlays() {
            closeMenu(false);
            if (reader && dialogHelper) dialogHelper.close(reader);
        }
        function openOverview() {
            if (overviewText.scrollHeight <= overviewText.clientHeight + 1 || reader) return;
            Emby.importModule('./modules/dialoghelper/dialoghelper.js').then(function (mod) {
                if (!active() || reader) return;
                dialogHelper = mod.default || mod;
                var content = el('div', 'mui-phone-overview-reader');
                content.setAttribute('role', 'dialog');
                content.setAttribute('aria-label', L('简介', 'Overview'));
                var close = button(L('关闭', 'Close'), 'close', 'mui-phone-reader-close');
                content.append(close, el('p', '', overviewText.textContent));
                reader = dialogHelper.createDialog({ dialog: content, autoLowResLayout: false,
                    blurBackground: true, removeOnClose: true, swipeClose: false });
                // Emby only enables dialog history on TV by default.
                if (window.navigation) reader.setAttribute('data-history', 'true');
                close.onclick = function () { dialogHelper.close(content); };
                content.addEventListener('close', function () {
                    reader = null;
                    if (active()) overview.focus({ preventScroll: true });
                }, { once: true });
                dialogHelper.open(content);
            }).catch(function () { status.textContent = L('无法打开简介。', 'Could not open overview.'); });
        }
        function active() {
            return !destroyed && view.isConnected && !view.classList.contains('hide') && isPhone();
        }
        function setArt(url) {
            if (!url || url === wantedArt) return;
            wantedArt = url;
            var token = ++imageRequest;
            if (url === currentArt) return;
            state.waitingForArt = !currentArt;
            var img = el('img');
            img.alt = '';
            img.decoding = 'async';
            img.onerror = function () {
                if (token !== imageRequest) return;
                wantedArt = currentArt;
                state.waitingForArt = false;
            };
            img.onload = async function () {
                // Keep the current blend intact if another episode is picked during the fade.
                if (artFade) await artFade.finished.catch(function () {});
                if (destroyed || token !== imageRequest) return;
                state.waitingForArt = false;
                currentArt = url;
                var old = art.lastElementChild;
                art.appendChild(img);
                panel.classList.add('mui-phone-video-hasart');
                if (old && img.animate && !reduceMotion) {
                    artFade = img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1100, easing: 'ease' });
                    await artFade.finished.catch(function () {});
                    old.remove();
                } else if (old) old.remove();
            };
            img.src = url;
        }
        function artUrlFor(item) {
            var bd = seriesBackdrop || backdropOf(item) || backdropOf(base);
            if (seriesDetail && bd) return imgUrl(bd.id, 'Backdrop', bd.tag, 960, 85, 0);
            if (item.Type === 'Episode' && item.ImageTags && item.ImageTags.Primary) {
                return imgUrl(item.Id, 'Primary', item.ImageTags.Primary, 960, 85);
            }
            return bd ? imgUrl(bd.id, 'Backdrop', bd.tag, 960, 85, 0) :
                item.ImageTags && item.ImageTags.Primary ? imgUrl(item.Id, 'Primary', item.ImageTags.Primary, 720, 85) : '';
        }
        function rotateArt() {
            clearTimeout(timer);
            if (destroyed || seriesDetail || reduceMotion) return;
            var tags = selected.BackdropImageTags;
            var id = selected.Id;
            if (!tags || !tags.length) {
                tags = selected.ParentBackdropImageTags;
                id = selected.ParentBackdropItemId;
            }
            if (!id || !tags || tags.length < 2) return;
            timer = setTimeout(function () {
                if (!view.isConnected) { destroy(); return; }
                if (active() && !document.hidden) {
                    var choices = tags.map(function (tag, i) { return imgUrl(id, 'Backdrop', tag, 960, 85, i); })
                        .filter(function (url) { return url !== currentArt; });
                    if (choices.length) setArt(choices[Math.floor(Math.random() * choices.length)]);
                }
                rotateArt();
            }, SLIDE_MS);
        }
        function markButtons() {
            var data = selected.UserData || {};
            var watchedKey = selected.Id + ':Played', favoriteKey = selected.Id + ':IsFavorite';
            var played = pendingButtons.has(watchedKey) ? pendingButtons.get(watchedKey) : !!data.Played;
            var liked = pendingButtons.has(favoriteKey) ? pendingButtons.get(favoriteKey) : !!data.IsFavorite;
            watched.setAttribute('aria-pressed', played);
            favorite.setAttribute('aria-pressed', liked);
            watched.setAttribute('aria-busy', pendingButtons.has(watchedKey));
            favorite.setAttribute('aria-busy', pendingButtons.has(favoriteKey));
            watched.firstChild.textContent = played ? 'check_circle' : 'check_circle_outline';
            favorite.firstChild.textContent = liked ? 'favorite' : 'favorite_border';
            watched.firstChild.classList.toggle('md-icon-fill', played);
            favorite.firstChild.classList.toggle('md-icon-fill', liked);
            var card = episodeCards.get(String(selected.Id));
            if (card) card.dataset.played = played;
        }
        function markEpisode(id) {
            var card = episodeCards.get(String(id));
            if (currentCard === card) return;
            if (currentCard) currentCard.removeAttribute('aria-current');
            if (card) card.setAttribute('aria-current', 'true');
            currentCard = card;
            // centerEpisode moves the outline; a selection it doesn't follow has no card to outline
            if (ring && !card) ring.hidden = true;
        }
        function setRing(x) {
            ringX = x;
            ring.style.transform = 'translate3d(' + x + 'px,0,0)';
        }
        // the strip position that centers a card (the first card keeps the leading inset), in the strip's own
        // scroll coordinates: offsetLeft and scrollLeft share them in both directions (RTL scrolls to negatives)
        function stripTarget(strip, card) {
            var range = strip.scrollWidth - strip.clientWidth;
            var rtl = getComputedStyle(strip).direction === 'rtl';
            var left = card === strip.firstElementChild ? 0 : card.offsetLeft + (card.offsetWidth - strip.clientWidth) / 2;
            return Math.max(rtl ? -range : 0, Math.min(rtl ? 0 : range, left));
        }
        function setText(node, value) {
            if (node.textContent !== value) node.textContent = value;
        }
        var pendingButtons = new Map();
        function render(item, initial) {
            // Episode text and track facts can take a different number of lines. Keep a rail
            // already being browsed in place while its header reflows, without padding out
            // missing text or moving the viewport when it is still at the top.
            var railTop = null;
            if (!initial && rail && view.closest('html.mui-docscroll') && docY() > 0) {
                var bounds = rail.getBoundingClientRect();
                if (bounds.bottom > 0 && bounds.top < window.innerHeight) railTop = bounds.top;
            }
            var logo = logoOf(item) || baseLogo;
            if (logo) {
                var url = imgUrl(logo.id, 'Logo', logo.tag, 480, 90);
                if (badge.getAttribute('src') !== url) {
                    badge.hidden = false;
                    badge.classList.add('mui-logo-loading');
                    badge.onload = function () { badge.classList.remove('mui-logo-loading'); };
                    badge.onerror = function () { badge.hidden = true; };
                    badge.src = url;
                }
            } else badge.hidden = true;
            var number = item.Type === 'Episode' && item.IndexNumber != null;
            var episodeNumber = number ? String(item.IndexNumber).padStart(2, '0') : '';
            var isSpecial = item.ParentIndexNumber === 0 || activeSeason?.IndexNumber === 0;
            var name = (isSpecial && number ? L('特别篇 · ', 'Specials · ') : number ? L('第 ' + (item.ParentIndexNumber == null ? '?' : item.ParentIndexNumber) + ' 季 · 第 ' +
                episodeNumber + ' 集 · ', 'S' + (item.ParentIndexNumber == null ? '?' : item.ParentIndexNumber) +
                ' · E' + episodeNumber + ' · ') : '') + item.Name;
            if (title.textContent !== name) {
                var animateTitle = !initial && title.textContent && !reduceMotion && title.animate;
                title.textContent = name;
                if (titleFade) titleFade.cancel();
                if (animateTitle) titleFade = title.animate([
                    { filter: 'blur(3px)', opacity: .55 }, { filter: 'blur(0)', opacity: 1 }
                ], { duration: 260, easing: EASE });
            }
            var minutes = item.RunTimeTicks && Math.round(item.RunTimeTicks / 600000000);
            var date = item.PremiereDate && new Date(item.PremiereDate);
            var source = sources.find(function (s) { return s.Id === selects[0].value; });
            var stream = source && (source.MediaStreams || []).find(function (s) { return s.Type === 'Video'; });
            setText(facts, [minutes && L(minutes + ' 分钟', minutes + ' min'),
                date && !isNaN(date) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : item.ProductionYear,
                stream && stream.DisplayTitle].filter(Boolean).join('  ·  '));
            setText(genres, (item.Genres && item.Genres.length ? item.Genres : seriesGenres).slice(0, 4).join('  ·  '));
            setText(overviewText, stripTags(base.Type === 'Series' && base.Overview || item.Overview));
            overview.hidden = !overviewText.textContent;
            setArt(artUrlFor(item));
            markButtons();
            markEpisode(pendingId || item.Id);
            // Text above the strip reflowed: keep a resting outline on its card.
            if (ring && currentCard && !ring.hidden && Math.abs(ringX - currentCard.offsetLeft) >= 1) {
                setRing(currentCard.offsetLeft);
            }
            if (railTop !== null) {
                var shift = rail.getBoundingClientRect().top - railTop;
                if (Math.abs(shift) >= 1) docScrollTo(docY() + shift);
            }
            rotateArt();
        }
        // The outline jumps straight onto the tapped card; only the strip glides to center it (the outline
        // rides along with its card). Two curves for the same move looked like the outline overshooting.
        function centerEpisode(card, immediate) {
            if (!card || !card.isConnected || !ring) return;
            var strip = card.closest('.mui-phone-episode-strip');
            if (!strip || !strip.clientWidth) return;
            ring.hidden = false;
            setRing(card.offsetLeft);
            strip.scrollTo({ left: stripTarget(strip, card), behavior: immediate || reduceMotion ? 'instant' : 'smooth' });
        }
        function options(select, values, value) {
            var key = JSON.stringify(values);
            if (select.__muiOptions !== key) {
                select.__muiOptions = key;
                select.replaceChildren.apply(select, values.map(function (v) { return new Option(v[1], v[0]); }));
            }
            if (value != null && values.some(function (v) { return String(v[0]) === String(value); })) select.value = value;
            select.disabled = values.length < 2;
            var proxy = pickerButtons[selects.indexOf(select)];
            if (proxy) proxy.disabled = select.disabled;
        }
        function sync() {
            if (selected.Id !== base.Id || destroyed) return;
            var nativeItem = view.controller && view.controller.currentItem;
            if (nativeItem && nativeItem.Id === base.Id) selected = nativeItem;
            specs.forEach(function (spec, i) {
                var native = view.querySelector(spec[0]);
                options(selects[i], native ? Array.prototype.map.call(native.options, function (o) {
                    return [o.value, o.label];
                }) : [], native && native.value);
            });
            sources = view.controller && view.controller._currentPlaybackMediaSources || [];
            var primary = view.querySelector('.btnResume:not(.hide), .btnMainPlay:not(.hide)');
            var label = primary && (primary.getAttribute('aria-label') || primary.title);
            play.lastChild.textContent = label || L('播放', 'Play');
            play.setAttribute('aria-label', play.lastChild.textContent);
            play.disabled = !primary;
            var nativeWatch = view.querySelector('.btnPlaystate:not(.hide)');
            var nativeFavorite = view.querySelector('.btnUserRating:not(.hide)');
            watched.disabled = !nativeWatch;
            favorite.disabled = !nativeFavorite;
            render(selected);
        }
        function tracks() {
            var source = sources.find(function (s) { return s.Id === selects[0].value; }) || sources[0];
            var streams = source && source.MediaStreams || [];
            var audio = streams.filter(function (s) { return s.Type === 'Audio'; });
            var subs = streams.filter(function (s) { return s.Type === 'Subtitle'; });
            function names(list) { return list.map(function (s) { return [s.Index, s.DisplayTitle || s.Title || s.Language || s.Codec || s.Index]; }); }
            options(selects[1], names(audio), source && source.DefaultAudioStreamIndex);
            options(selects[2], [[-1, L('关', 'Off')]].concat(names(subs)), source && source.DefaultSubtitleStreamIndex != null ? source.DefaultSubtitleStreamIndex : -1);
        }
        selects.forEach(function (select, i) {
            select.addEventListener('change', function () {
                if (selected.Id === base.Id) {
                    var native = view.querySelector(specs[i][0]);
                    if (native) { native.value = select.value; native.dispatchEvent(new Event('change', { bubbles: true })); }
                    sync();
                } else if (i === 0) { tracks(); render(selected); }
            });
        });
        function selectEpisode(item, card, initial) {
            if (item.Id === selected.Id && !pending) { centerEpisode(card, false); return; }
            if (item.Id === pendingId) return;
            closeOverlays();
            if (!seriesBackdrop) {
                ++imageRequest;
                wantedArt = currentArt;
                state.waitingForArt = false;
            }
            var token = ++selection;
            pendingId = item.Id;
            markEpisode(item.Id);
            centerEpisode(card, initial);
            if (item.Id === base.Id) {
                pending = false;
                pendingId = null;
                play.removeAttribute('aria-busy');
                status.textContent = '';
                selected = base;
                sync();
                return;
            }
            pending = true;
            play.setAttribute('aria-busy', 'true');
            status.textContent = '';
            return getItem(item.Id).then(function (full) {
                if (!active() || token !== selection) return;
                if (full.Type !== 'Episode') throw new Error('Not an episode');
                var seriesId = base.Type === 'Series' ? base.Id : base.SeriesId;
                if (seriesId && full.SeriesId && String(full.SeriesId) !== String(seriesId)) throw new Error('Different series');
                return Emby.importModule('./modules/common/playback/playbackmanager.js').then(function (p) {
                    return (p.default || p).getPlaybackMediaSources(full);
                }).catch(function () {
                    return full.MediaSources || [];
                }).then(function (list) {
                    if (!active() || token !== selection) return;
                    selected = full;
                    sources = list || [];
                    play.disabled = watched.disabled = favorite.disabled = false;
                    play.lastChild.textContent = L('播放', 'Play');
                    play.setAttribute('aria-label', play.lastChild.textContent);
                    options(selects[0], sources.map(function (s) {
                        var name = s.Name || s.Id;
                        var prefix = full.Name + ' - ';
                        return [s.Id, SETTINGS.shortVersionNames !== false && name.indexOf(prefix) === 0 ? name.slice(prefix.length) : name];
                    }));
                    tracks();
                    render(full, initial);
                });
            }).then(function () {
                if (token === selection) { pending = false; pendingId = null; play.removeAttribute('aria-busy'); }
            }).catch(function () {
                if (token !== selection) return;
                pending = false;
                pendingId = null;
                play.removeAttribute('aria-busy');
                markEpisode(selected.Id);
                centerEpisode(currentCard, initial);
                if (initial) return;
                status.textContent = L('部分剧集信息未能加载，可重试或打开原详情。', 'Some episode details could not load. Retry or open the original details.');
                var link = button(L('打开原详情', 'Open original details'), 'open_in_new', 'mui-phone-video-fallback');
                link.onclick = function () { showItem(item); };
                status.appendChild(link);
            });
        }
        function toggle(field) {
            if (pending) return;
            var item = selected, a = api();
            if (!a) return;
            var key = item.Id + ':' + field;
            if (pendingButtons.has(key)) return;
            var uid = a.getCurrentUserId(), data = item.UserData || (item.UserData = {});
            var before = !!data[field], on = !before;
            pendingButtons.set(key, on);
            data[field] = on;
            markButtons();
            Promise.resolve().then(function () {
                return field === 'Played' ? (on ? a.markPlayed(uid, [item.Id]) : a.markUnplayed(uid, [item.Id])) :
                    a.updateFavoriteStatus(uid, [item.Id], on);
            }).catch(function () {
                data[field] = before;
                if (selected.Id === item.Id) status.textContent = L('更新失败，请重试。', 'Could not update. Try again.');
            }).finally(function () {
                pendingButtons.delete(key);
                if (selected.Id === item.Id) {
                    selected.UserData = selected.UserData || {};
                    selected.UserData[field] = data[field];
                    markButtons();
                }
            });
        }
        watched.onclick = function () { toggle('Played'); };
        favorite.onclick = function () { toggle('IsFavorite'); };
        play.onclick = function () {
            if (pending) return;
            if (selected.Id === base.Id) {
                var native = view.querySelector('.btnResume:not(.hide), .btnMainPlay:not(.hide)');
                if (native) native.click();
                return;
            }
            var item = selected;
            var opts = { items: [item], startPositionTicks: item.UserData && item.UserData.PlaybackPositionTicks || 0,
                mediaSourceId: selects[0].value || undefined, audioStreamIndex: selects[1].value || undefined,
                subtitleStreamIndex: selects[2].value || undefined };
            Emby.importModule('./modules/common/playback/playbackactions.js').then(function (p) {
                if (active() && selected === item) return (p.default || p).play(opts);
            }).catch(function () { status.textContent = L('无法开始播放。', 'Could not start playback.'); });
        };
        function destroy() {
            closeOverlays();
            destroyed = true;
            ++selection;
            ++seasonRequest;
            if (railResize) railResize.disconnect();
            if (artFade) artFade.cancel();
            if (titleFade) titleFade.cancel();
            clearTimeout(timer);
            if (observer) observer.disconnect();
            panel.remove();
            if (rail) rail.remove();
            view.classList.remove('mui-phone-video', 'mui-phone-rail-ready', 'mui-phone-series-detail', 'mui-phone-series-rail',
                'mui-phone-rail-synopsis', 'mui-phone-rail-specials');
        }
        observer = new MutationObserver(sync);
        observer.observe(nativeTop, { childList: true, subtree: true, attributes: true,
            attributeFilter: ['class', 'aria-pressed', 'disabled'] });
        sync();
        var seasonId = base.Type === 'Season' ? base.Id : base.SeasonId;
        var seriesId = base.Type === 'Series' ? base.Id : base.SeriesId;
        var a = seriesDetail && seriesId && api();
        if (a) {
            state.waitingForRail = true;
            a.getSeasons(seriesId, { UserId: a.getCurrentUserId() }).then(function (result) {
                var seasons = (result.Items || []).filter(function (season) { return season && season.Id; });
                var target = seasons.find(function (season) { return String(season.Id) === String(seasonId); }) ||
                    seasons.find(function (season) { return Number(season.IndexNumber) > 0; }) || seasons[0];
                if (target) return openSeason(target, seasons, true);
            }).catch(function () { /* The native lists remain available if the first request fails. */ }).finally(function () {
                state.waitingForRail = false;
            });
        }

        async function openSeason(season, seasons, initial) {
            if (!active()) return;
            var request = ++seasonRequest;
            var result = await a.getEpisodes(seriesId, {
                SeasonId: season.Id, UserId: a.getCurrentUserId(), Fields: 'Overview', EnableUserData: true
            });
            if (!active() || request !== seasonRequest) return;
            var seen = new Set();
            var episodes = (result.Items || []).filter(function (item) {
                if (!item || !item.Id || item.Type && item.Type !== 'Episode' ||
                    item.SeasonId && String(item.SeasonId) !== String(season.Id) || seen.has(String(item.Id))) return false;
                seen.add(String(item.Id));
                return true;
            });
            if (!episodes.length && !rail) return;
            var previous = activeSeason;
            activeSeason = season;
            ++selection;
            pending = false;
            pendingId = null;
            play.removeAttribute('aria-busy');
            status.textContent = '';
            episodeCards.clear();
            currentCard = null;
            var nextRail = el('section', 'mui-phone-episodes');
            var heading = el('div', 'mui-phone-episode-heading');
            var label = season.Name || L('剧集', 'Episodes');
            // Season choice works like the version selector: Safari opens its own picker for a native select,
            // other browsers get the anchored menu.
            function seasonFailed() {
                if (active() && activeSeason === season) status.textContent = L('无法载入这一季，请重试', 'Could not load this season. Try again');
            }
            function pickSeason(seasonId) {
                var next = seasons.find(function (entry) { return String(entry.Id) === String(seasonId); });
                if (!next || next.Id === season.Id) return;
                openSeason(next, seasons, false).catch(seasonFailed);
            }
            var seasonLabel;
            if (seasons.length > 1 && safariPicker) {
                seasonLabel = el('label', 'mui-phone-season-label mui-phone-season-select');
                seasonLabel.append(document.createTextNode(label), icon('unfold_more'));
                var seasonSelect = el('select');
                seasonSelect.setAttribute('aria-label', L('选择季', 'Season'));
                seasons.forEach(function (entry) {
                    seasonSelect.appendChild(new Option(entry.Name, entry.Id, false, String(entry.Id) === String(season.Id)));
                });
                seasonSelect.addEventListener('pointerdown', function () { seasonSelect.classList.add('mui-pointer-focus'); });
                seasonSelect.addEventListener('blur', function () { seasonSelect.classList.remove('mui-pointer-focus'); });
                seasonSelect.addEventListener('change', function () { pickSeason(seasonSelect.value); });
                seasonLabel.appendChild(seasonSelect);
            } else if (seasons.length > 1) {
                seasonLabel = el('button', 'mui-phone-season-label', label);
                seasonLabel.type = 'button';
                seasonLabel.setAttribute('aria-haspopup', 'listbox');
                seasonLabel.setAttribute('aria-label', L('选择季', 'Season'));
                seasonLabel.appendChild(icon('unfold_more'));
                seasonLabel.onclick = function () {
                    openListMenu(seasonLabel, L('选择季', 'Season'), seasons.map(function (entry) {
                        return { value: entry.Id, label: entry.Name, selected: String(entry.Id) === String(season.Id) };
                    }), pickSeason);
                };
            } else {
                seasonLabel = el('h2', 'mui-phone-season-label', label);
            }
            var allEpisodes = el('button', 'mui-phone-episode-more', L('更多', 'More'));
            allEpisodes.type = 'button';
            allEpisodes.disabled = !episodes.length;
            heading.append(seasonLabel, allEpisodes);
            nextRail.appendChild(heading);
            var strip = el('div', 'mui-phone-episode-strip');
            strip.setAttribute('aria-label', L('剧集', 'Episodes'));
            episodes.forEach(function (item) {
                var card = el('button', 'mui-phone-episode');
                card.type = 'button';
                card.__muiItem = item;
                episodeCards.set(String(item.Id), card);
                card.dataset.played = !!(item.UserData && item.UserData.Played);
                var img = el('img');
                img.alt = '';
                img.loading = 'lazy';
                img.decoding = 'async';
                var tag = item.ImageTags && item.ImageTags.Primary;
                if (tag) img.src = imgUrl(item.Id, 'Primary', tag, 480, 80);
                card.append(img, el('strong', '', (item.IndexNumber != null ? item.IndexNumber + '. ' : '') + item.Name),
                    el('span', 'secondaryText', stripTags(item.Overview)));
                strip.appendChild(card);
            });
            ring = el('div', 'mui-phone-episode-ring');
            ring.hidden = true;
            ring.setAttribute('aria-hidden', 'true');
            strip.appendChild(ring);
            nextRail.appendChild(strip);
            // A new width (the phone turned, the 42% cards resized) moves every card: the outline follows its
            // card and the current episode is centered again.
            if (railResize) railResize.disconnect();
            railWidth = 0;
            if (window.ResizeObserver) {
                railResize = new ResizeObserver(function () {
                    var width = strip.clientWidth;
                    if (!width || width === railWidth) return;
                    var first = !railWidth;
                    railWidth = width;
                    if (!first && currentCard && currentCard.parentElement === strip && !ring.hidden) centerEpisode(currentCard, true);
                });
                railResize.observe(strip);
            }
            allEpisodes.onclick = function () {
                showRailMenu(allEpisodes, episodes, selected.Id, function (item) {
                    selectEpisode(item, episodeCards.get(String(item.Id)));
                });
            };
            if (rail) rail.replaceWith(nextRail);
            else panel.after(nextRail);
            rail = nextRail;
            // Another season slides in from its side of the season order, like a tab.
            if (previous && previous !== season && !reduceMotion && strip.animate) {
                var step = seasons.indexOf(season) > seasons.indexOf(previous) ? 1 : -1;
                if (getComputedStyle(strip).direction === 'rtl') step = -step;
                strip.animate([{ opacity: 0, transform: 'translate3d(' + step * 28 + 'px,0,0)' }, { opacity: 1, transform: 'none' }],
                    { duration: 300, easing: EASE });
            }
            view.classList.add('mui-phone-rail-ready', 'mui-phone-series-rail');
            view.classList.toggle('mui-phone-rail-specials', seasons.some(function (entry) { return entry.IndexNumber === 0; }));
            view.classList.toggle('mui-phone-rail-synopsis', !!base.Overview || episodes.some(function (item) { return !!item.Overview; }));
            var first = initial && episodes.find(function (item) { return String(item.Id) === String(base.Id); }) || episodes[0];
            if (first) {
                var card = episodeCards.get(String(first.Id));
                if (first.Id !== selected.Id) return selectEpisode(first, card, true);
                render(selected, true);
                centerEpisode(card, true);
            } else {
                selected = season;
                sources = [];
                play.disabled = watched.disabled = favorite.disabled = true;
                selects.forEach(function (select) { options(select, []); });
                render(season, true);
                status.textContent = L('这一季暂无剧集', 'No episodes in this season');
            }
        }

        function showRailMenu(anchor, items, current, choose) {
            if (!items || !items.length || seasonMenuOpen) return;
            seasonMenuOpen = true;
            Emby.importModule('./modules/actionsheet/actionsheet.js').then(function (mod) {
                if (!active()) return;
                return (mod.default || mod).show({ positionTo: anchor, positionY: 'above', hasItemSelectionState: true,
                    items: items.map(function (item) { return { id: String(item.Id), name: item.Name, selected: String(item.Id) === String(current) }; })
                }).then(function (id) {
                    var item = items.find(function (entry) { return String(entry.Id) === String(id); });
                    if (item && active() && anchor.isConnected) choose(item);
                });
            }).catch(function () {}).finally(function () { seasonMenuOpen = false; });
        }
    }

    function syncPhoneVideoHeader() {
        document.querySelectorAll('.skinHeader:not(.videoOsdHeader) .headerSearchButton').forEach(function (search) {
            if (search.parentElement.querySelector('.mui-phone-header-more')) return;
            var button = el('button', 'headerButton mui-phone-header-more');
            button.type = 'button';
            button.setAttribute('aria-label', L('更多', 'More'));
            button.setAttribute('aria-haspopup', 'dialog');
            button.appendChild(icon('more_horiz'));
            button.onclick = function () {
                var view = document.querySelector('.itemView.mui-phone-video:not(.hide)');
                if (view && view.__muiPhoneVideo) view.__muiPhoneVideo.openCommands(button);
            };
            search.after(button);
        });
    }

    // ---------- artist pages: photo (or latest cover) as a rounded square, blurred art behind, about section ----------

    var artistAsked = {};
    function artistPage(view, item, token) {
        var a = api(), uid = a.getCurrentUserId();
        var albums = a.getItems(uid, {
            AlbumArtistIds: item.Id, IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'ProductionYear,SortName',
            SortOrder: 'Descending', Limit: 8, EnableImageTypes: 'Primary', ImageTypeLimit: 1
        }).then(null, function () { return { Items: [], TotalRecordCount: 0 }; });
        albums.then(function (res) {
            if (token !== itemToken) return;
            var pic = artistPicture(item, res.Items || []);
            setPageBg(pic ? imgUrl(pic.id, 'Primary', pic.tag, 240, 60) : null, 'item');
            waitFor(function () {
                var v = view && view.classList.contains('itemView') && !view.classList.contains('hide') ? view : document.querySelector('.itemView:not(.hide)');
                return v && v.querySelector('.detailMainContainer .itemName-primary') ? v : null;
            }, function (v) {
                if (token !== itemToken) return;
                decorateArtistView(v, item, res, pic);
                [800, 2000].forEach(function (ms) {
                    setTimeout(function () { if (token === itemToken && v.isConnected) decorateArtistView(v, item, res, pic); }, ms);
                });
                askForArtist(v, item, token);
            });
        });
    }
    // the artist's photo, else the newest album's cover (or its tracks' art)
    function artistPicture(item, albums) {
        if (item.ImageTags && item.ImageTags.Primary) return { id: item.Id, tag: item.ImageTags.Primary, own: true };
        var pic = null;
        albums.some(function (al) {
            if (al.ImageTags && al.ImageTags.Primary) pic = { id: al.Id, tag: al.ImageTags.Primary };
            else if (al.PrimaryImageItemId && al.PrimaryImageTag) pic = { id: al.PrimaryImageItemId, tag: al.PrimaryImageTag };
            return !!pic;
        });
        return pic;
    }
    function decorateArtistView(v, item, res, pic) {
        v.classList.add('mui-artistpage');
        var box = v.querySelector('.detailImageContainer .cardImageContainer');
        if (box && pic && !box.__muiArt) {
            if (!pic.own) {
                // no photo: the newest cover, blurred, with the initial (a sharp cover would read as an album)
                box.__muiArt = true;
                box.classList.add('mui-hasart');
                box.style.setProperty('--mui-face-art', 'url("' + imgUrl(pic.id, 'Primary', pic.tag, 300, 60) + '")');
                box.appendChild(el('span', 'mui-page-initial', Array.from(String(item.Name || '').trim())[0] || '?'));
            } else if (box.querySelector('.cardImageIcon')) {
                // a photo that has only just arrived isn't on Emby's placeholder yet
                box.__muiArt = true;
                box.querySelector('.cardImageIcon').remove();
                box.style.backgroundImage = 'url("' + imgUrl(pic.id, 'Primary', pic.tag, 600, 85) + '")';
                box.style.backgroundSize = 'cover';
            }
        }
        var bio = stripTags(item.Overview);
        // under the albums (Emby shows its sections a moment after the page)
        var after = v.querySelector('.artistAlbumsSection:not(.hide)') || v.querySelector('.artistSongsSection:not(.hide)') || v.querySelector('.detailMainContainer');
        var old = v.querySelector('.mui-about');
        if (old && old.__id === item.Id + '|' + bio.length) {
            if (old.previousElementSibling !== after) after.parentNode.insertBefore(old, after.nextSibling);
            return;
        }
        if (old) old.remove();
        if (!bio) return;
        var sec = el('div', 'verticalSection mui-about padded-left padded-left-page padded-right');
        sec.__id = item.Id + '|' + bio.length;
        sec.appendChild(el('h2', 'sectionTitle sectionTitle-cards', L('关于', 'About')));
        var card = el('div', 'mui-about-card' + (bio.length > 420 ? ' is-long' : ''));
        if (pic) card.style.setProperty('--mui-panel-art', 'url("' + imgUrl(pic.id, 'Primary', pic.tag, 240, 60) + '")');
        var text = el('div', 'mui-about-text');
        bio.split(/\n+/).forEach(function (para) { if (para.trim()) text.appendChild(el('p', '', para.trim())); });
        card.appendChild(text);
        var facts = el('div', 'mui-about-facts');
        var bits = [];
        if (res.TotalRecordCount) bits.push(albumCount(res.TotalRecordCount));
        (item.Genres || []).slice(0, 3).forEach(function (g) { bits.push(g); });
        bits.forEach(function (b) { facts.appendChild(el('span', '', b)); });
        var ne = item.ProviderIds && (item.ProviderIds.NetEaseArtist || item.ProviderIds.neteaseartist);
        if (ne) {
            var link = el('a', 'mui-about-src', L('网易云音乐', 'NetEase Cloud Music'));
            link.href = 'https://music.163.com/#/artist?id=' + encodeURIComponent(ne);
            link.target = '_blank';
            link.rel = 'noopener';
            facts.appendChild(link);
        }
        if (facts.children.length) card.appendChild(facts);
        sec.appendChild(card);
        after.parentNode.insertBefore(sec, after.nextSibling);
    }
    // An artist NetEase hasn't filled in yet (a library refresh hit NetEase's limit): an administrator opening
    // the page asks Emby to look them up now, and the page takes the answer in when it arrives.
    function askForArtist(v, item, token) {
        if (stripTags(item.Overview) || artistAsked[item.Id]) return;
        artistAsked[item.Id] = true;
        var a = api();
        a.getCurrentUser().then(function (u) {
            if (!u || !u.Policy || !u.Policy.IsAdministrator || token !== itemToken) return;
            return a.ajax({
                type: 'POST',
                url: a.getUrl('Items/' + item.Id + '/Refresh', {
                    MetadataRefreshMode: 'FullRefresh', ImageRefreshMode: 'FullRefresh', ReplaceAllMetadata: false, ReplaceAllImages: false
                })
            }).then(function () {
                var tries = 0;
                (function poll() {
                    if (token !== itemToken || ++tries > 12) return;
                    setTimeout(function () {
                        if (token !== itemToken) return;
                        a.getItem(a.getCurrentUserId(), item.Id).then(function (fresh) {
                            var got = stripTags(fresh.Overview) || (fresh.ImageTags && fresh.ImageTags.Primary && !(item.ImageTags && item.ImageTags.Primary));
                            if (!got) { poll(); return; }
                            delete itemCache[item.Id];
                            if (token === itemToken && v.isConnected) artistPage(v, fresh, token);
                        }, poll);
                    }, 5000);
                })();
            });
        }).then(null, function () { });
    }

    // the same picture, whatever size it was asked for in (pages ask for their width, which can differ)
    function artKey(src) {
        var m = /Items\/([^/]+)\/Images\/Backdrop(?:\/\d+)?\?(?:.*&)?tag=([^&]+)/.exec(src || '');
        return m ? m[1] + '|' + m[2] : src;
    }
    function decorateItemView(view, item, bd, logo) {
        var src = bd ? imgUrl(bd.id, 'Backdrop', bd.tag, heroWidth(view), 82, 0) : null;
        var heroes = Array.prototype.filter.call(view.querySelectorAll(':scope > .mui-hero'), function (h) { return !h.classList.contains('mui-hero-leaving'); });
        var own = heroes.filter(function (h) { return h.dataset.id === item.Id; })[0] || null;
        if (!own) {
            var carried = heroes.filter(function (h) { return h.dataset.carried; })[0] || null;
            // backdrops of an earlier page shown in this view
            heroes.forEach(function (h) { if (h !== carried) h.remove(); });
            if (carried) {
                delete carried.dataset.carried;
                // the last page's backdrop is this page's too: it simply stays (a sharper copy swaps in quietly)
                if (src && artKey(carried.firstChild.getAttribute('src')) === artKey(src)) {
                    carried.dataset.id = item.Id;
                    own = carried;
                    if (carried.firstChild.getAttribute('src') !== src) {
                        var sharp = new Image();
                        sharp.onload = function () { carried.firstChild.src = src; };
                        sharp.src = src;
                    }
                }
            }
            if (!own && src) {
                own = el('div', 'mui-hero');
                own.dataset.id = item.Id;
                var img = el('img');
                img.alt = '';
                img.decoding = 'async';
                img.onload = img.onerror = function () {
                    img.classList.add('mui-ld');
                    // a different backdrop came with this page: it fades in over the last one, which then goes
                    if (carried) leaveHero(carried, 900);
                };
                img.src = src;
                own.appendChild(img);
                view.insertBefore(own, carried ? carried.nextSibling : view.firstChild);
            } else if (!own && carried) leaveHero(carried);
            if (own) {
                view.classList.add('mui-hashero');
                bindParallax(view, own);
            }
        }
        var name = view.querySelector('.itemPrimaryNameContainer');
        if (logo && name && !view.querySelector('.mui-detail-logo')) {
            var lg = el('img', 'mui-detail-logo');
            lg.alt = item.Name;
            lg.decoding = 'async';
            lg.onerror = function () { lg.remove(); view.classList.remove('mui-haslogo'); root.classList.remove('mui-haslogo-page'); };
            lg.src = imgUrl(logo.id, 'Logo', logo.tag, 700, 90);
            name.parentNode.insertBefore(lg, name);
            view.classList.add('mui-haslogo');
        }
    }

    function bindParallax(view, hero) {
        if (view.__muiParallax) { view.__muiParallax.hero = hero; return; }
        var state = view.__muiParallax = { hero: hero, frame: 0 };
        function apply() {
            state.frame = 0;
            var st = docScroll ? docY() : view.scrollTop, h = state.hero.offsetHeight || 1;
            if (st > h * 1.2) { state.hero.style.opacity = '0'; return; }
            state.hero.style.transform = reduceMotion ? '' : 'translate3d(0,' + (st * 0.38).toFixed(1) + 'px,0)';
            state.hero.style.opacity = Math.max(0, 1 - st / (h * 0.9)).toFixed(3);
        }
        view.addEventListener('scroll', function () {
            if ((!isPhone() || !view.__muiPhoneVideo) && !state.frame) state.frame = requestAnimationFrame(apply);
        }, { passive: true });
        apply();
    }

    // ---------- library tabs: only the ones in use, plus our own (series, artist feed, Genshin OST) ----------

    // Emby builds a library's tabs from the view's getTabs(); each has an id and an "enabled" flag (Emby itself
    // hides tabs that have no content that way). The page template has one tab slot per position, so tabs are
    // switched off in place rather than removed, and our own tabs take over the slot of a tab that goes away.
    // Folder tabs (settings.folderTabs, JSON): music libraries whose tabs are their folders, e.g.
    //   [{ "library": "Genshin OST", "allTab": "全部", "hide": "精选原声带", "stripPrefix": "原神 - ",
    //      "shelves": [{ "folder": "场景OST", "tab": "地区OST" }, { "folder": "EP", "tab": "EP" }] }]
    // library: the library's name, or /a regular expression/; allTab: an extra first tab with every shelf; hide:
    // a regular expression for albums to leave out; stripPrefix: what every album title starts with, left off.
    var FOLDER_TABS = parseFolderTabs(SETTINGS.folderTabs);
    function parseFolderTabs(text) {
        if (!text) return [];
        var list;
        try { list = JSON.parse(text); } catch (e) { console.warn('[BetterTheEmby] folder tabs: not valid JSON', e); return []; }
        if (!Array.isArray(list)) return [];
        function regex(value, flags) {
            try { return value ? new RegExp(value, flags) : null; } catch (e) { console.warn('[BetterTheEmby] folder tabs: bad pattern', value); return null; }
        }
        return list.map(function (c, n) {
            if (!c || !c.library || !Array.isArray(c.shelves)) return null;
            var lib = String(c.library), m = /^\/(.*)\/([a-z]*)$/.exec(lib);
            var conf = { match: m ? regex(m[1], m[2]) : null, name: lib, hide: regex(c.hide), strip: String(c.stripPrefix || ''), tabs: [], shelves: [] };
            if (c.allTab) conf.tabs.push({ id: 'mui-ft' + n + '-all', name: String(c.allTab), all: true });
            c.shelves.forEach(function (sh, i) {
                if (!sh || !sh.folder) return;
                var id = 'mui-ft' + n + '-' + i, name = String(sh.tab || sh.folder);
                conf.shelves.push({ folder: String(sh.folder), tab: id, title: name });
                conf.tabs.push({ id: id, name: name });
            });
            return conf.tabs.length ? conf : null;
        }).filter(Boolean);
    }
    function folderTabsFor(item) {
        return FOLDER_TABS.filter(function (c) { return c.match ? c.match.test(item.Name || '') : c.name === item.Name; })[0] || null;
    }
    function tabPlan(item) {
        if (!item) return null;
        var type = item.CollectionType, simplify = SETTINGS.simplifyTabs !== false, custom = [];
        if (type === 'tvshows' || type === 'movies') {
            // the shows / movies grid, suggestions, favorites; then the series of this library
            if (SETTINGS.seriesTab !== false) custom.push({ id: 'mui-series', name: L('系列', 'Series'), slot: 'folders' });
            return simplify || custom.length ? { keep: simplify ? ['series', 'videos', 'suggestions', 'favorites'] : null, custom: custom } : null;
        }
        if (type === 'music') {
            var folders = folderTabsFor(item);
            if (folders) return { keep: [], custom: folders.tabs.map(function (t, i) { return { id: t.id, name: t.name, slot: i }; }) };
            // Emby's album grid, and the album artists as our feed
            if (SETTINGS.artistFeed !== false) custom.push({ id: 'mui-artists', name: L('艺人', 'Artists'), slot: 'albumartists' });
            return simplify || custom.length ? { keep: simplify ? ['albums'] : null, custom: custom } : null;
        }
        return null;
    }
    function applyTabPlan(tabs, plan) {
        plan.custom.forEach(function (c) {
            var at = typeof c.slot === 'number' ? c.slot : tabs.map(function (t) { return t.id; }).indexOf(c.slot);
            if (at >= 0 && at < tabs.length) tabs[at] = { id: c.id, name: c.name, mui: true };
        });
        if (plan.keep) tabs.forEach(function (t) { if (!t.mui && plan.keep.indexOf(t.id) < 0) t.enabled = false; });
        return tabs;
    }
    var TAB_CONTROLLERS = {};
    function patchLibraryTabs() {
        if (!window.Emby || typeof Emby.importModule !== 'function') return;
        ['./tv/tv.js', './videos/videos.js', './music/music.js'].forEach(function (path) {
            Emby.importModule(path).then(function (m) {
                var proto = (m && m.default || m).prototype;
                if (!proto || proto.__muiTabs) return;
                proto.__muiTabs = true;
                var getTabs = proto.getTabs, loadTabController = proto.loadTabController;
                proto.getTabs = function () {
                    var tabs = getTabs.apply(this, arguments), plan = tabPlan(this.item);
                    return plan ? applyTabPlan(tabs, plan) : tabs;
                };
                proto.loadTabController = function (id) {
                    var C = TAB_CONTROLLERS[id];
                    return C ? Promise.resolve({ default: C }) : loadTabController.apply(this, arguments);
                };
            }, function (e) { console.warn('[ModernUI] tabs', path, e); });
        });
        if (SETTINGS.smartSearch !== false) patchSearch();
        if (SETTINGS.pinyinIndex !== false) patchAlphaPicker();
    }

    // ---------- pinyin: for searching and the A-Z index ----------

    // pinyin.js (the most common reading of every CJK character) comes in only when it is first needed
    var OWN_VERSION = (document.currentScript && /\?v=[^&]+/.exec(document.currentScript.src) || [''])[0];
    var pinyinMap = null, pinyinLoad = null;
    function loadPinyin() {
        if (pinyinLoad) return pinyinLoad;
        pinyinLoad = new Promise(function (resolve) {
            function build() {
                var map = {};
                String(window.MuiPinyinData || '').split(',').forEach(function (g) {
                    var i = g.indexOf(':'), py = g.slice(0, i), chars = g.slice(i + 1);
                    for (var k = 0; k < chars.length; k++) map[chars[k]] = py;
                });
                pinyinMap = map;
                resolve(map);
            }
            if (window.MuiPinyinData) { build(); return; }
            var sc = document.createElement('script');
            sc.src = 'pinyin.js' + OWN_VERSION;
            sc.async = true;
            sc.onload = build;
            sc.onerror = function () { pinyinLoad = null; resolve(null); };
            document.head.appendChild(sc);
        });
        return pinyinLoad;
    }
    // n and l count as the same sound (the way many speakers say them), on both sides of a comparison
    function nlSame(s) { return s.replace(/n/g, 'l'); }
    // a name in the forms it can be searched by: as written, its pinyin, and the pinyin's initials
    function nameKeys(name) {
        var n = searchKey(name), full = '', ini = '';
        for (var i = 0; i < n.length; i++) {
            var c = n[i], py = pinyinMap && pinyinMap[c];
            full += py || c;
            ini += py ? py[0] : c;
        }
        return { n: n, full: nlSame(full), ini: nlSame(ini) };
    }
    // the letter a name starts under in the A-Z index ('#' for digits and signs)
    var PINYIN_EDGES = '吖八嚓咑妸发旮铪丌咔垃妈拏噢妑七呥仨他屲夕丫帀', PINYIN_LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ';
    var zhCollator = window.Intl && Intl.Collator ? new Intl.Collator('zh-Hans-CN') : null;
    function letterOf(ch) {
        ch = String(ch || '').charAt(0);
        if (/[a-z]/i.test(ch)) return ch.toUpperCase();
        if (!/[一-鿿㐀-䶿]/.test(ch)) return '#';
        var py = pinyinMap && pinyinMap[ch];
        if (py) return py[0].toUpperCase();
        if (zhCollator) for (var i = PINYIN_EDGES.length - 1; i >= 0; i--) if (zhCollator.compare(ch, PINYIN_EDGES[i]) >= 0) return PINYIN_LETTERS[i];
        return ch;
    }

    // ---------- the A-Z index beside a library grid: pinyin initials instead of characters ----------

    // Emby lists the first character of each group of titles (阿, 爱, 宝 …), and only the first 27 of them. A
    // button jumps to the titles from its character on (the server counts those), so one character per letter
    // does: the first of each pinyin initial, labelled with the letter. The current title lights up its letter.
    function patchAlphaPicker() {
        Emby.importModule('./modules/alphapicker/alphapicker.js').then(function (m) {
            var proto = (m && m.default || m).prototype;
            if (!proto || proto.__muiLetters) return;
            proto.__muiLetters = true;
            var setPrefixes = proto.setPrefixes, setCurrentFromItem = proto.setCurrentFromItem;
            proto.setPrefixes = function (prefixes) {
                var self = this, all = (prefixes || []).slice();
                var picker = self.options.element;
                if (!picker.__muiScrub) {
                    picker.__muiScrub = true;
                    var pointer, preview, readout, touchCommitUntil = 0;
                    function pointAt(event) {
                        var button = Array.from(picker.querySelectorAll('.alphaPickerButton-vertical')).find(function (node) {
                            var bounds = node.getBoundingClientRect();
                            var middle = (bounds.top + bounds.bottom) / 2;
                            return bounds.height && Math.abs(event.clientY - middle) < node.offsetHeight / 2;
                        });
                        if (!button || button === preview) return;
                        if (preview) preview.classList.remove('mui-alpha-preview');
                        preview = button;
                        preview.classList.add('mui-alpha-preview');
                        if (!readout) {
                            readout = el('div', 'mui-alpha-readout');
                            readout.setAttribute('aria-hidden', 'true');
                            document.body.appendChild(readout);
                        }
                        readout.textContent = preview.textContent;
                    }
                    picker.addEventListener('pointerdown', function (event) {
                        touchCommitUntil = 0;
                        var button = event.target.closest('.alphaPickerButton-vertical');
                        if (!isPhone() || event.pointerType === 'mouse' || !button || pointer != null) return;
                        pointer = event.pointerId;
                        picker.setPointerCapture(pointer);
                        pointAt(event);
                    });
                    picker.addEventListener('pointermove', function (event) {
                        if (pointer === event.pointerId) pointAt(event);
                    });
                    function finish(event) {
                        if (pointer !== event.pointerId) return;
                        pointer = null;
                        if (readout) { readout.remove(); readout = null; }
                        if (preview) {
                            preview.classList.remove('mui-alpha-preview');
                            if (event.type === 'pointerup') {
                                touchCommitUntil = Date.now() + 400;
                                preview.click();
                            }
                        }
                        preview = null;
                    }
                    picker.addEventListener('pointerup', finish);
                    picker.addEventListener('lostpointercapture', finish);
                    picker.addEventListener('pointercancel', finish);
                    picker.addEventListener('click', function (event) {
                        // WebKit can send a trusted click after the touch has already committed a letter.
                        if (Date.now() >= touchCommitUntil || !event.isTrusted || !event.detail) return;
                        touchCommitUntil = 0;
                        event.preventDefault();
                        event.stopImmediatePropagation();
                    }, true);
                }
                function apply() {
                    var heads = {}, values = [];
                    all.forEach(function (ch) {
                        var L = letterOf(ch);
                        if (!heads[L]) { heads[L] = ch; values.push(ch); }
                    });
                    self.__muiHeads = heads;
                    // A to Z (titles in Latin letters can sort after the Chinese ones)
                    values.sort(function (x, y) {
                        var lx = letterOf(x), ly = letterOf(y);
                        return lx === ly ? 0 : lx === '#' ? -1 : ly === '#' ? 1 : lx < ly ? -1 : 1;
                    });
                    setPrefixes.call(self, values);
                    self.options.element.querySelectorAll('.alphaPickerButton[data-value]').forEach(function (b) {
                        b.textContent = letterOf(b.getAttribute('data-value'));
                    });
                }
                apply();
                // the exact letters once the pinyin table is in (until then the collator's guess)
                if (!pinyinMap) loadPinyin().then(function () { if (self.options && self.options.element.isConnected) apply(); });
            };
            proto.setCurrentFromItem = function (item) {
                var ch = item && (item.Prefix || String(item.SortName || item.Name || '').charAt(0));
                var head = ch && this.__muiHeads && this.__muiHeads[letterOf(ch)];
                return setCurrentFromItem.call(this, head ? { Prefix: head } : item);
            };
        }, function (e) { console.warn('[ModernUI] alphapicker', e); });
    }

    // ---------- search: titles, by name or pinyin, not everything that mentions them ----------

    // Emby's search finds an episode or a song by its show's, album's or artist's name too, so a show's name
    // brings up all its episodes; and it knows no pinyin. Here shows, films, albums and album artists are matched
    // in the browser against cached lists, by name, original title, pinyin or pinyin initials (gdyg, guduyaogun,
    // with n and l alike); episodes and songs come from the server and stay only when their own name matches. The
    // search page lists them by kind, one heading under another, and the first match's art lights the page. The
    // drawer's search box suggests the same and, on Enter, opens that page (Emby would open its own list).
    var SEARCH_KINDS = [
        { type: 'Series', name: L('节目', 'Shows'), list: { shape: 'auto', fields: ['Name', 'ProductionYear'], focusTransformTitleAdjust: true, reportSearched: true } },
        { type: 'Movie', name: L('电影', 'Movies'), list: { shape: 'auto', fields: ['Name', 'ProductionYear'], focusTransformTitleAdjust: true, reportSearched: true } },
        { type: 'MusicAlbum', name: L('专辑', 'Albums'), list: { shape: 'auto', fields: ['Name', 'ParentName'], focusTransformTitleAdjust: true, reportSearched: true } },
        { type: 'MusicArtist', name: L('专辑艺人', 'Album artists'), list: { shape: 'auto', fields: ['Name'], focusTransformTitleAdjust: true, reportSearched: true } },
        { type: 'Episode', name: L('集', 'Episodes'), own: true, list: { shape: 'auto', fields: ['ParentName', 'Name'], focusTransformTitleAdjust: true, reportSearched: true } },
        { type: 'Audio', name: L('歌曲', 'Songs'), own: true, list: { shape: 'auto', preferArtistTitle: true, fields: ['ParentName', 'Name'], action: 'play', sideFooter: true, focusTransformTitleAdjust: true, reportSearched: true } }
    ];
    var SEARCH_LIMIT = 24;
    function searchKey(s) { return String(s || '').toLowerCase().replace(/[\s·・\-_.,，、:：!！?？'"“”‘’()（）\[\]【】~～]/g, ''); }
    function hasCjk(s) { return /[一-鿿㐀-䶿぀-ヿ가-힯]/.test(s); }
    // how well a name (its keys) answers a search; 0: not at all
    function nameScore(k, q) {
        if (!k || !q.n) return 0;
        var i = k.n.indexOf(q.n);
        if (i === 0) return k.n.length === q.n.length ? 100 : 90;
        if (i > 0) return 80;
        if (!q.latin) return 0;
        if (k.ini.indexOf(q.l) === 0) return 70;
        if (k.full.indexOf(q.l) === 0) return 66;
        if (k.ini.indexOf(q.l) > 0) return 56;
        if (k.full.indexOf(q.l) > 0) return 50;
        return 0;
    }
    function searchEntry(it) {
        // AlbumArtists identifies the album credit; track performers must not expand album-name matches.
        var artists = it.Type === 'MusicAlbum' ? (it.AlbumArtists || []).map(function (a) { return a.Name; }).filter(Boolean) : [];
        if (it.Type === 'MusicAlbum' && !artists.length && it.AlbumArtist) artists.push(it.AlbumArtist);
        return { it: it, k: nameKeys(it.Name), k2: it.OriginalTitle && it.OriginalTitle !== it.Name ? nameKeys(it.OriginalTitle) : null,
            artists: artists.map(nameKeys) };
    }
    // The title and album-artist catalogues are cached independently per library, and failed lookups can retry.
    var titleLists = {}, albumArtistLists = {};
    function titleList(a, parentId) {
        var key = parentId || '', hit = titleLists[key];
        if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.p;
        var query = {
            IncludeItemTypes: 'Series,Movie,MusicAlbum', Recursive: true, Fields: 'PrimaryImageAspectRatio,ProductionYear,Status,EndDate,OriginalTitle',
            EnableImageTypes: 'Primary,Backdrop,Thumb', ImageTypeLimit: 1, EnableTotalRecordCount: false
        };
        if (parentId) query.ParentId = parentId;
        var p = Promise.all([a.getItems(a.getCurrentUserId(), query), SETTINGS.pinyinSearch !== false ? loadPinyin() : null]).then(function (r) {
            return (r[0].Items || []).map(searchEntry);
        });
        titleLists[key] = { p: p, at: Date.now() };
        p.catch(function () { delete titleLists[key]; });
        return p;
    }
    function albumArtistList(a, parentId) {
        var key = parentId || '', hit = albumArtistLists[key];
        if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.p;
        // MusicArtist items are not reliably included by the general item query. Use Emby's album-artist
        // endpoint so results include only artists credited on albums in this user's selected library.
        var query = { UserId: a.getCurrentUserId(), Recursive: true, Fields: 'PrimaryImageAspectRatio,OriginalTitle',
            EnableImageTypes: 'Primary,Backdrop,Thumb', ImageTypeLimit: 1, EnableTotalRecordCount: false };
        if (parentId) query.ParentId = parentId;
        var p = Promise.all([a.getJSON(a.getUrl('Artists/AlbumArtists', query)), SETTINGS.pinyinSearch !== false ? loadPinyin() : null]).then(function (r) {
            return (r[0].Items || []).map(searchEntry);
        });
        albumArtistLists[key] = { p: p, at: Date.now() };
        p.catch(function () { if (albumArtistLists[key] && albumArtistLists[key].p === p) delete albumArtistLists[key]; });
        return p;
    }
    // episodes or songs whose own name has the search in it
    function ownNameMatches(a, type, term, parentId, signal) {
        var q = searchKey(term);
        var query = { IncludeItemTypes: type, Recursive: true, SearchTerm: term, Limit: 80, Fields: 'PrimaryImageAspectRatio,ProductionYear', ImageTypeLimit: 1, EnableTotalRecordCount: false };
        if (parentId) query.ParentId = parentId;
        return a.getItems(a.getCurrentUserId(), query, signal).then(function (res) {
            return (res.Items || []).filter(function (it) { return searchKey(it.Name).indexOf(q) >= 0; }).slice(0, SEARCH_LIMIT);
        }, function () { return []; });
    }
    // everything a search finds, by kind
    function runSearch(a, term, parentId, signal) {
        var n = searchKey(term), latin = SETTINGS.pinyinSearch !== false && /^[a-z0-9]+$/.test(n);
        var q = { n: n, l: nlSame(n), latin: latin };
        var own = n && (hasCjk(n) || n.length >= 2);
        return Promise.all([
            titleList(a, parentId),
            albumArtistList(a, parentId).catch(function () { return []; }),
            own ? ownNameMatches(a, 'Episode', term, parentId, signal) : [],
            own ? ownNameMatches(a, 'Audio', term, parentId, signal) : []
        ]).then(function (r) {
            var hits = [];
            r[0].concat(r[1]).forEach(function (e) {
                var score = Math.max(nameScore(e.k, q), nameScore(e.k2, q) - 4);
                e.artists.forEach(function (k) { score = Math.max(score, nameScore(k, q) - 15); });
                if (score) hits.push({ it: e.it, score: score });
            });
            hits.sort(function (x, y) { return y.score - x.score || String(x.it.SortName || x.it.Name).localeCompare(String(y.it.SortName || y.it.Name), 'zh-Hans-CN'); });
            var found = { Series: [], Movie: [], MusicAlbum: [], MusicArtist: [], Episode: r[2], Audio: r[3] };
            hits.forEach(function (h) { var list = found[h.it.Type]; if (list && list.length < SEARCH_LIMIT) list.push(h.it); });
            return found;
        });
    }
    function abortError() {
        try { return new DOMException('Aborted', 'AbortError'); } catch (e) { var err = new Error('Aborted'); err.name = 'AbortError'; return err; }
    }
    function patchSearch() {
        Emby.importModule('./search/search.js').then(function (m) {
            var proto = (m && m.default || m).prototype;
            if (!proto || proto.__muiSearch) return;
            proto.__muiSearch = true;
            var fetchSections = proto.fetchSections;
            proto.fetchSections = function (options) {
                var self = this, term = ((options && options.searchValue) || '').trim(), signal = options && options.signal;
                // nothing typed: Emby's own page (recent searches), without the last search's art
                if (!term) {
                    if (this.view) this.view.__muiArt = null;
                    setPageBg(null);
                    return fetchSections.apply(this, arguments);
                }
                if (this.view) this.view.classList.add('mui-searchpage');
                var n = searchKey(term);
                if (!hasCjk(n) && n.length < 2) {
                    return Promise.resolve([{ Id: 'error', ScrollDirection: 'Vertical', ViewType: 'text', SectionType: 'text', TextInfo: { Text: L('请至少输入两个字母或一个汉字', 'Type at least two letters') } }]);
                }
                var a = this.getApiClient ? this.getApiClient() : api();
                return runSearch(a, term, this.params && this.params.parentId, signal).then(function (found) {
                    if (signal && signal.aborted) throw abortError();
                    var sections = SEARCH_KINDS.filter(function (kind) { return found[kind.type].length; }).map(function (kind) {
                        return { Id: kind.type, Name: kind.name, Monitor: [], ListOptions: Object.assign({}, kind.list), Items: found[kind.type] };
                    });
                    if (!sections.length) sections.push({ Id: 'error', ScrollDirection: 'Vertical', ViewType: 'text', SectionType: 'text', TextInfo: { Text: L('没有找到匹配的内容', 'Nothing matches') } });
                    searchArt(self, sections[0].Items || []);
                    return sections;
                });
            };
        }, function (e) { console.warn('[ModernUI] search', e); });
        hookDrawerSearch();
    }
    function searchArt(view, items) {
        var url = null;
        items.some(function (it) { url = artUrl(it); return !!url; });
        var v = view && view.view;
        if (v) v.__muiArt = url;
        if (url && (!v || !v.classList.contains('hide'))) setPageBg(url, 'lib');
    }
    function hookDrawerSearch() {
        if (hookDrawerSearch.done) return;
        hookDrawerSearch.done = true;
        function isBox(t) { return t && t.classList && t.classList.contains('txtNavDrawerSearch'); }
        // its suggestions: the same search, best matches first
        document.addEventListener('focusin', function (e) {
            var t = e.target;
            if (isBox(t) || (t && t.classList && t.classList.contains('searchfields-txtSearch'))) {
                // the list of titles is ready by the time the first letters are typed
                var a = api();
                if (a) { titleList(a, null); albumArtistList(a, null).catch(function () { }); }
            }
            if (!isBox(t) || typeof t.getItems !== 'function' || t.__muiItems) return;
            t.__muiItems = true;
            t.getItems = function () {
                var term = (this.value || '').trim(), n = searchKey(term);
                if (!n || (!hasCjk(n) && n.length < 2)) return Promise.resolve({ Items: [], TotalRecordCount: 0 });
                return runSearch(api(), term, null).then(function (found) {
                    var items = [].concat(found.Series, found.Movie, found.MusicArtist, found.MusicAlbum, found.Episode, found.Audio).slice(0, 20);
                    return { Items: items, TotalRecordCount: items.length };
                });
            };
        }, true);
        // Enter: our search page
        function go(e, box) {
            var term = (box.value || '').trim();
            if (!term) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (typeof box.closeSelectionDialog === 'function') box.closeSelectionDialog();
            if (routeInfo().path !== 'search') location.hash = '#!/search?serverId=' + encodeURIComponent(api().serverId());
            waitFor(function () {
                var v = document.querySelector('.view:not(.hide)');
                return v && routeInfo().path === 'search' ? v.querySelector('.searchfields-txtSearch') : null;
            }, function (field) {
                if (field.value === term) return;
                field.value = term;
                field.dispatchEvent(new Event('input', { bubbles: true }));
            }, 4000);
        }
        window.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.isComposing && isBox(e.target)) go(e, e.target);
        }, true);
        window.addEventListener('submit', function (e) {
            var box = e.target && e.target.querySelector ? e.target.querySelector('.txtNavDrawerSearch') : null;
            if (box) go(e, box);
        }, true);
    }

    var cardBuilder = null;
    function getCardBuilder() {
        return cardBuilder || (cardBuilder = Emby.importModule('./modules/cardbuilder/cardbuilder.js').then(function (m) { return m.default || m; }));
    }
    function hideLoading() {
        Emby.importModule('./modules/loading/loading.js').then(function (m) { (m.default || m).hide(); }, function () { });
    }
    // a card grid (or row) Emby builds and handles itself: clicks, context menu, play buttons, images
    function cardsInto(host, items, options) {
        host.innerHTML = '<div is="emby-itemscontainer" class="itemsContainer focuscontainer-x ' + (options.row ? 'mui-cardrow' : 'vertical-wrap mui-cardgrid') + '"></div>';
        var box = host.firstChild;
        return getCardBuilder().then(function (cb) {
            cb.buildCards(items, Object.assign({ itemsContainer: box, fields: ['Name', 'ProductionYear'], centerText: true, overlayPlayButton: true, cardLayout: false }, options));
            return box;
        });
    }

    // Our tab controllers: the same life cycle as Emby's (created on first show, onResume each time it shows).
    // The tab slot arrives filled with Emby's template for that slot; ours replaces it.
    function MuiTab(view, params, options) {
        this.view = view;
        this.params = params;
        this.options = options || {};
        this.item = this.options.item;
    }
    MuiTab.prototype.loadTemplate = function () { return Promise.resolve(); };
    MuiTab.prototype.onTemplateLoaded = function () {
        this.view.innerHTML = '';
        this.view.classList.add('mui-tab');
        this.body = el('div', 'mui-tabbody padded-left padded-right padded-top-page padded-bottom-page');
        this.view.appendChild(this.body);
        this.view.__muiReady = false;
        this.body.style.visibility = 'hidden';
    };
    MuiTab.prototype.onResume = function () {
        if (!this.started) {
            this.started = true;
            var self = this;
            return Promise.resolve(this.render()).catch(function (e) {
                console.warn('[ModernUI] tab', e);
                self.body.appendChild(el('div', 'mui-tabempty', L('加载失败', 'Could not load')));
            }).then(function () {
                if (!self.view || !self.body) return;
                self.view.__muiReady = true;
                self.body.style.visibility = '';
                self.view.dispatchEvent(new Event('mui:tabready', { bubbles: true }));
                hideLoading();
            });
        }
        hideLoading();
        return Promise.resolve();
    };
    MuiTab.prototype.onPause = function () { };
    MuiTab.prototype.destroy = function () {
        if (this.io) this.io.disconnect();
        this.view = this.body = null;
    };
    MuiTab.prototype.scrollToBeginning = function () {
        if (!this.view) return;
        if (docScroll) docScrollTo(0, 'smooth');
        else this.view.scrollTop = 0;
    };
    MuiTab.prototype.hasFocus = function () { return false; };
    MuiTab.prototype.autoFocus = function () { return false; };
    MuiTab.prototype.refresh = function () { return Promise.resolve(); };
    function tabClass(render) {
        function Tab() { MuiTab.apply(this, arguments); }
        Tab.prototype = Object.create(MuiTab.prototype);
        Tab.prototype.render = render;
        return Tab;
    }

    // ----- folder tabs: albums in the order of their folders (numbered folders by number), never by title -----

    // folder names in the order a file manager lists them: numbers by value, Chinese by pinyin
    var folderCollator = window.Intl && Intl.Collator ? new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' }) : null;
    function folderOrder(a, b) { return folderCollator ? folderCollator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }
    // "02.蒙德 - 风与牧歌之城" (a folder) and "原神 - 风与牧歌之城" (its album) both read "风与牧歌之城"
    function titleKey(s) {
        s = String(s || '').replace(/^\s*\d+\s*[.、_-]\s*/, '');
        var i = s.lastIndexOf(' - ');
        if (i >= 0) s = s.slice(i + 3);
        return s.replace(/[\s·・\-_.,，、:：!！?？'"“”‘’()（）\[\]【】]/g, '').toLowerCase();
    }
    // Albums carry no path (Emby builds them from the tags), so each one is matched to the folder it sits in:
    // by title, and for a folder named differently, by asking what is inside. Worked out once per library.
    var shelfCache = {};
    function folderShelves(lib, conf) {
        if (shelfCache[lib.Id]) return shelfCache[lib.Id];
        var a = api(), uid = a.getCurrentUserId();
        var albumQuery = { IncludeItemTypes: 'MusicAlbum', Recursive: true, Fields: 'PrimaryImageAspectRatio,ProductionYear,ChildCount,RecursiveItemCount,PremiereDate', EnableImageTypes: 'Primary', ImageTypeLimit: 1 };
        var p = a.getItems(uid, { ParentId: lib.Id }).then(function (res) {
            var byName = {};
            (res.Items || []).forEach(function (f) { byName[f.Name] = f; });
            return Promise.all(conf.shelves.filter(function (g) { return byName[g.folder]; }).map(function (g) {
                var shelf = byName[g.folder];
                return Promise.all([
                    a.getItems(uid, { ParentId: shelf.Id }),
                    a.getItems(uid, Object.assign({ ParentId: shelf.Id }, albumQuery))
                ]).then(function (r) {
                    var folders = (r[0].Items || []).filter(function (x) { return x.IsFolder && x.Type !== 'MusicAlbum'; })
                        .sort(function (x, y) { return folderOrder(x.Name, y.Name); });
                    var albums = r[1].Items || [], byKey = {}, placed = [], unmatched = [];
                    albums.forEach(function (al) { (byKey[titleKey(al.Name)] = byKey[titleKey(al.Name)] || []).push(al); });
                    folders.forEach(function (fo, i) {
                        var hit = (byKey[titleKey(fo.Name)] || []).shift();
                        if (hit) placed[i] = hit; else unmatched.push(i);
                    });
                    return Promise.all(unmatched.map(function (i) {
                        return a.getItems(uid, Object.assign({ ParentId: folders[i].Id, Limit: 1 }, albumQuery)).then(function (x) { placed[i] = x.Items && x.Items[0]; });
                    })).then(function () {
                        // in folder order; anything left over (loose in the shelf folder) at the end
                        var seen = {}, list = [];
                        placed.concat(albums).forEach(function (al) { if (al && !seen[al.Id] && !(conf.hide && conf.hide.test(al.Name))) { seen[al.Id] = 1; list.push(al); } });
                        return { group: g, albums: list };
                    });
                });
            }));
        });
        shelfCache[lib.Id] = p;
        p.catch(function () { delete shelfCache[lib.Id]; });
        return p;
    }
    // the start every album title of the library shares (stripPrefix: "原神 - "), left off; the library says it
    function gsTitle(name, strip) {
        name = String(name || '');
        var bare = strip ? strip.trim() : '';
        if (bare && name.indexOf(bare) === 0) name = name.slice(bare.length).replace(/^[\s\-–—:：·]+/, '');
        return name;
    }
    // Native home rows use the same titles as folder tabs. Their heading links identify the library;
    // album artists and albums in other libraries can share a name, so neither names nor artists scope this.
    // Phone rows show the library's own name (Emby prefixes "最新" / "Latest") and a blue "更多" at the far end
    // of the title row instead of the chevron, as in the reference layout.
    function decorateSectionTitles(scope) {
        if (!isPhone() || !scope || !scope.querySelectorAll) return;
        var links = scope.matches && scope.matches('.sectionTitleTextButton') ? [scope] : scope.querySelectorAll('.sectionTitleTextButton');
        Array.prototype.forEach.call(links, function (link) {
            var title = link.querySelector('.sectionTitle');
            if (!title) return;
            if (title.__muiTitle == null) title.__muiTitle = title.textContent;
            var short = title.__muiTitle.replace(/^(最新|Latest)\s*/i, '');
            if (title.textContent !== short) title.textContent = short;
            link.classList.add('mui-section-more-row');
            if (!link.querySelector('.mui-section-more')) link.appendChild(el('span', 'mui-section-more', L('更多', 'More')));
        });
    }

    function homeAlbumTitles(scope) {
        var path = routeInfo().path;
        if (scope && scope.nodeType === 1) decorateSectionTitles(scope);
        if (!scope || (path !== 'home' && path !== 'home.html') || !FOLDER_TABS.some(function (c) { return !!c.strip; })) return;
        var section = scope.closest && scope.closest('.verticalSection');
        if (section) homeAlbumSectionTitles(section);
        if (scope.querySelectorAll) scope.querySelectorAll('.verticalSection').forEach(homeAlbumSectionTitles);
    }
    function homeAlbumSectionTitles(section) {
        var candidates = section.querySelectorAll('.itemsContainer > .card');
        var hasTitle = Array.prototype.some.call(candidates, function (card) {
            var item = cardItem(card);
            return item && item.Type === 'MusicAlbum' && item.Name && FOLDER_TABS.some(function (conf) {
                return conf.strip && gsTitle(item.Name, conf.strip) !== item.Name;
            });
        });
        if (!hasTitle) return;
        var heading = section.querySelector('.sectionTitleTextButton[href], .sectionTitleContainer a[href]');
        var match = heading && /[?&]parentId=([^&#]+)/i.exec(heading.getAttribute('href') || '');
        if (!match) return;
        var id;
        try { id = decodeURIComponent(match[1]); } catch (e) { return; }
        var state = section.__muiAlbumTitles;
        if (state && state.id === id) {
            if (state.ready) applyHomeAlbumTitles(section, state.conf);
            return;
        }
        state = section.__muiAlbumTitles = { id: id, ready: false, conf: null };
        getItem(id).then(function (lib) {
            if (section.__muiAlbumTitles !== state) return;
            state.conf = lib.CollectionType === 'music' ? folderTabsFor(lib) : null;
            state.ready = true;
            if (section.isConnected) applyHomeAlbumTitles(section, state.conf);
        }, function () {
            if (section.__muiAlbumTitles === state) delete section.__muiAlbumTitles;
        });
    }
    function applyHomeAlbumTitles(section, conf) {
        if (!conf || !conf.strip) return;
        section.querySelectorAll('.itemsContainer > .card').forEach(function (card) {
            var item = cardItem(card);
            if (!item || item.Type !== 'MusicAlbum' || !item.Name) return;
            var title = card.querySelector('.cardText-first'), name = String(item.Name), shortened = gsTitle(name, conf.strip);
            if (!title || !shortened || shortened === name) return;
            // Change only the title's text node. Emby's original DTO, artist links, actions and DOM listeners
            // stay intact, and virtual cards get this display-only change again whenever Emby refills them.
            var texts = document.createTreeWalker(title, 4), text;
            while ((text = texts.nextNode())) {
                if (text.nodeValue.trim() === name) text.nodeValue = text.nodeValue.replace(name, shortened);
            }
            if (title.getAttribute('title') === name) title.setAttribute('title', shortened);
            title.querySelectorAll('[title]').forEach(function (node) {
                if (node.getAttribute('title') === name) node.setAttribute('title', shortened);
            });
        });
    }
    function trackCount(al) { return al.ChildCount || al.RecursiveItemCount || 0; }
    function coverOf(al) {
        if (al.ImageTags && al.ImageTags.Primary) return { id: al.Id, tag: al.ImageTags.Primary };
        if (al.PrimaryImageItemId && al.PrimaryImageTag) return { id: al.PrimaryImageItemId, tag: al.PrimaryImageTag };
        return null;
    }
    function playButton(label, iconName, onClick, cls) {
        var b = el('button', 'mui-btn ' + (cls || 'mui-btn-glass'));
        b.type = 'button';
        b.appendChild(icon(iconName));
        if (label) b.appendChild(el('span', '', label));
        else b.setAttribute('aria-label', L('播放', 'Play'));
        b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
        return b;
    }
    // A category: its name, what is in it and a way to play it all, over the first cover blurred; its covers
    // fanned out on the right
    function gsHeader(title, albums) {
        var head = el('header', 'mui-gs-head'), covers = albums.map(coverOf).filter(Boolean);
        if (covers[0]) head.style.setProperty('--mui-panel-art', 'url("' + imgUrl(covers[0].id, 'Primary', covers[0].tag, 320, 60) + '")');
        var text = el('div', 'mui-gs-headtext');
        text.appendChild(el('h2', 'mui-gs-name', title));
        var years = albums.map(function (al) { return al.ProductionYear; }).filter(Boolean);
        var tracks = albums.reduce(function (n, al) { return n + trackCount(al); }, 0);
        var meta = [albumCount(albums.length)];
        if (years.length) {
            var lo = Math.min.apply(null, years), hi = Math.max.apply(null, years);
            meta.push(lo === hi ? String(lo) : lo + '–' + hi);
        }
        if (tracks) meta.push(L('共 ' + tracks + ' 首', tracks + ' tracks'));
        text.appendChild(el('div', 'mui-gs-meta', meta.join(' · ')));
        var actions = el('div', 'mui-gs-actions');
        actions.appendChild(playButton(L('播放全部', 'Play all'), 'play_arrow', function () { if (pm) pm.play({ items: albums }); }, 'mui-btn-primary'));
        text.appendChild(actions);
        head.appendChild(text);
        var fan = el('div', 'mui-gs-fan');
        covers.slice(0, 4).forEach(function (c, i) {
            var img = el('img');
            img.alt = '';
            img.src = imgUrl(c.id, 'Primary', c.tag, 280, 85);
            img.style.setProperty('--i', i);
            fan.appendChild(img);
        });
        head.appendChild(fan);
        return head;
    }
    // One album as a wide tile: the cover; its title, year, length and first tracks. The tile opens the album.
    function gsTile(al, io, strip) {
        var tile = el('div', 'mui-gs-tile'), c = coverOf(al);
        tile.tabIndex = 0;
        tile.__album = al;
        if (c) tile.style.setProperty('--mui-panel-art', 'url("' + imgUrl(c.id, 'Primary', c.tag, 200, 60) + '")');
        var cover = el('div', 'mui-gs-cover');
        if (c) {
            var img = el('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = imgUrl(c.id, 'Primary', c.tag, 400, 85);
            cover.appendChild(img);
        }
        cover.appendChild(playButton('', 'play_arrow', function () { if (pm) pm.play({ items: [al] }); }, 'mui-btn-primary mui-btn-round mui-gs-play'));
        tile.appendChild(cover);
        var info = el('div', 'mui-gs-info');
        info.appendChild(el('h3', 'mui-gs-title', gsTitle(al.Name, strip)));
        var meta = [];
        if (al.ProductionYear) meta.push(al.ProductionYear);
        if (trackCount(al)) meta.push(L(trackCount(al) + ' 首', trackCount(al) + ' tracks'));
        if (al.RunTimeTicks) meta.push(Math.round(al.RunTimeTicks / 6e8) + L(' 分钟', ' min'));
        info.appendChild(el('div', 'mui-gs-tmeta', meta.join(' · ')));
        var tracks = el('ol', 'mui-gs-tracks');
        // Reserve exactly the preview rows, so track requests don't resize the tiles during the tab slide.
        for (var i = 0; i < Math.min(trackCount(al), 5); i++) {
            var row = el('li', '', '\u00a0');
            row.style.visibility = 'hidden';
            row.setAttribute('aria-hidden', 'true');
            tracks.appendChild(row);
        }
        info.appendChild(tracks);
        tile.appendChild(info);
        tile.addEventListener('click', function () { showItem(al); });
        tile.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target === tile) { e.preventDefault(); tile.click(); }
        });
        if (io) io.observe(tile); else gsTracks(tile);
        return tile;
    }
    // the first few tracks, once the tile is near
    function gsTracks(tile) {
        if (tile.__tracksLoading) return;
        tile.__tracksLoading = true;
        var a = api(), al = tile.__album;
        a.getItems(a.getCurrentUserId(), {
            ParentId: al.Id, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'ParentIndexNumber,IndexNumber,SortName', Limit: 4, EnableImages: false
        }).then(function (res) {
            var ol = tile.querySelector('.mui-gs-tracks'), items = res.Items || [];
            ol.textContent = '';
            items.forEach(function (t) { ol.appendChild(el('li', '', t.Name)); });
            var rest = trackCount(al) - items.length;
            if (rest > 0) ol.appendChild(el('li', 'mui-gs-rest', L('还有 ' + rest + ' 首', rest + ' more')));
        }, function () { tile.__tracksLoading = false; });
    }
    function folderTab(conf, tab) {
        return tabClass(function () {
            var body = this.body;
            body.classList.add('mui-gs');
            var io = this.io = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
                entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); gsTracks(en.target); } });
            }, { rootMargin: '400px 0px' }) : null;
            return folderShelves(this.item, conf).then(function (shelves) {
                var all = !!tab.all;
                var parts = shelves.filter(function (s) { return all || s.group.tab === tab.id; });
                if (!all && parts.length) {
                    var albums = [].concat.apply([], parts.map(function (s) { return s.albums; }));
                    body.appendChild(gsHeader(tab.name, albums));
                }
                // the all tab: each shelf under its name, as a grid of covers; a shelf of its own: wide tiles
                return Promise.all(parts.map(function (s) {
                    var sec = el('section', 'mui-gsec'), grid = el('div');
                    if (all) {
                        var h = el('h2', 'mui-gsec-title', s.group.title);
                        h.appendChild(el('span', 'mui-gsec-count', String(s.albums.length)));
                        sec.appendChild(h);
                    } else grid.className = 'mui-gs-grid';
                    sec.appendChild(grid);
                    body.appendChild(sec);
                    if (!all) {
                        s.albums.forEach(function (al) { grid.appendChild(gsTile(al, io, conf.strip)); });
                        return null;
                    }
                    return cardsInto(grid, s.albums, { shape: 'square', context: 'music' }).then(function (box) {
                        if (!conf.strip) return;
                        box.querySelectorAll('.cardText').forEach(function (t) {
                            var n = t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild : t;
                            n.textContent = gsTitle(n.textContent, conf.strip);
                        });
                    });
                }));
            });
        });
    }
    FOLDER_TABS.forEach(function (conf) { conf.tabs.forEach(function (t) { TAB_CONTROLLERS[t.id] = folderTab(conf, t); }); });

    // ----- series: Emby collections whose entries include this library's titles, in release order -----

    function dateOf(it) { return it.PremiereDate ? Date.parse(it.PremiereDate) : it.ProductionYear ? Date.UTC(it.ProductionYear, 0, 1) : 0; }
    TAB_CONTROLLERS['mui-series'] = tabClass(function () {
        var a = api(), uid = a.getCurrentUserId(), body = this.body, lib = this.item;
        var fields = 'PremiereDate,ProductionYear,PrimaryImageAspectRatio,EndDate,Status,Overview,Genres';
        return a.getItems(uid, { IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName', Fields: 'Overview', EnableImageTypes: 'Primary,Backdrop,Logo', ImageTypeLimit: 1 }).then(function (res) {
            return Promise.all((res.Items || []).map(function (box) {
                return a.getItems(uid, { ParentId: box.Id, Fields: fields, EnableImageTypes: 'Primary,Backdrop,Logo', ImageTypeLimit: 1 }).then(function (kids) {
                    var items = (kids.Items || []).filter(function (k) { return VIDEO_TYPES[k.Type]; });
                    if (!items.length) return null;
                    // only series that have something in this library
                    return a.getItems(uid, { ParentId: lib.Id, Recursive: true, Ids: items.map(function (k) { return k.Id; }).join(','), Limit: 1 }).then(function (inLib) {
                        return inLib.TotalRecordCount ? { box: box, items: items.sort(function (x, y) { return dateOf(x) - dateOf(y); }) } : null;
                    });
                });
            }));
        }).then(function (all) {
            var series = all.filter(Boolean);
            if (!series.length) {
                var empty = el('div', 'mui-tabempty');
                empty.appendChild(el('h2', '', L('还没有系列', 'No series yet')));
                empty.appendChild(el('p', '', L('系列来自 Emby 的合集：把同一系列的剧集和剧场版放进一个合集，它就会按上映顺序出现在这里。', 'Series come from Emby collections: put the shows and films of one franchise in a collection and they appear here in release order.')));
                body.appendChild(empty);
                return;
            }
            return Promise.all(series.map(function (s) { return seriesSection(body, s); }));
        });
    });
    // One series: its cover on the left; on the right what it is, then its entries in release order. The
    // newest entry's backdrop tints the panel.
    function seriesSection(body, s) {
        var sec = el('section', 'mui-series');
        var art = null;
        if (s.box.BackdropImageTags && s.box.BackdropImageTags.length) art = { id: s.box.Id, tag: s.box.BackdropImageTags[0] };
        for (var i = s.items.length - 1; i >= 0 && !art; i--) art = backdropOf(s.items[i]);
        if (art) sec.style.setProperty('--mui-series-art', 'url("' + imgUrl(art.id, 'Backdrop', art.tag, 480, 60, 0) + '")');

        // the collection's own cover if it has one (Emby: edit images), else the first entry's poster
        var cover = el('button', 'mui-series-cover'), poster = null;
        cover.__muiItem = s.box;
        cover.type = 'button';
        cover.setAttribute('aria-label', s.box.Name);
        if (s.box.ImageTags && s.box.ImageTags.Primary) poster = { id: s.box.Id, tag: s.box.ImageTags.Primary };
        for (var j = 0; j < s.items.length && !poster; j++) if (s.items[j].ImageTags && s.items[j].ImageTags.Primary) poster = { id: s.items[j].Id, tag: s.items[j].ImageTags.Primary };
        if (poster) {
            var img = el('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = imgUrl(poster.id, 'Primary', poster.tag, 480, 85);
            cover.appendChild(img);
        }
        cover.addEventListener('click', function () { showItem(s.box); });
        sec.appendChild(cover);

        var side = el('div', 'mui-series-side'), info = el('div', 'mui-series-info');
        var name = el('h2', 'mui-series-name', s.box.Name);
        name.addEventListener('click', function () { showItem(s.box); });
        info.appendChild(name);
        var tv = s.items.filter(function (x) { return x.Type === 'Series'; }).length, films = s.items.length - tv;
        var years = s.items.map(function (x) { return x.ProductionYear; }).filter(Boolean);
        var meta = [L(s.items.length + ' 部', s.items.length + (s.items.length > 1 ? ' titles' : ' title'))];
        if (years.length) meta.push(Math.min.apply(null, years) + (Math.max.apply(null, years) > Math.min.apply(null, years) ? '–' + Math.max.apply(null, years) : ''));
        if (tv) meta.push(L(tv + ' 部 TV', tv + ' TV'));
        if (films) meta.push(L(films + ' 部剧场版', films + (films > 1 ? ' films' : ' film')));
        info.appendChild(el('div', 'mui-series-meta', meta.join(' · ')));
        var genres = [];
        s.items.forEach(function (x) { (x.Genres || []).forEach(function (g) { if (genres.indexOf(g) < 0) genres.push(g); }); });
        if (genres.length) {
            var chips = el('div', 'mui-series-chips');
            genres.slice(0, 4).forEach(function (g) { chips.appendChild(el('span', '', g)); });
            info.appendChild(chips);
        }
        // the collection's overview, or the earliest entry's (what the series started as), one in Chinese first
        var told = s.items.filter(function (x) { return x.Overview; });
        var about = stripTags(s.box.Overview) || stripTags((told.filter(function (x) { return /[一-鿿]/.test(x.Overview); })[0] || told[0] || {}).Overview);
        if (about) {
            var p = el('p', 'mui-series-about', about);
            p.addEventListener('click', function () { p.classList.toggle('is-open'); });
            info.appendChild(p);
        }
        side.appendChild(info);
        var row = el('div', 'mui-series-row');
        side.appendChild(row);
        sec.appendChild(side);
        body.appendChild(sec);
        return cardsInto(row, s.items, { shape: 'portrait', row: true });
    }

    // ----- album artists as a vertical feed: who they are, then their albums -----

    var FEED_PAGE = 20;
    function monogramColor(name) {
        var h = 0;
        for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
        return 'linear-gradient(135deg,hsl(' + h + ',45%,42%),hsl(' + ((h + 40) % 360) + ',55%,28%))';
    }
    TAB_CONTROLLERS['mui-artists'] = tabClass(function () {
        var self = this, a = api(), uid = a.getCurrentUserId(), lib = this.item, next = 0, total = null, busy = false;
        var list = el('div', 'mui-feed'), more = el('div', 'mui-feed-more');
        this.body.appendChild(list);
        this.body.appendChild(more);
        // albums come in when an artist scrolls near
        var albumIo = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (!en.isIntersecting) return;
                albumIo.unobserve(en.target);
                loadAlbums(en.target);
                fitBio(en.target);
            });
        }, { rootMargin: '600px 0px' }) : null;
        function loadAlbums(sec) {
            var artist = sec.__artist;
            a.getItems(uid, {
                ParentId: lib.Id, Recursive: true, IncludeItemTypes: 'MusicAlbum', AlbumArtistIds: artist.Id,
                SortBy: 'ProductionYear,SortName', SortOrder: 'Descending', Fields: 'PrimaryImageAspectRatio,ProductionYear',
                EnableImageTypes: 'Primary', ImageTypeLimit: 1
            }).then(function (res) {
                var albums = res.Items || [];
                sec.querySelector('.mui-artist-count').textContent = albumCount(albums.length);
                // no photo of the artist: their latest cover stands in, and tints the panel (an album without
                // its own picture shows its tracks' embedded art, which Emby hands over as PrimaryImageItemId)
                var cover = null;
                albums.some(function (al) {
                    if (al.ImageTags && al.ImageTags.Primary) cover = { id: al.Id, tag: al.ImageTags.Primary };
                    else if (al.PrimaryImageItemId && al.PrimaryImageTag) cover = { id: al.PrimaryImageItemId, tag: al.PrimaryImageTag };
                    return !!cover;
                });
                if (cover && sec.__noPhoto) {
                    var face = sec.querySelector('.mui-artist-face'), art = imgUrl(cover.id, 'Primary', cover.tag, 240, 60), probe = new Image();
                    probe.onload = function () {
                        face.style.setProperty('--mui-face-art', 'url("' + art + '")');
                        face.classList.add('is-cover');
                    };
                    probe.src = art;
                    sec.style.setProperty('--mui-panel-art', 'url("' + art + '")');
                }
                return cardsInto(sec.querySelector('.mui-artist-albums'), albums, { shape: 'square', row: true, context: 'music' });
            });
        }
        // a long biography shows its first lines, with a way to read on
        function fitBio(sec) {
            var p = sec.querySelector('.mui-artist-bio:not(.is-empty)');
            if (!p || p.__fit) return;
            p.__fit = true;
            if (p.scrollHeight <= p.clientHeight + 2) return;
            var more = el('button', 'mui-artist-more', L('展开', 'More'));
            more.type = 'button';
            more.addEventListener('click', function () {
                var open = p.classList.toggle('is-open');
                more.textContent = open ? L('收起', 'Less') : L('展开', 'More');
            });
            p.parentNode.insertBefore(more, p.nextSibling);
        }
        // The photo (a square with soft corners) on the left; on the right the name, album count and genres, the
        // biography, then the albums. Photo and name open the artist.
        function artistSection(artist) {
            var sec = el('section', 'mui-artist');
            sec.__artist = artist;
            var face = el('button', 'mui-artist-face');
            face.type = 'button';
            face.setAttribute('aria-label', artist.Name);
            if (artist.ImageTags && artist.ImageTags.Primary) {
                var img = el('img');
                img.alt = '';
                img.loading = 'lazy';
                img.src = imgUrl(artist.Id, 'Primary', artist.ImageTags.Primary, 500, 85);
                face.appendChild(img);
                sec.style.setProperty('--mui-panel-art', 'url("' + imgUrl(artist.Id, 'Primary', artist.ImageTags.Primary, 240, 60) + '")');
            } else {
                // a colour of its own until the albums are in (then their newest cover, blurred)
                sec.__noPhoto = true;
                face.classList.add('is-initial');
                face.style.setProperty('--mui-face-tone', monogramColor(artist.Name));
                face.appendChild(el('span', 'mui-artist-initial', Array.from(artist.Name.trim())[0] || '?'));
            }
            face.addEventListener('click', function () { showItem(artist); });
            sec.appendChild(face);

            var main = el('div', 'mui-artist-main'), head = el('div', 'mui-artist-head');
            var name = el('h2', 'mui-artist-name', artist.Name);
            name.addEventListener('click', function () { showItem(artist); });
            head.appendChild(name);
            var sub = el('div', 'mui-artist-sub');
            sub.appendChild(el('span', 'mui-artist-count', ''));
            (artist.Genres || []).slice(0, 3).forEach(function (g) { sub.appendChild(el('span', 'mui-artist-tag', g)); });
            head.appendChild(sub);
            main.appendChild(head);
            var about = el('div', 'mui-artist-about'), bio = stripTags(artist.Overview);
            about.appendChild(el('p', 'mui-artist-bio' + (bio ? '' : ' is-empty'), bio || ''));
            main.appendChild(about);
            main.appendChild(el('div', 'mui-artist-albums'));
            sec.appendChild(main);
            return sec;
        }
        function page() {
            if (busy || (total != null && next >= total) || !self.body) return;
            busy = true;
            a.getJSON(a.getUrl('Artists/AlbumArtists', {
                UserId: uid, ParentId: lib.Id, SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: next, Limit: FEED_PAGE,
                Fields: 'Overview,Genres,PrimaryImageAspectRatio', EnableImageTypes: 'Primary,Backdrop', ImageTypeLimit: 1
            })).then(function (res) {
                total = res.TotalRecordCount;
                (res.Items || []).forEach(function (artist) {
                    var sec = artistSection(artist);
                    list.appendChild(sec);
                    if (albumIo) albumIo.observe(sec); else loadAlbums(sec);
                });
                next += (res.Items || []).length;
                busy = false;
                if (next >= total || !(res.Items || []).length) more.remove();
                else page();
            }, function () { busy = false; });
        }
        if (window.IntersectionObserver) {
            this.io = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) page(); }, { rootMargin: '1200px 0px' });
            this.io.observe(more);
        }
        page();
    });

    // ---------- phones: the document scrolls, the way an ordinary site does ----------

    // Safari shrinks its toolbar as a page scrolls, shows the page under the status bar and the toolbar, and goes
    // back to the top on a tap on the status bar, but only while the document itself scrolls (Chrome on Android
    // hides its address bar the same way). Emby locks the document and scrolls a container per page instead: the
    // page itself or its tab, an emby-scroller marked data-bindheader. On phones that container is let out into the
    // document (modernui.css, html.mui-docscroll) and its scroller is told so: positions, sizes and scrolling go to
    // the document, and the document's scroll events go on to the container, where Emby's virtual grids and its
    // header listen. Each page and each tab keeps its own place, as it did in its own container.
    var FRAME = '.scrollFrameY[data-bindheader="true"]';
    var docEl = document.scrollingElement || document.documentElement, docScroll = false, docReady = false;
    function docY(includeOverscroll) {
        var y = docEl.scrollTop;
        return includeOverscroll === true ? y : Math.max(0, y);
    }
    function docScrollTo(y, behavior) {
        y = Math.max(0, Math.round(y || 0));
        try { docEl.scrollTo({ top: y, behavior: behavior || 'instant' }); } catch (e) { docEl.scrollTop = y; }
    }
    function docSave(frame) { if (frame) frame.__muiDocY = docY(); }
    function docRestore(frame) { docScrollTo(frame && frame.__muiDocY || 0); }
    // what scrolls a page: the page itself, or its active tab (one of Emby's or one of ours)
    function pageFrame(page) {
        page = page || document.querySelector('.page:not(.hide):not(.dialog)');
        if (!page || !page.matches) return null;
        if (page.matches(FRAME)) return page;
        return page.querySelector(':scope > .tabContent.is-active') || page.querySelector(':scope > ' + FRAME);
    }
    function isDocScroller(s) {
        var f = s && s.frame;
        return docScroll && !!f && !(s.options && s.options.horizontal) && f.getAttribute('data-bindheader') === 'true' && !f.closest('.dialog');
    }
    // Emby's scroller (smoothscroller.js), for the containers that scroll pages. Scrolling to an element (focus
    // scrolling, for keyboards and remotes) goes through slideTo and does nothing there; touch doesn't use it.
    function patchScroller() {
        return Emby.importModule('./modules/scroller/smoothscroller.js').then(function (m) {
            var proto = (m && m.default || m).prototype;
            if (!proto || typeof proto.getScrollTop !== 'function') return false;
            if (proto.__muiDoc) return true;
            proto.__muiDoc = true;
            function over(name, fn) {
                var own = proto[name];
                if (typeof own === 'function') proto[name] = function () { return isDocScroller(this) ? fn.apply(this, arguments) : own.apply(this, arguments); };
            }
            over('getScrollTop', docY);
            over('getLastScrollTop', docY);
            over('getScrollHeight', function () { return docEl.scrollHeight; });
            // the screen, where the container's box was: Emby's virtual grids measure what is in view against it
            over('getScrollContainerBoundingClientRect', function () {
                var f = this.frame.getBoundingClientRect(), h = Math.max(window.innerHeight, docEl.clientHeight);
                return { left: f.left, right: f.right, width: f.width, x: f.left, top: 0, y: 0, bottom: h, height: h };
            });
            over('scrollToPosition', function (pos) {
                var top = pos && (pos.position != null ? pos.position : pos.top);
                if (top != null) docScrollTo(top, pos.behavior || 'smooth');
                return Promise.resolve();
            });
            over('scrollBy', function (delta) { if (delta) docScrollTo(docY() + delta); });
            return true;
        });
    }
    function onDocScroll() {
        if (!docScroll) return;
        var f = pageFrame();
        if (f) {
            f.dispatchEvent(new Event('scroll'));
        }
    }
    // the page's scrolling moves between the document and its container (at start, and when a phone turns
    // sideways, which is no phone layout any more): it keeps its place, and Emby's scrollers and virtual grids
    // measure again
    function syncDocScroll() {
        var on = docReady && isPhone();
        if (on === docScroll) return;
        var f = pageFrame(), y = f ? (docScroll ? docY() : f.scrollTop) : 0;
        docScroll = on;
        root.classList.toggle('mui-docscroll', on);
        if (on) {
            if (f) f.scrollTop = 0;
            docScrollTo(y);
        } else {
            docScrollTo(0);
            if (f) f.scrollTop = y;
        }
        document.querySelectorAll(FRAME).forEach(function (fr) {
            if (fr.scroller && typeof fr.scroller.notifyResized === 'function') fr.scroller.notifyResized();
            fr.querySelectorAll('.itemsContainer').forEach(function (ic) {
                var vs = ic.scroller;
                if (vs && typeof vs._scrollTargetSizeChanged === 'function') vs._scrollTargetSizeChanged([]);
            });
        });
        if (f) f.dispatchEvent(new Event('scroll'));
    }

    // ---------- now-playing bar: a docked player on the desktop, a floating mini player on phones ----------
    // Emby lays the bar out as one row, with the position slider pinned along its top edge and only the elapsed time
    // shown. The stylesheet turns it into a grid with the slider under the transport; here the elapsed time moves out
    // of the transport group to sit before the slider, and a duration of our own follows it. Nothing else moves: the
    // sliders are custom elements that drop their parts when they are taken out of the page and never get them back.
    function arrangeBar(bar) {
        if (!bar || bar.__muiBar) return;
        var top = bar.querySelector('.nowPlayingBarTop'), slider = bar.querySelector('.nowPlayingBarPositionContainer');
        var time = bar.querySelector('.nowPlayingBarCurrentTime');
        if (!top || !slider || !time || slider.parentNode !== top) return;
        bar.__muiBar = true;
        var duration = el('div', 'mui-bar-duration');
        top.append(time, duration);
        bar.classList.add('mui-bar');
        // Emby rewrites the elapsed time on every tick; the duration follows it from the same player.
        function showDuration() {
            var ticks = 0;
            try { ticks = pm && pm.duration ? pm.duration() : 0; } catch (e) { }
            var text = ticks > 0 ? clock(ticks / 1e7) : '';
            if (duration.textContent !== text) duration.textContent = text;
        }
        new MutationObserver(showDuration).observe(time, { childList: true, characterData: true, subtree: true });
        showDuration();
    }
    function clock(seconds) {
        seconds = Math.round(seconds);
        var h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
        return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // ---------- phone menus: only what a phone needs, opening from the button that asked ----------
    // Emby's item menus carry the whole desktop toolbox (edit, identify, convert, download, delete...), which filled
    // the screen on a phone. Phones keep playing, favourites and the played state, plus going to the item, its
    // season, series, album or artist. Every menu that comes from a button opens from that button as a popover, not
    // as a sheet from the bottom edge.
    var PHONE_DROPPED = ['edit', 'editimages', 'editsubtitles', 'identify', 'resetmetadata', 'refresh', 'delete', 'deleteseries',
        'download', 'synclocal', 'sync', 'convert', 'addtocollection', 'addtoplaylist', 'removefromcollection', 'removefromplaylist',
        'multiselect', 'copytoclipboard', 'share', 'manageaccess', 'mergeversions', 'record', 'copydatatousers', 'searchimageproviders',
        'addimage', 'addimagefromurl', 'scan', 'renamelibrary', 'changelibrarycontenttype', 'moveupinorder', 'movedowninorder',
        'leaveshareditems', 'deletelastplayed', 'showmissingepisodes', 'preview', 'link'];
    var lastTap = null;
    function notePhoneTap(e) {
        var b = e.target && e.target.closest && e.target.closest('button, [role="button"]');
        lastTap = b ? { el: b, at: Date.now() } : null;
    }
    function patchPhoneMenus() {
        Emby.importModule('./modules/actionsheet/actionsheet.js').then(function (mod) {
            var sheet = mod.default || mod;
            if (sheet.__muiPhoneMenus) return;
            sheet.__muiPhoneMenus = true;
            var show = sheet.show;
            sheet.show = function (options) {
                return show.call(this, isPhone() && options ? phoneMenu(options) : options);
            };
        }).catch(function (e) { console.warn('[ModernUI] phone menus', e); });
    }
    function phoneMenu(options) {
        options = Object.assign({}, options);
        var items = options.items;
        if (Array.isArray(items) && items.some(function (i) { return i && PHONE_DROPPED.indexOf(i.id) >= 0; })) {
            items = items.filter(function (i) { return !i || PHONE_DROPPED.indexOf(i.id) < 0; }).map(function (i) { return Object.assign({}, i); });
            if (items.length) items[items.length - 1].dividerAfter = false;
            options.items = items;
        }
        // A header button (the user menu) opens its menu without an anchor, as a sheet: anchor it to the button.
        var tap = lastTap && Date.now() - lastTap.at < 1500 && lastTap.el.isConnected ? lastTap.el : null;
        if (!options.positionTo && tap && !options.title && tap.closest('.skinHeader, .mui-phone-video-head, .nowPlayingBar')) {
            options.positionTo = tap;
            options.positionY = 'below';
            options.positionX = tap.getBoundingClientRect().left > innerWidth / 2 ? 'right' : 'left';
        }
        if (options.positionTo) {
            options.autoLowResLayout = false;
            options.dialogClass = ((options.dialogClass || '') + ' mui-popover').trim();
            popAnchor = options.positionTo.getBoundingClientRect ? options.positionTo.getBoundingClientRect() : null;
        }
        return options;
    }

    // ---------- phone liquid glass: refraction where the engine allows it ----------
    // iOS glass bends what lies under it toward its rim and splits the colours a little there. Chromium can do that to
    // the page behind an element (an SVG displacement filter in backdrop-filter); WebKit can't yet, so Safari keeps the
    // light, rim and tint the stylesheet draws. The displacement map depends on the element's size and corner radius:
    // one filter per shape, made on demand and reused; the element points at it through --mui-refract.
    var GLASS = '.skinHeader:not(.videoOsdHeader) :is(.headerBackButton,.headerMenuButton), .skinHeader:not(.videoOsdHeader) .headerRight,' +
        ' .tabs-viewmenubar-backgroundcontainer .emby-tabs-slider, .mui-phone-video-actions .mui-phone-video-control,' +
        ' .mainDetailButtons > :is(.btnShuffle,.detailButton-autotext), .nowPlayingBar.mui-bar';
    var canRefract = !!(window.CSS && CSS.supports('backdrop-filter', 'url(#x)')) &&
        /Chrome\/|Chromium\//.test(navigator.userAgent) && !/CriOS|EdgiOS|FxiOS/.test(navigator.userAgent);
    var glassDefs = null, glassShapes = {}, glassSizer = null;
    function glassify() {
        if (!canRefract || !isPhone() || !window.ResizeObserver) return;
        if (!glassSizer) glassSizer = new ResizeObserver(function (entries) { entries.forEach(function (e) { refract(e.target); }); });
        document.querySelectorAll(GLASS).forEach(function (node) {
            if (node.__muiGlass) return;
            node.__muiGlass = true;
            glassSizer.observe(node);
        });
    }
    function refract(node) {
        var w = Math.round(node.offsetWidth), h = Math.round(node.offsetHeight);
        if (!w || !h || !isPhone()) {
            ['--mui-refract', '--mui-lg-filter', '--mui-lg-panel-filter'].forEach(function (v) { node.style.removeProperty(v); });
            return;
        }
        var r = Math.min(h / 2, w / 2, parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0);
        var key = w + 'x' + h + 'r' + Math.round(r);
        if (!glassShapes[key]) glassShapes[key] = glassFilter(key, w, h, r);
        node.style.setProperty('--mui-refract', 'url(#mui-lg-' + key + ')');
        // the bending carries the look, so the glass needs less blur than the plain fallback
        node.style.setProperty('--mui-lg-filter', 'blur(1.5px) saturate(160%) brightness(1.06)');
        node.style.setProperty('--mui-lg-panel-filter', 'blur(14px) saturate(180%)');
    }
    var glassQueued = false;
    function queueGlass() {
        if (glassQueued || !canRefract) return;
        glassQueued = true;
        requestAnimationFrame(function () { glassQueued = false; glassify(); });
    }
    // A convex rim: inside a band along the edge the backdrop is sampled from further in, most strongly at the edge,
    // so content near the rim looks drawn toward it; red, green and blue bend by slightly different amounts.
    function glassFilter(key, w, h, r) {
        var band = Math.max(8, Math.min(18, Math.min(w, h) * .4)), depth = Math.min(16, band * .9);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h), px = img.data;
        var hx = w / 2 - r, hy = h / 2 - r;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            // signed distance to the rounded rectangle (negative inside) and its outward normal
            var px0 = x + .5 - w / 2, py0 = y + .5 - h / 2;
            var qx = Math.abs(px0) - hx, qy = Math.abs(py0) - hy;
            var ox = Math.max(qx, 0), oy = Math.max(qy, 0), outside = Math.sqrt(ox * ox + oy * oy);
            var dist = outside + Math.min(Math.max(qx, qy), 0) - r;
            var nx, ny;
            if (outside > 0) { nx = ox / outside; ny = oy / outside; } else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
            nx *= px0 < 0 ? -1 : 1;
            ny *= py0 < 0 ? -1 : 1;
            var t = Math.min(1, Math.max(0, -dist / band)), m = (1 - t) * (1 - t);
            var i = (y * w + x) * 4;
            px[i] = 128 - nx * m * 127;
            px[i + 1] = 128 - ny * m * 127;
            px[i + 2] = 128;
            px[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        if (!glassDefs) {
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('aria-hidden', 'true');
            svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
            glassDefs = document.createElementNS(svg.namespaceURI, 'defs');
            svg.appendChild(glassDefs);
            document.body.appendChild(svg);
        }
        var ns = 'http://www.w3.org/2000/svg', f = document.createElementNS(ns, 'filter');
        f.id = 'mui-lg-' + key;
        [['x', 0], ['y', 0], ['width', w], ['height', h], ['filterUnits', 'userSpaceOnUse'], ['primitiveUnits', 'userSpaceOnUse'],
            ['color-interpolation-filters', 'sRGB']].forEach(function (a) { f.setAttribute(a[0], a[1]); });
        var map = document.createElementNS(ns, 'feImage');
        [['x', 0], ['y', 0], ['width', w], ['height', h], ['preserveAspectRatio', 'none'], ['result', 'map']].forEach(function (a) { map.setAttribute(a[0], a[1]); });
        map.setAttribute('href', canvas.toDataURL());
        f.appendChild(map);
        // one displaced copy per colour channel, then added back together
        [['r', 1, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'], ['g', 1.07, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
            ['b', 1.14, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']].forEach(function (c) {
            var d = document.createElementNS(ns, 'feDisplacementMap');
            [['in', 'SourceGraphic'], ['in2', 'map'], ['scale', (depth * 2 * c[1]).toFixed(1)], ['xChannelSelector', 'R'], ['yChannelSelector', 'G'], ['result', 'd' + c[0]]]
                .forEach(function (a) { d.setAttribute(a[0], a[1]); });
            var m = document.createElementNS(ns, 'feColorMatrix');
            [['in', 'd' + c[0]], ['type', 'matrix'], ['values', c[2]], ['result', c[0]]].forEach(function (a) { m.setAttribute(a[0], a[1]); });
            f.append(d, m);
        });
        [['r', 'g', 'rg'], ['rg', 'b', 'rgb']].forEach(function (c) {
            var sum = document.createElementNS(ns, 'feComposite');
            [['in', c[0]], ['in2', c[1]], ['operator', 'arithmetic'], ['k1', 0], ['k2', 1], ['k3', 1], ['k4', 0], ['result', c[2]]]
                .forEach(function (a) { sum.setAttribute(a[0], a[1]); });
            f.appendChild(sum);
        });
        glassDefs.appendChild(f);
        return true;
    }

    // ---------- phone menus: grow out of their button on a spring ----------
    // iOS 26 menus emerge from the control that opened them: they start at the button's size and place and spring to
    // full size, overshooting a little. Emby positions the menu after it is added, so the animation starts once it has
    // a place; the stylesheet keeps it invisible until then.
    var SPRING = 'linear(0, 0.0314, 0.1116, 0.2222, 0.3481, 0.4775, 0.6018, 0.715, 0.8134, 0.8954, 0.9606, 1.0099, 1.0448, ' +
        '1.0673, 1.0795, 1.0835, 1.0814, 1.0751, 1.0661, 1.0557, 1.0448, 1.0344, 1.0248, 1.0164, 1.0094, 1.0038, 0.9996, 0.9965, 1)';
    var popAnchor = null;
    function morphPopover(dlg) {
        if (dlg.__muiMorph) return;
        dlg.__muiMorph = true;
        var from = popAnchor;
        popAnchor = null;
        var tries = 0;
        (function wait() {
            var box = dlg.getBoundingClientRect();
            if ((!box.width || !box.height) && ++tries < 20) { requestAnimationFrame(wait); return; }
            dlg.classList.add('mui-pop-run');
            if (!dlg.animate || reduceMotion || !from || !box.width) { dlg.classList.add('mui-pop-done'); return; }
            var ox = Math.max(0, Math.min(box.width, from.left + from.width / 2 - box.left));
            var oy = Math.max(0, Math.min(box.height, from.top + from.height / 2 - box.top));
            dlg.style.transformOrigin = ox + 'px ' + oy + 'px';
            var sx = Math.min(1, from.width / box.width), sy = Math.min(1, from.height / box.height);
            var grow = dlg.animate([
                { transform: 'scale(' + sx + ',' + sy + ')', opacity: .5 },
                { transform: 'none', opacity: 1 }
            ], { duration: 560, easing: SPRING });
            var content = Array.prototype.filter.call(dlg.children, function (c) { return c.offsetHeight; });
            content.forEach(function (c) { c.animate([{ opacity: 0 }, { opacity: 0, offset: .15 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' }); });
            grow.finished.then(function () { dlg.classList.add('mui-pop-done'); }, function () { });
        })();
    }

    // ---------- video player: play / pause feedback ----------

    var lastInput = 0;
    function bindPlayer() {
        if (!events || !pm) return;
        var p = pm.getCurrentPlayer ? pm.getCurrentPlayer() : null;
        if (p === player) return;
        if (player) { events.off(player, 'pause', onPause); events.off(player, 'unpause', onUnpause); }
        player = p;
        if (player) { events.on(player, 'pause', onPause); events.on(player, 'unpause', onUnpause); }
    }
    function onPause() { flash('pause'); }
    function onUnpause() { flash('play_arrow'); }
    function flash(name) {
        // only right after a click or key press in the video player, not when playback pauses by itself
        if (Date.now() - lastInput > 700 || !/^videoosd/.test(routeInfo().path) || playingAudio()) return;
        var old = document.querySelector('.mui-osd-flash');
        if (old) old.remove();
        var f = el('div', 'mui-osd-flash');
        f.appendChild(el('i', 'md-icon md-icon-fill', name));
        f.addEventListener('animationend', function () { f.remove(); });
        document.body.appendChild(f);
        setTimeout(function () { if (f.isConnected) f.remove(); }, 1200);
    }
    function onInput(e) {
        if (e.type === 'keydown') {
            if (e.key !== ' ' && e.key !== 'k' && e.key !== 'K' && e.key !== 'MediaPlayPause') return;
        } else if (e.target && e.target.closest && e.target.closest('.videoOsdBottom, .skinHeader, .dialogContainer, button')) {
            return; // the control bar has its own play button; the feedback is for clicks on the picture
        }
        lastInput = Date.now();
    }

    // ---------- start ----------

    function start() {
        try {
            listen();
        } catch (e) {
            // without the listeners the card images would never be marked loaded (and stay transparent)
            console.error('[ModernUI] not started', e);
            return;
        }
        // the stylesheet only applies from here on
        root.classList.add('mui');
        if (SETTINGS.phoneLayout !== false) root.classList.add('mui-phonelayout');
        hookEmby();
        window.ModernUI.refresh = refresh;
        // in case the page was already up when this script ran
        refresh();
    }
    function listen() {
        document.addEventListener('viewshow', onViewShow, true);
        document.addEventListener('viewbeforehide', onViewBeforeHide, true);
        document.addEventListener('viewhide', function () { setTimeout(updateSpotlights, 0); }, true);
        document.addEventListener('beforetabchange', onBeforeTabChange, true);
        document.addEventListener('tabchange', onTabChange, true);
        window.addEventListener('scroll', onDocScroll, { passive: true });
        if (phoneQuery) {
            var onPhoneWidthChange = function () {
                syncDocScroll();
                updatePageArt();
            };
            if (phoneQuery.addEventListener) phoneQuery.addEventListener('change', onPhoneWidthChange);
            else if (phoneQuery.addListener) phoneQuery.addListener(onPhoneWidthChange);
        }
        window.addEventListener('hashchange', function () { setTimeout(updateSpotlights, 50); });
        window.addEventListener('resize', function () { queueTabs(); queueNav(); onDocScroll(); });
        document.addEventListener('load', onImageEvent, true);
        document.addEventListener('error', onImageEvent, true);
        document.addEventListener('pointerup', onInput, true);
        document.addEventListener('pointerover', onPersonIntent, { passive: true });
        document.addEventListener('focusin', onPersonIntent, true);
        document.addEventListener('pointerdown', onPersonIntent, { passive: true, capture: true });
        document.addEventListener('pointerdown', notePhoneTap, { passive: true, capture: true });
        document.addEventListener('keydown', onInput, true);
        document.addEventListener('click', function (e) {
            if (!e.target || !e.target.closest) return;
            if (e.target.closest('.actionSheet')) lastPick = Date.now(); // a sort or filter pick refills the grid
            var picker = e.target.closest('.emby-select-wrapper, label.selectLabel');
            if (picker) selectOpened = { wrapper: picker.querySelector('.emby-select-wrapper') || picker, at: Date.now() };
            if (phoneEpisodeClick(e)) return;
            noteCardClick(e);
        }, true);
        document.addEventListener('scroll', function () {
            lastScroll = Date.now();
            if (tilt) endTilt();
        }, { capture: true, passive: true });
        if (finePointer) {
            document.addEventListener('pointermove', onPointerMove, { passive: true });
            document.addEventListener('pointerover', onPointerOver, { passive: true });
            document.addEventListener('pointerout', function (e) {
                if (e.relatedTarget) return;
                // the pointer left the window
                if (tilt) endTilt();
                hoverCard = pinnedCard = null;
                clearTimeout(hoverTimer);
            }, { passive: true });
        }
        if (window.MutationObserver) {
            new MutationObserver(function (records) {
                var cards = [], refilled = [], now = Date.now(), tabsFaded = false;
                records.forEach(function (rec) {
                    homeAlbumTitles(rec.target);
                    // the version picker's options are filled in as <option>s of the select, or the select arrives whole
                    if (rec.target.classList && rec.target.classList.contains('selectSource')) shortVersionNames(rec.target);
                    rec.addedNodes.forEach(function (n) {
                        if (n.nodeType !== 1) return;
                        if (n.classList.contains('selectSource') || (n.firstElementChild && n.querySelector('select.selectSource'))) shortVersionNames(n);
                        if (selectOpened) {
                            var sheet = n.classList.contains('actionSheet') ? n : n.firstElementChild && n.querySelector('.actionSheet');
                            if (sheet) alignSelectMenu(sheet);
                        }
                        if (n.classList.contains('verticalSection') || n.querySelector('.verticalSection')) homeAlbumTitles(n);
                        if (isCardImage(n)) { checkImg(n); return; }
                        var cl = n.classList;
                        if (cl.contains('nowPlayingBar') || cl.contains('nowPlayingBarTop')) arrangeBar(n.closest('.nowPlayingBar'));
                        var pop = cl.contains('mui-popover') ? n : n.firstElementChild && n.querySelector('.actionSheet.mui-popover');
                        if (pop) morphPopover(pop);
                        queueGlass();
                        if (rec.target.classList && rec.target.classList.contains('creditsSubSections')) emptyCredits(n);
                        // a new set of header tabs (another page) fades in, before it is first painted
                        if (!tabsFaded && (cl.contains('emby-tab-button') || (n.firstElementChild && n.querySelector('.emby-tab-button')))) {
                            var bar = n.closest('.tabs-viewmenubar');
                            if (bar) { tabsFaded = true; fadeIn(bar.querySelector('.emby-tabs-slider') || bar, 0, 320); }
                        }
                        if (!n.firstElementChild) return;
                        n.querySelectorAll('img.cardImage').forEach(checkImg);
                        if (cl.contains('cardBox') && rec.target.classList && rec.target.classList.contains('virtualScrollItem')) refilled.push(rec.target);
                        else if (now < revealUntil) {
                            if (cl.contains('card')) cards.push(n);
                            else n.querySelectorAll('.card').forEach(function (c) { cards.push(c); });
                        }
                    });
                });
                if (cards.length) queueReveal(cards);
                // A virtual grid reuses its cards. A whole batch refilled while nobody scrolls is a new sort or
                // filter (or data that arrived late), not scrolling: those rise in again. Not on phones (no cards
                // rise in there), nor while a page waits to come in (its cards come with it).
                if (refilled.length && !isPhone() && !holding) {
                    if (now < revealUntil) queueReveal(refilled);
                    else if (refilled.length >= 6 && (now - lastScroll > 300 || now - lastPick < 1500)) queueReveal(refilled, true);
                }
                checkChoreo();
            }).observe(document.body, { childList: true, subtree: true });
        }
    }
    function refresh() {
        arrangeBar(document.querySelector('.nowPlayingBar'));
        queueGlass();
        var view = document.querySelector('.view:not(.hide)');
        if (view) afterShow(view, routeInfo());
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
