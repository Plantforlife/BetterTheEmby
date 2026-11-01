using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using BetterTheEmby.NetEase;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Configuration;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Providers;

namespace BetterTheEmby.Apple
{
    // the fields of an iTunes Search API result that are read
    public class ItSearch { public ItResult[] results { get; set; } }

    public class ItResult
    {
        public long collectionId { get; set; }
        public string collectionName { get; set; }
        public string artistName { get; set; }
        public string artworkUrl100 { get; set; }
        public string releaseDate { get; set; }
        public string primaryGenreName { get; set; }
        public string copyright { get; set; }
    }

    /// <summary>
    /// Album facts from Apple Music through the public iTunes Search API (no account or key), for what NetEase
    /// doesn't have. Apple has no artist photos or biographies there, so this only covers albums: release date,
    /// genre, label and cover. The Taiwan and Hong Kong stores carry the Chinese catalogue (the China store answers
    /// searches with nothing), with titles in traditional characters, so titles may differ in variant characters.
    /// </summary>
    public class AppleMusicClient
    {
        public const string ProviderName = "Apple Music";
        public const string AlbumKey = "AppleMusicAlbum";

        private static readonly string[] Stores = { "tw", "hk", "us" };
        // Apple allows about 20 searches a minute
        private static readonly TimeSpan Spacing = TimeSpan.FromSeconds(3);
        private static readonly SemaphoreSlim Gate = new SemaphoreSlim(1, 1);
        private static readonly ConcurrentDictionary<string, KeyValuePair<DateTime, ItSearch>> Cache = new ConcurrentDictionary<string, KeyValuePair<DateTime, ItSearch>>();
        private static DateTime _lastRequest = DateTime.MinValue;
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        private static readonly Regex CopyrightPrefix = new Regex(@"^\s*(℗|©|\(p\)|\(c\))?\s*(\d{4}\s*)?", RegexOptions.IgnoreCase);
        private static readonly Regex SeveralArtists = new Regex(@"\s&\s|,\s|，|、|\s(feat|ft)\.?\s|/", RegexOptions.IgnoreCase);

        private readonly IHttpClient _http;
        private readonly ILogger _logger;

        public AppleMusicClient(IHttpClient http, ILogger logger)
        {
            _http = http;
            _logger = logger;
        }

        public HttpRequestOptions Options(string url, CancellationToken cancellationToken)
        {
            return new HttpRequestOptions { Url = url, CancellationToken = cancellationToken, TimeoutMs = 20000, LogErrors = false };
        }

        private async Task<ItSearch> Search(string term, string store, CancellationToken cancellationToken)
        {
            var url = "https://itunes.apple.com/search?entity=album&limit=10&country=" + store + "&term=" + Uri.EscapeDataString(term);
            if (Cache.TryGetValue(url, out var hit) && DateTime.UtcNow - hit.Key < TimeSpan.FromHours(6)) return hit.Value;
            await Gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                var wait = Spacing - (DateTime.UtcNow - _lastRequest);
                if (wait > TimeSpan.Zero) await Task.Delay(wait, cancellationToken).ConfigureAwait(false);
                using (var response = await _http.GetResponse(Options(url, cancellationToken)).ConfigureAwait(false))
                {
                    _lastRequest = DateTime.UtcNow;
                    var value = await JsonSerializer.DeserializeAsync<ItSearch>(response.Content, JsonOptions, cancellationToken).ConfigureAwait(false);
                    if (value?.results != null) Cache[url] = new KeyValuePair<DateTime, ItSearch>(DateTime.UtcNow, value);
                    return value;
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _lastRequest = DateTime.UtcNow;
                _logger.Warn("Apple Music: search failed ({0}): {1}", store, ex.Message);
                return null;
            }
            finally
            {
                Gate.Release();
            }
        }

        private static bool IsCjk(char c) => c >= '㐀' && c <= '鿿';

        // The same title, allowing traditional and simplified variants (回到未來 / 回到未来, 醜奴兒 / 丑奴儿): same
        // length, and only Chinese characters may differ, at most half of them. Callers also require the artist
        // (and the year, when known) to match, which is what keeps this from pairing up different titles.
        public static bool Close(string a, string b)
        {
            a = NetEaseClient.Norm(a);
            b = NetEaseClient.Norm(b);
            if (a.Length == 0 || b.Length == 0) return false;
            if (a == b) return true;
            if (a.Length != b.Length || a.Length < 2) return false;
            var diff = 0;
            for (var i = 0; i < a.Length; i++)
            {
                if (a[i] == b[i]) continue;
                if (!IsCjk(a[i]) || !IsCjk(b[i])) return false;
                diff++;
            }
            return diff <= (a.Length + 1) / 2;
        }

        public async Task<ItResult> FindAlbum(string title, string[] artists, int? year, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(title)) return null;
            var names = (artists ?? new string[0]).Where(a => !string.IsNullOrWhiteSpace(a)).SelectMany(a => SeveralArtists.Split(a)).Select(a => a.Trim()).Where(a => a.Length > 0).ToList();
            if (names.Count == 0) return null; // a title alone is too easy to get wrong
            foreach (var store in Stores)
            {
                var found = await Search(title.Trim() + " " + names[0], store, cancellationToken).ConfigureAwait(false);
                var hit = (found?.results ?? new ItResult[0]).FirstOrDefault(r =>
                    r != null && Close(title, r.collectionName) &&
                    names.Any(n => Close(n, r.artistName) || NetEaseClient.Norm(r.artistName).Contains(NetEaseClient.Norm(n))) &&
                    (!year.HasValue || !Released(r).HasValue || Math.Abs(Released(r).Value.Year - year.Value) <= 1));
                if (hit != null) return hit;
            }
            return null;
        }

        public static DateTime? Released(ItResult r)
        {
            return DateTime.TryParse(r?.releaseDate, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var d)
                ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc) : (DateTime?)null;
        }

        // "℗ 2012 Warner Music Hong Kong Ltd" → "Warner Music Hong Kong Ltd"
        public static string Label(ItResult r)
        {
            var c = CopyrightPrefix.Replace(r?.copyright ?? string.Empty, string.Empty).Trim();
            return c.Length > 0 ? c : null;
        }

        public static string Cover(ItResult r)
        {
            var u = r?.artworkUrl100;
            return string.IsNullOrEmpty(u) ? null : Regex.Replace(u, @"/\d+x\d+bb\.", "/1200x1200bb.");
        }
    }

    /// <summary>Release date, genre and label of an album, from Apple Music (fills only what is missing).</summary>
    public class AppleMusicAlbumProvider : IRemoteMetadataProvider<MusicAlbum, AlbumInfo>
    {
        private readonly IHttpClient _http;
        private readonly AppleMusicClient _apple;

        public AppleMusicAlbumProvider(IHttpClient http, ILogManager logManager)
        {
            _http = http;
            _apple = new AppleMusicClient(http, logManager.GetLogger("BetterTheEmby"));
        }

        public string Name => AppleMusicClient.ProviderName;

        public async Task<MetadataResult<MusicAlbum>> GetMetadata(AlbumInfo info, CancellationToken cancellationToken)
        {
            var result = new MetadataResult<MusicAlbum>();
            var hit = await _apple.FindAlbum(info.Name, info.AlbumArtists, info.Year, cancellationToken).ConfigureAwait(false);
            if (hit == null) return result;
            var item = new MusicAlbum { Name = info.Name };
            var released = AppleMusicClient.Released(hit);
            if (released.HasValue)
            {
                item.PremiereDate = released;
                item.ProductionYear = released.Value.Year;
            }
            if (!string.IsNullOrWhiteSpace(hit.primaryGenreName)) item.SetGenres(new[] { hit.primaryGenreName.Trim() });
            var label = AppleMusicClient.Label(hit);
            if (label != null) item.SetStudios(new[] { label });
            item.SetProviderId(AppleMusicClient.AlbumKey, hit.collectionId.ToString(CultureInfo.InvariantCulture));
            result.Item = item;
            result.HasMetadata = true;
            return result;
        }

        public async Task<IEnumerable<RemoteSearchResult>> GetSearchResults(AlbumInfo searchInfo, CancellationToken cancellationToken)
        {
            var hit = await _apple.FindAlbum(searchInfo.Name, searchInfo.AlbumArtists, searchInfo.Year, cancellationToken).ConfigureAwait(false);
            if (hit == null) return new List<RemoteSearchResult>();
            var released = AppleMusicClient.Released(hit);
            var r = new RemoteSearchResult
            {
                Name = hit.collectionName,
                ImageUrl = AppleMusicClient.Cover(hit),
                SearchProviderName = Name,
                PremiereDate = released,
                ProductionYear = released?.Year,
                AlbumArtist = new RemoteSearchResult { Name = hit.artistName, SearchProviderName = Name }
            };
            r.SetProviderId(AppleMusicClient.AlbumKey, hit.collectionId.ToString(CultureInfo.InvariantCulture));
            return new List<RemoteSearchResult> { r };
        }

        public Task<HttpResponseInfo> GetImageResponse(string url, CancellationToken cancellationToken)
        {
            return _http.GetResponse(_apple.Options(url, cancellationToken));
        }
    }

    /// <summary>Album covers from Apple Music, for albums that have none.</summary>
    public class AppleMusicImageProvider : IRemoteImageProvider
    {
        private readonly IHttpClient _http;
        private readonly AppleMusicClient _apple;

        public AppleMusicImageProvider(IHttpClient http, ILogManager logManager)
        {
            _http = http;
            _apple = new AppleMusicClient(http, logManager.GetLogger("BetterTheEmby"));
        }

        public string Name => AppleMusicClient.ProviderName;

        public bool Supports(BaseItem item) => item is MusicAlbum;

        public IEnumerable<ImageType> GetSupportedImages(BaseItem item) => new[] { ImageType.Primary };

        public async Task<IEnumerable<RemoteImageInfo>> GetImages(BaseItem item, LibraryOptions libraryOptions, CancellationToken cancellationToken)
        {
            var images = new List<RemoteImageInfo>();
            if (item is MusicAlbum album)
            {
                var hit = await _apple.FindAlbum(album.Name, album.AlbumArtists, album.ProductionYear, cancellationToken).ConfigureAwait(false);
                var cover = AppleMusicClient.Cover(hit);
                if (cover != null) images.Add(new RemoteImageInfo { ProviderName = Name, Url = cover, Type = ImageType.Primary, Width = 1200, Height = 1200 });
            }
            return images;
        }

        public Task<HttpResponseInfo> GetImageResponse(string url, CancellationToken cancellationToken)
        {
            return _http.GetResponse(_apple.Options(url, cancellationToken));
        }
    }

    public class AppleMusicAlbumExternalId : IExternalId
    {
        public string Name => AppleMusicClient.ProviderName;
        public string Key => AppleMusicClient.AlbumKey;
        public string UrlFormatString => "https://music.apple.com/album/{0}";
        public bool Supports(IHasProviderIds item) => item is MusicAlbum;
    }
}
