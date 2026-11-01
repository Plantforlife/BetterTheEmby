using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Configuration;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Providers;

namespace BetterTheEmby.NetEase
{
    // Response shapes of NetEase Cloud Music's web API, only the fields that are read.

    public class NeArtist
    {
        public long id { get; set; }
        public string name { get; set; }
        public string picUrl { get; set; }
        public string img1v1Url { get; set; }
        public string[] alias { get; set; }
        public string trans { get; set; }
        public string[] transNames { get; set; }
        public string briefDesc { get; set; }
    }

    public class NeAlbum
    {
        public long id { get; set; }
        public string name { get; set; }
        public string picUrl { get; set; }
        public long publishTime { get; set; }
        public string company { get; set; }
        public string description { get; set; }
        public string briefDesc { get; set; }
        public string[] alias { get; set; }
        public NeArtist artist { get; set; }
        public NeArtist[] artists { get; set; }
    }

    // every answer carries a code: 200, or a refusal such as 405 "操作频繁，请稍候再试" (too many requests)
    public class NeResponse { public int code { get; set; } public string message { get; set; } }
    public class NeArtistSearch : NeResponse { public NeArtistSearchResult result { get; set; } }
    public class NeArtistSearchResult { public NeArtist[] artists { get; set; } }
    public class NeAlbumSearch : NeResponse { public NeAlbumSearchResult result { get; set; } }
    public class NeAlbumSearchResult { public NeAlbum[] albums { get; set; } }
    public class NeArtistDetail : NeResponse { public NeArtist artist { get; set; } }
    public class NeAlbumDetail : NeResponse { public NeAlbum album { get; set; } }
    public class NeIntroSection { public string ti { get; set; } public string txt { get; set; } }
    public class NeIntro : NeResponse { public string briefDesc { get; set; } public NeIntroSection[] introduction { get; set; } }

    /// <summary>
    /// Talks to music.163.com and decides which NetEase artist or album a library item is. Matching is strict on purpose: a wrong photo or
    /// biography is worse than none, so an item is only matched on its exact name (or a NetEase alias), and names
    /// that stand for several artists ("A & B") are left alone.
    ///
    /// It uses the plain web endpoints (api/...), which need no login. NetEase limits how often one client asks
    /// (see AnyAddress and the NetEaseSpacingMs / NetEaseRotateAddress settings). If it refuses anyway and the plugin settings hold a signed-in cookie, the same lookup goes
    /// to the encrypted endpoints the web player itself calls (weapi/...), which have a limit of their own.
    /// </summary>
    public class NetEaseClient
    {
        public const string ProviderName = "NetEase Music";
        public const string ArtistKey = "NetEaseArtist";
        public const string AlbumKey = "NetEaseAlbum";

        private const string Base = "https://music.163.com/";
        private const string UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
        // NetEase's grey placeholder face, given to artists without a photo
        private const string PlaceholderImageId = "5639395138885805";

        // One request at a time, with a pause in between, and the answers kept for a while (a refresh asks the
        // metadata and the image provider about the same artist right after each other). NetEase refuses a whole
        // IP address for a while (code 405) once it sees too many requests: a refresh of a whole library at three
        // requests a second did that. A refusal is not kept, and NetEase is left alone for a few minutes after one.
        // the pause between two lookups (plugin settings, 500 ms to 10 s)
        private static TimeSpan Spacing => TimeSpan.FromMilliseconds(Math.Max(500, Math.Min(10000, Plugin.Instance?.Configuration?.NetEaseSpacingMs ?? 1500)));
        private static readonly TimeSpan CoolDown = TimeSpan.FromMinutes(5);
        private static readonly SemaphoreSlim Gate = new SemaphoreSlim(1, 1);
        private static readonly ConcurrentDictionary<string, KeyValuePair<DateTime, object>> Cache = new ConcurrentDictionary<string, KeyValuePair<DateTime, object>>();
        private static DateTime _lastRequest = DateTime.MinValue;
        private static DateTime _refusedUntil = DateTime.MinValue;

        private static readonly Regex SeveralArtists = new Regex(@"\s&\s|,\s|，|、|\s(feat|ft)\.?\s|\sx\s|/", RegexOptions.IgnoreCase);
        private static readonly Regex Bracketed = new Regex(@"\s*[\(（\[【][^\)）\]】]*[\)）\]】]\s*");

        // .NET's own JSON reader (part of the runtime Emby runs on), so the plugin doesn't depend on Emby's
        // serializer for a foreign API
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };

        private readonly IHttpClient _http;
        private readonly ILogger _logger;

        public NetEaseClient(IHttpClient http, ILogger logger)
        {
            _http = http;
            _logger = logger;
        }

        public HttpRequestOptions Options(string url, CancellationToken cancellationToken)
        {
            var options = new HttpRequestOptions
            {
                Url = url,
                CancellationToken = cancellationToken,
                UserAgent = UserAgent,
                Referer = Base,
                EnableDefaultUserAgent = false,
                TimeoutMs = 20000,
                LogErrors = false
            };
            return options;
        }

        // The whole Cookie header as copied from the browser, or just the MUSIC_U value; null without one, or once
        // NetEase has said this cookie isn't signed in any more.
        private static string SessionCookie()
        {
            var value = Plugin.Instance?.Configuration?.NetEaseCookie;
            if (string.IsNullOrWhiteSpace(value)) return null;
            value = Regex.Replace(value.Trim(), @"^cookie:\s*", string.Empty, RegexOptions.IgnoreCase).Replace("\r", string.Empty).Replace("\n", string.Empty);
            if (!value.Contains("=")) value = "MUSIC_U=" + value;
            return value == _rejectedCookie ? null : value;
        }

        private static string _rejectedCookie;

        // weapi request encryption, as the web player does it: the JSON body is AES-CBC encrypted with a fixed key,
        // then again with a second key, which goes along RSA-encrypted with NetEase's public key. A fixed second key
        // works as well as a random one, so its encrypted form is worked out once.
        private const string PresetKey = "0CoJUm6Qyw8W8jud";
        private const string SecondKey = "aT7kQm2Lx9Vb4RcE";
        private const string PublicModulus = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
        private static readonly Lazy<string> EncSecKey = new Lazy<string>(() =>
        {
            var reversed = string.Concat(SecondKey.Reverse().Select(c => ((int)c).ToString("x2")));
            var value = BigInteger.ModPow(BigInteger.Parse("0" + reversed, NumberStyles.HexNumber), 65537, BigInteger.Parse(PublicModulus, NumberStyles.HexNumber));
            return value.ToString("x").TrimStart('0').PadLeft(256, '0');
        });

        private static string AesBase64(string text, string key)
        {
            using (var aes = Aes.Create())
            {
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;
                aes.Key = Encoding.UTF8.GetBytes(key);
                aes.IV = Encoding.UTF8.GetBytes("0102030405060708");
                var data = Encoding.UTF8.GetBytes(text);
                using (var encryptor = aes.CreateEncryptor()) return Convert.ToBase64String(encryptor.TransformFinalBlock(data, 0, data.Length));
            }
        }

        private static string WeapiForm(Dictionary<string, string> body)
        {
            var parameters = AesBase64(AesBase64(JsonSerializer.Serialize(body), PresetKey), SecondKey);
            return "params=" + Uri.EscapeDataString(parameters) + "&encSecKey=" + EncSecKey.Value;
        }

        // NetEase counts requests by the client address it is told about in X-Real-IP / X-Forwarded-For, not by
        // the connection's: the plain endpoints refused a server after ten lookups and kept answering the same
        // requests carrying another (mainland) address. With NetEaseRotateAddress on (off by default), every
        // request names a different one. Lookups stay one at a time and spaced out either way.
        private static readonly int[] MainlandBlocks = { 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 180, 182, 183, 218, 220, 221, 222, 223 };
        private static readonly Random Rng = new Random();
        private static string AnyAddress()
        {
            lock (Rng)
            {
                return MainlandBlocks[Rng.Next(MainlandBlocks.Length)] + "." + Rng.Next(1, 255) + "." + Rng.Next(1, 255) + "." + Rng.Next(1, 255);
            }
        }

        private static bool Refused(NeResponse value) => value == null || (value.code != 0 && value.code != 200);

        // path: the plain endpoint, tried first; weapiPath and body: the same lookup on the encrypted endpoint,
        // tried with the signed-in cookie (if one is set) when the plain one refuses
        private async Task<T> Get<T>(string path, string weapiPath, Dictionary<string, string> body, CancellationToken cancellationToken) where T : NeResponse
        {
            var url = Base + path;
            if (Cache.TryGetValue(url, out var hit) && DateTime.UtcNow - hit.Key < TimeSpan.FromHours(6)) return hit.Value as T;
            if (DateTime.UtcNow < _refusedUntil) return null;
            await Gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                if (DateTime.UtcNow < _refusedUntil) return null;
                var value = await Send<T>(url, null, null, null, cancellationToken).ConfigureAwait(false);
                var cookie = SessionCookie();
                if (Refused(value) && cookie != null)
                {
                    var plainCode = value?.code;
                    value = await Send<T>(url, weapiPath, body, cookie, cancellationToken).ConfigureAwait(false);
                    if (value != null && (value.code == 301 || value.code == 50000005))
                    {
                        // signed out (expired, or logged out in the browser): no more tries with it until a new one is saved
                        _rejectedCookie = cookie;
                        _logger.Warn("NetEase: the cookie in the plugin settings is not signed in any more ({0})", value.code);
                        value = null;
                    }
                    else if (!Refused(value)) _logger.Info("NetEase: {0} refused ({1}), answered with the signed-in session", path, plainCode);
                }
                if (Refused(value))
                {
                    _refusedUntil = DateTime.UtcNow + CoolDown;
                    _logger.Warn("NetEase refused {0} ({1} {2}); pausing NetEase lookups for {3} minutes", path, value?.code, value?.message, CoolDown.TotalMinutes);
                    return null;
                }
                Cache[url] = new KeyValuePair<DateTime, object>(DateTime.UtcNow, value);
                return value;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _lastRequest = DateTime.UtcNow;
                _logger.Warn("NetEase: {0} failed: {1}", path, ex.Message);
                return null;
            }
            finally
            {
                Gate.Release();
            }
        }

        // one request, spaced from the last; inside the gate
        private async Task<T> Send<T>(string url, string weapiPath, Dictionary<string, string> body, string cookie, CancellationToken cancellationToken) where T : NeResponse
        {
            var wait = Spacing - (DateTime.UtcNow - _lastRequest);
            if (wait > TimeSpan.Zero) await Task.Delay(wait, cancellationToken).ConfigureAwait(false);
            var options = Options(url, cancellationToken);
            if (Plugin.Instance?.Configuration?.NetEaseRotateAddress == true)
            {
                var address = AnyAddress();
                options.RequestHeaders["X-Real-IP"] = address;
                options.RequestHeaders["X-Forwarded-For"] = address;
            }
            if (cookie != null)
            {
                var csrf = Regex.Match(cookie, @"(?:^|;\s*)__csrf=([0-9a-f]+)").Groups[1].Value;
                body["csrf_token"] = csrf;
                options.Url = Base + "weapi/" + weapiPath + "?csrf_token=" + csrf;
                options.RequestHeaders["Cookie"] = cookie;
                options.RequestContentType = "application/x-www-form-urlencoded";
                options.RequestContent = WeapiForm(body).AsMemory();
            }
            using (var response = cookie != null
                ? await _http.SendAsync(options, "POST").ConfigureAwait(false)
                : await _http.GetResponse(options).ConfigureAwait(false))
            {
                _lastRequest = DateTime.UtcNow;
                return await JsonSerializer.DeserializeAsync<T>(response.Content, JsonOptions, cancellationToken).ConfigureAwait(false);
            }
        }

        private static string Id(long id) => id.ToString(CultureInfo.InvariantCulture);

        private static Dictionary<string, string> Search(string query, string type)
        {
            return new Dictionary<string, string> { ["s"] = query, ["type"] = type, ["limit"] = "10", ["offset"] = "0" };
        }

        public async Task<NeArtist[]> SearchArtists(string query, CancellationToken cancellationToken)
        {
            var found = await Get<NeArtistSearch>("api/search/get/web?type=100&limit=10&s=" + Uri.EscapeDataString(query), "search/get", Search(query, "100"), cancellationToken).ConfigureAwait(false);
            return found?.result?.artists ?? new NeArtist[0];
        }

        public async Task<NeArtist> GetArtist(string id, CancellationToken cancellationToken)
        {
            return (await Get<NeArtistDetail>("api/v1/artist/" + Uri.EscapeDataString(id), "v1/artist/" + Uri.EscapeDataString(id), new Dictionary<string, string>(), cancellationToken).ConfigureAwait(false))?.artist;
        }

        public Task<NeIntro> GetIntroduction(long id, CancellationToken cancellationToken)
        {
            return Get<NeIntro>("api/artist/introduction?id=" + Id(id), "artist/introduction", new Dictionary<string, string> { ["id"] = Id(id) }, cancellationToken);
        }

        public async Task<NeAlbum[]> SearchAlbums(string query, CancellationToken cancellationToken)
        {
            var found = await Get<NeAlbumSearch>("api/search/get/web?type=10&limit=10&s=" + Uri.EscapeDataString(query), "search/get", Search(query, "10"), cancellationToken).ConfigureAwait(false);
            return found?.result?.albums ?? new NeAlbum[0];
        }

        public async Task<NeAlbum> GetAlbum(string id, CancellationToken cancellationToken)
        {
            return (await Get<NeAlbumDetail>("api/album/" + Uri.EscapeDataString(id), "v1/album/" + Uri.EscapeDataString(id), new Dictionary<string, string>(), cancellationToken).ConfigureAwait(false))?.album;
        }

        /// <summary>The artist with this NetEase id, or the one whose name matches exactly.</summary>
        public async Task<NeArtist> FindArtist(string name, string knownId, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrEmpty(knownId)) return await GetArtist(knownId, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(name) || SeveralArtists.IsMatch(name)) return null;
            // "路南 Lunan (HOYO-MiX)": try the whole name, then without the group, then the native name alone
            var bare = Bracketed.Replace(name, " ").Trim();
            var queries = new List<string> { name.Trim(), bare };
            var space = bare.IndexOf(' ');
            if (space > 0) queries.Add(bare.Substring(0, space));
            foreach (var query in queries.Where(q => q.Length > 0).Distinct())
            {
                var hit = PickArtist(name, await SearchArtists(query, cancellationToken).ConfigureAwait(false));
                if (hit != null) return hit;
            }
            return null;
        }

        /// <summary>The album with this NetEase id, or one with exactly this title by one of these artists.</summary>
        public async Task<NeAlbum> FindAlbum(string title, string[] artists, string knownId, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrEmpty(knownId)) return await GetAlbum(knownId, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(title)) return null;
            var queries = new List<string>();
            var lead = (artists ?? new string[0]).FirstOrDefault(a => !string.IsNullOrWhiteSpace(a));
            if (lead != null) queries.Add(title.Trim() + " " + SeveralArtists.Split(lead)[0].Trim());
            queries.Add(title.Trim());
            foreach (var query in queries.Distinct())
            {
                var hit = PickAlbum(title, artists, await SearchAlbums(query, cancellationToken).ConfigureAwait(false));
                if (hit != null) return hit;
            }
            return null;
        }

        // names compared the way people write them: case, width, spaces and punctuation don't count
        public static string Norm(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return string.Empty;
            s = s.Normalize(NormalizationForm.FormKC).ToLowerInvariant();
            var sb = new StringBuilder(s.Length);
            foreach (var c in s)
            {
                if (char.IsLetterOrDigit(c)) sb.Append(c);
            }
            return sb.ToString();
        }

        private static IEnumerable<string> NamesOf(NeArtist a)
        {
            return new[] { a.name, a.trans }.Concat(a.alias ?? new string[0]).Concat(a.transNames ?? new string[0]).Select(Norm).Where(n => n.Length > 0);
        }

        public static NeArtist PickArtist(string name, IEnumerable<NeArtist> found)
        {
            var list = (found ?? Enumerable.Empty<NeArtist>()).Where(a => a != null).ToList();
            var full = Norm(name);
            if (full.Length == 0) return null;
            var exact = list.FirstOrDefault(a => NamesOf(a).Contains(full));
            if (exact != null) return exact;
            var bare = Bracketed.Replace(name, " ").Trim();
            // a native name plus the romanized one, which NetEase keeps as an alias or translation
            var parts = bare.Split(new[] { ' ' }, 2, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 2)
            {
                string native = Norm(parts[0]), latin = Norm(parts[1]);
                var both = list.FirstOrDefault(a => Norm(a.name) == native && NamesOf(a).Contains(latin));
                if (both != null) return both;
            }
            var b = Norm(bare);
            return b != full ? list.FirstOrDefault(a => NamesOf(a).Contains(b)) : null;
        }

        public static NeAlbum PickAlbum(string title, string[] artists, IEnumerable<NeAlbum> found)
        {
            var want = Norm(title);
            if (want.Length == 0) return null;
            var by = (artists ?? new string[0]).Select(Norm).Where(n => n.Length > 0).ToList();
            foreach (var album in found ?? Enumerable.Empty<NeAlbum>())
            {
                if (album == null) continue;
                if (!new[] { album.name }.Concat(album.alias ?? new string[0]).Select(Norm).Contains(want)) continue;
                if (by.Count == 0) return album;
                var credited = new[] { album.artist }.Concat(album.artists ?? new NeArtist[0]).Where(a => a != null).SelectMany(NamesOf).ToList();
                // "陈粒 & 张小蜀" counts for 陈粒
                if (credited.Any(c => by.Any(w => w == c || (c.Length >= 2 && w.Contains(c))))) return album;
            }
            return null;
        }

        public static string Https(string url)
        {
            if (string.IsNullOrEmpty(url) || url.Contains(PlaceholderImageId)) return null;
            return url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ? "https://" + url.Substring(7) : url;
        }

        // the square photo first (what NetEase shows as the avatar), the main photo as the alternative
        public static IEnumerable<string> ArtistPhotos(NeArtist a)
        {
            if (a == null) return Enumerable.Empty<string>();
            return new[] { Https(a.img1v1Url), Https(a.picUrl) }.Where(u => u != null).Distinct();
        }

        public static string ArtistOverview(NeIntro intro, NeArtist artist)
        {
            var parts = new List<string>();
            var brief = (intro?.briefDesc ?? artist?.briefDesc ?? string.Empty).Trim();
            if (brief.Length > 0) parts.Add(brief);
            foreach (var section in intro?.introduction ?? new NeIntroSection[0])
            {
                var text = (section?.txt ?? string.Empty).Trim();
                if (text.Length == 0 || text == brief) continue;
                var heading = (section.ti ?? string.Empty).Trim();
                parts.Add(heading.Length > 0 ? heading + "\n" + text : text);
            }
            return parts.Count > 0 ? string.Join("\n\n", parts) : null;
        }

        // NetEase gives the release day as midnight China time, in milliseconds
        public static DateTime? ReleaseDate(long publishTime)
        {
            if (publishTime <= 0) return null;
            var day = DateTimeOffset.FromUnixTimeMilliseconds(publishTime).UtcDateTime.AddHours(8).Date;
            return DateTime.SpecifyKind(day, DateTimeKind.Utc);
        }
    }

    /// <summary>Artist biography from NetEase.</summary>
    public class NetEaseArtistProvider : IRemoteMetadataProvider<MusicArtist, ArtistInfo>
    {
        private readonly IHttpClient _http;
        private readonly NetEaseClient _netEase;

        public NetEaseArtistProvider(IHttpClient http, ILogManager logManager)
        {
            _http = http;
            _netEase = new NetEaseClient(http, logManager.GetLogger("BetterTheEmby"));
        }

        public string Name => NetEaseClient.ProviderName;

        public async Task<MetadataResult<MusicArtist>> GetMetadata(ArtistInfo info, CancellationToken cancellationToken)
        {
            var result = new MetadataResult<MusicArtist>();
            var artist = await _netEase.FindArtist(info.Name, info.GetProviderId(NetEaseClient.ArtistKey), cancellationToken).ConfigureAwait(false);
            if (artist == null || artist.id <= 0) return result;
            var intro = await _netEase.GetIntroduction(artist.id, cancellationToken).ConfigureAwait(false);
            var item = new MusicArtist { Name = info.Name, Overview = NetEaseClient.ArtistOverview(intro, artist) };
            item.SetProviderId(NetEaseClient.ArtistKey, artist.id.ToString(CultureInfo.InvariantCulture));
            result.Item = item;
            result.HasMetadata = true;
            return result;
        }

        public async Task<IEnumerable<RemoteSearchResult>> GetSearchResults(ArtistInfo searchInfo, CancellationToken cancellationToken)
        {
            var id = searchInfo.GetProviderId(NetEaseClient.ArtistKey);
            var found = !string.IsNullOrEmpty(id)
                ? new[] { await _netEase.GetArtist(id, cancellationToken).ConfigureAwait(false) }
                : await _netEase.SearchArtists(searchInfo.Name ?? string.Empty, cancellationToken).ConfigureAwait(false);
            return found.Where(a => a != null && a.id > 0).Select(a =>
            {
                var r = new RemoteSearchResult { Name = a.name, ImageUrl = NetEaseClient.ArtistPhotos(a).FirstOrDefault(), SearchProviderName = Name, Overview = a.briefDesc };
                r.SetProviderId(NetEaseClient.ArtistKey, a.id.ToString(CultureInfo.InvariantCulture));
                return r;
            }).ToList();
        }

        public Task<HttpResponseInfo> GetImageResponse(string url, CancellationToken cancellationToken)
        {
            return _http.GetResponse(_netEase.Options(url, cancellationToken));
        }
    }

    /// <summary>Album description, release date and label from NetEase (Emby keeps what the album already has).</summary>
    public class NetEaseAlbumProvider : IRemoteMetadataProvider<MusicAlbum, AlbumInfo>
    {
        private readonly IHttpClient _http;
        private readonly NetEaseClient _netEase;

        public NetEaseAlbumProvider(IHttpClient http, ILogManager logManager)
        {
            _http = http;
            _netEase = new NetEaseClient(http, logManager.GetLogger("BetterTheEmby"));
        }

        public string Name => NetEaseClient.ProviderName;

        public async Task<MetadataResult<MusicAlbum>> GetMetadata(AlbumInfo info, CancellationToken cancellationToken)
        {
            var result = new MetadataResult<MusicAlbum>();
            var album = await _netEase.FindAlbum(info.Name, info.AlbumArtists, info.GetProviderId(NetEaseClient.AlbumKey), cancellationToken).ConfigureAwait(false);
            if (album == null || album.id <= 0) return result;
            // the search hit has no description; the album itself does
            var detail = await _netEase.GetAlbum(album.id.ToString(CultureInfo.InvariantCulture), cancellationToken).ConfigureAwait(false) ?? album;
            var item = new MusicAlbum { Name = info.Name };
            var text = (detail.description ?? detail.briefDesc ?? string.Empty).Trim();
            if (text.Length > 0) item.Overview = text;
            var released = NetEaseClient.ReleaseDate(detail.publishTime > 0 ? detail.publishTime : album.publishTime);
            if (released.HasValue)
            {
                item.PremiereDate = released;
                item.ProductionYear = released.Value.Year;
            }
            var label = (detail.company ?? album.company ?? string.Empty).Trim();
            if (label.Length > 0) item.SetStudios(new[] { label });
            item.SetProviderId(NetEaseClient.AlbumKey, album.id.ToString(CultureInfo.InvariantCulture));
            result.Item = item;
            result.HasMetadata = true;
            return result;
        }

        public async Task<IEnumerable<RemoteSearchResult>> GetSearchResults(AlbumInfo searchInfo, CancellationToken cancellationToken)
        {
            var id = searchInfo.GetProviderId(NetEaseClient.AlbumKey);
            var found = !string.IsNullOrEmpty(id)
                ? new[] { await _netEase.GetAlbum(id, cancellationToken).ConfigureAwait(false) }
                : await _netEase.SearchAlbums(((searchInfo.Name ?? string.Empty) + " " + (searchInfo.AlbumArtists?.FirstOrDefault() ?? string.Empty)).Trim(), cancellationToken).ConfigureAwait(false);
            return found.Where(a => a != null && a.id > 0).Select(a =>
            {
                var released = NetEaseClient.ReleaseDate(a.publishTime);
                var r = new RemoteSearchResult
                {
                    Name = a.name,
                    ImageUrl = NetEaseClient.Https(a.picUrl),
                    SearchProviderName = Name,
                    PremiereDate = released,
                    ProductionYear = released?.Year,
                    AlbumArtist = a.artist == null ? null : new RemoteSearchResult { Name = a.artist.name, SearchProviderName = Name }
                };
                r.SetProviderId(NetEaseClient.AlbumKey, a.id.ToString(CultureInfo.InvariantCulture));
                return r;
            }).ToList();
        }

        public Task<HttpResponseInfo> GetImageResponse(string url, CancellationToken cancellationToken)
        {
            return _http.GetResponse(_netEase.Options(url, cancellationToken));
        }
    }

    /// <summary>Artist photos and album covers from NetEase.</summary>
    public class NetEaseImageProvider : IRemoteImageProvider
    {
        private readonly IHttpClient _http;
        private readonly NetEaseClient _netEase;

        public NetEaseImageProvider(IHttpClient http, ILogManager logManager)
        {
            _http = http;
            _netEase = new NetEaseClient(http, logManager.GetLogger("BetterTheEmby"));
        }

        public string Name => NetEaseClient.ProviderName;

        public bool Supports(BaseItem item) => item is MusicArtist || item is MusicAlbum;

        public IEnumerable<ImageType> GetSupportedImages(BaseItem item) => new[] { ImageType.Primary };

        public async Task<IEnumerable<RemoteImageInfo>> GetImages(BaseItem item, LibraryOptions libraryOptions, CancellationToken cancellationToken)
        {
            var images = new List<RemoteImageInfo>();
            if (item is MusicArtist)
            {
                var artist = await _netEase.FindArtist(item.Name, item.GetProviderId(NetEaseClient.ArtistKey), cancellationToken).ConfigureAwait(false);
                images.AddRange(NetEaseClient.ArtistPhotos(artist).Select(url => new RemoteImageInfo { ProviderName = Name, Url = url, Type = ImageType.Primary }));
            }
            else if (item is MusicAlbum album)
            {
                var found = await _netEase.FindAlbum(album.Name, album.AlbumArtists, album.GetProviderId(NetEaseClient.AlbumKey), cancellationToken).ConfigureAwait(false);
                var cover = NetEaseClient.Https(found?.picUrl);
                if (cover != null) images.Add(new RemoteImageInfo { ProviderName = Name, Url = cover, Type = ImageType.Primary });
            }
            return images;
        }

        public Task<HttpResponseInfo> GetImageResponse(string url, CancellationToken cancellationToken)
        {
            return _http.GetResponse(_netEase.Options(url, cancellationToken));
        }
    }

    public class NetEaseArtistExternalId : IExternalId
    {
        public string Name => NetEaseClient.ProviderName;
        public string Key => NetEaseClient.ArtistKey;
        public string UrlFormatString => "https://music.163.com/#/artist?id={0}";
        public bool Supports(IHasProviderIds item) => item is MusicArtist;
    }

    public class NetEaseAlbumExternalId : IExternalId
    {
        public string Name => NetEaseClient.ProviderName;
        public string Key => NetEaseClient.AlbumKey;
        public string UrlFormatString => "https://music.163.com/#/album?id={0}";
        public bool Supports(IHasProviderIds item) => item is MusicAlbum;
    }
}
