/*
 * Emby web client cache, written over Emby's empty serviceworker.js by the BetterTheEmby plugin.
 * Emby serves its web client files with "Cache-Control: public" and no lifetime, so browsers ask the server
 * again for every one of ~200 files on each page load. The files carry the server version (?v=4.9.5.0), so
 * they can be kept until that changes:
 * - web client files with a version (?v=4.9.5.0, or ?v=<hash> for the plugin's own files): cache first
 * - fonts and theme images without a version: served from cache, refreshed in the background
 * Everything else (index.html, the API, artwork, video and audio) goes to the network as before. Artwork
 * already comes with a one-year lifetime from Emby, so the browser's normal cache keeps it.
 */
var STATIC = 'mui-static-1';
var MAX_ENTRIES = 1500;

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) {
            return k.indexOf('mui-') === 0 && k !== STATIC;
        }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

// a server version or a content hash, not a timestamp that changes on every load
function stableVersion(v) {
    return /^\d+(\.\d+){1,3}$/.test(v) || /^[0-9a-f]{8,40}$/i.test(v);
}

function kindOf(request) {
    if (request.method !== 'GET' || request.headers.has('range')) return null;
    var url = new URL(request.url);
    if (url.origin !== self.location.origin) return null;
    var path = url.pathname, webRoot = self.location.pathname.replace(/[^/]*$/, '');
    if (path.indexOf(webRoot) !== 0 || /\/serviceworker[^/]*\.js$/i.test(path)) return null;
    if (!/\.(js|css|json|woff2?|ttf|otf|png|svg|jpe?g|gif|webp|ico)$/i.test(path)) return null;
    var v = url.searchParams.get('v');
    if (v) return stableVersion(v) ? 'versioned' : null;
    // unversioned code could mix with a newer server's files, so only fonts and pictures are kept that way
    return !url.search && /\.(woff2?|ttf|otf|png|svg|jpe?g|gif|webp|ico)$/i.test(path) ? 'asset' : null;
}

var puts = 0;
function store(request, response) {
    if (!response || response.status !== 200 || response.type !== 'basic') return;
    var copy = response.clone();
    caches.open(STATIC).then(function (cache) {
        return cache.put(request, copy).then(function () {
            // keep the cache bounded: now and then drop the oldest entries
            if (++puts % 50 === 0) return cache.keys().then(function (keys) {
                var extra = keys.length - MAX_ENTRIES;
                if (extra > 0) return Promise.all(keys.slice(0, extra + 100).map(function (k) { return cache.delete(k); }));
            });
        });
    }).catch(function () { });
}

function fromCache(request) {
    return caches.open(STATIC).then(function (cache) { return cache.match(request, { ignoreVary: true }); });
}

function cacheFirst(request) {
    return fromCache(request).then(function (hit) {
        return hit || fetch(request).then(function (response) { store(request, response); return response; });
    }, function () { return fetch(request); });
}

function staleWhileRevalidate(request, event) {
    return fromCache(request).then(function (hit) {
        var refresh = fetch(request).then(function (response) { store(request, response); return response; });
        if (!hit) return refresh;
        event.waitUntil(refresh.catch(function () { }));
        return hit;
    }, function () { return fetch(request); });
}

self.addEventListener('fetch', function (event) {
    var kind;
    try { kind = kindOf(event.request); } catch (e) { return; }
    if (kind === 'versioned') event.respondWith(cacheFirst(event.request));
    else if (kind === 'asset') event.respondWith(staleWhileRevalidate(event.request, event));
});
