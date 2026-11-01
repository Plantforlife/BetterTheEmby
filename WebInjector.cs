using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Logging;

namespace BetterTheEmby
{
    /// <summary>
    /// Adds the web assets (the settings, modernui.css, albumtint.js, modernui.js) to the bundled web client on
    /// every server start and whenever the settings are saved, and takes them out again on shutdown / uninstall.
    /// It also writes serviceworker.js, which Emby registers but ships empty, with a cache for the web client files.
    /// The web client lives inside the container image, so a container update simply resets it and the next start
    /// re-injects.
    /// </summary>
    public class WebInjector : IServerEntryPoint
    {
        private const string Marker = "<!--bettertheemby-->";
        // what versions before 1.0 (still called AlbumTint) marked their tags with
        private const string OldMarker = "<!--albumtint-->";
        private const string ServiceWorkerFile = "serviceworker.js";
        private const string SettingsFile = "bettertheemby.settings.js";

        // referenced from index.html in this order, after the settings
        private static readonly string[] Assets = { "modernui.css", "albumtint.js", "modernui.js" };

        // written next to them but not referenced: modernui.js loads it when it is needed (pinyin for search)
        private static readonly string[] Extras = { "pinyin.js" };

        // What serviceworker.js becomes when the plugin goes. Emby's own file is empty; this one also deletes the
        // cache ours filled and lets go of open pages, so browsers that installed ours don't keep using it.
        private const string ServiceWorkerOff =
            "// The BetterTheEmby plugin was removed (or its cache turned off): clear its web client cache and stop handling requests.\n" +
            "self.addEventListener('install', function () { self.skipWaiting(); });\n" +
            "self.addEventListener('activate', function (e) {\n" +
            "    e.waitUntil(caches.keys().then(function (keys) {\n" +
            "        return Promise.all(keys.filter(function (k) { return k.indexOf('mui-') === 0; }).map(function (k) { return caches.delete(k); }));\n" +
            "    }).then(function () { return self.clients.claim(); }));\n" +
            "});\n";

        private readonly IApplicationPaths _paths;
        private readonly ILogger _logger;

        public static WebInjector Current { get; private set; }

        public WebInjector(IApplicationPaths paths, ILogManager logManager)
        {
            _paths = paths;
            _logger = logManager.GetLogger("BetterTheEmby");
            Current = this;
        }

        private string WebDir => Path.Combine(_paths.ProgramSystemPath, "dashboard-ui");

        private string IndexPath => Path.Combine(WebDir, "index.html");

        public void Run()
        {
            try
            {
                Inject();
            }
            catch (Exception ex)
            {
                _logger.ErrorException("injecting the web assets failed", ex);
            }
        }

        public void Dispose()
        {
            Remove();
        }

        private void Inject()
        {
            if (!File.Exists(IndexPath))
            {
                _logger.Warn("{0} not found, nothing injected", IndexPath);
                return;
            }

            var tags = new StringBuilder();
            // with the phone layout, a web app added to the iOS home screen runs full screen, under the status bar
            // (Emby's header already keeps clear of the notch)
            if (Plugin.Instance?.Configuration?.EnablePhoneLayout ?? true)
            {
                tags.Append("    <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">" + Marker + "\n");
            }
            var settings = SettingsScript();
            WriteIfChanged(Path.Combine(WebDir, SettingsFile), settings);
            tags.Append("    <script src=\"" + SettingsFile + "?v=" + Version(settings) + "\" defer></script>" + Marker + "\n");
            foreach (var name in Assets)
            {
                var content = Resource(name);
                WriteIfChanged(Path.Combine(WebDir, name), content);
                var url = name + "?v=" + Version(content);
                tags.Append(name.EndsWith(".css", StringComparison.Ordinal)
                    ? "    <link rel=\"stylesheet\" href=\"" + url + "\">" + Marker + "\n"
                    : "    <script src=\"" + url + "\" defer></script>" + Marker + "\n");
            }
            foreach (var name in Extras)
            {
                WriteIfChanged(Path.Combine(WebDir, name), Resource(name));
            }
            var cache = Plugin.Instance?.Configuration?.EnableWebCache ?? true;
            WriteIfChanged(Path.Combine(WebDir, ServiceWorkerFile), cache ? Resource(ServiceWorkerFile) : Encoding.UTF8.GetBytes(ServiceWorkerOff));

            var html = ReadHtml(out var bom);
            var stripped = Strip(html);
            var headEnd = stripped.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            if (headEnd < 0)
            {
                _logger.Warn("no </head> in index.html, nothing injected");
                return;
            }

            var updated = stripped.Insert(headEnd, tags.ToString());
            if (updated == html)
            {
                _logger.Info("web client already up to date");
                return;
            }

            BackupOriginal(stripped, bom);
            WriteHtml(updated, bom);
            _logger.Info("injected {0} into {1}", string.Join(", ", Assets), IndexPath);
        }

        public void Remove()
        {
            try
            {
                if (File.Exists(IndexPath))
                {
                    var html = ReadHtml(out var bom);
                    var stripped = Strip(html);
                    if (stripped != html)
                    {
                        WriteHtml(stripped, bom);
                    }
                }

                foreach (var name in Assets.Concat(Extras).Concat(new[] { SettingsFile }))
                {
                    var file = Path.Combine(WebDir, name);
                    if (File.Exists(file))
                    {
                        File.Delete(file);
                    }
                }
                WriteIfChanged(Path.Combine(WebDir, ServiceWorkerFile), Encoding.UTF8.GetBytes(ServiceWorkerOff));
                _logger.Info("removed from the web client");
            }
            catch (Exception ex)
            {
                _logger.ErrorException("removing the web assets failed", ex);
            }
        }

        // The settings the web client reads (window.BetterTheEmbySettings); the NetEase ones stay on the server.
        private static byte[] SettingsScript()
        {
            var c = Plugin.Instance?.Configuration ?? new PluginConfiguration();
            var settings = new
            {
                modernUI = c.EnableModernUI,
                albumTint = c.EnableAlbumTint,
                phoneLayout = c.EnablePhoneLayout,
                simplifyTabs = c.SimplifyLibraryTabs,
                seriesTab = c.EnableSeriesTab,
                artistFeed = c.EnableArtistFeed,
                folderTabs = c.FolderTabs ?? string.Empty,
                smartSearch = c.EnableSmartSearch,
                pinyinSearch = c.EnablePinyinSearch,
                pinyinIndex = c.EnablePinyinIndex
            };
            return Encoding.UTF8.GetBytes("// BetterTheEmby settings, written by the server plugin (change them in its settings page)\nwindow.BetterTheEmbySettings = " +
                JsonSerializer.Serialize(settings) + ";\n");
        }

        private static byte[] Resource(string name)
        {
            using (var stream = typeof(WebInjector).Assembly.GetManifestResourceStream("BetterTheEmby." + name))
            using (var ms = new MemoryStream())
            {
                stream.CopyTo(ms);
                return ms.ToArray();
            }
        }

        private static string Version(byte[] content)
        {
            using (var sha = SHA1.Create())
            {
                return string.Concat(sha.ComputeHash(content).Take(6).Select(b => b.ToString("x2")));
            }
        }

        private static void WriteIfChanged(string path, byte[] content)
        {
            if (File.Exists(path) && File.ReadAllBytes(path).SequenceEqual(content))
            {
                return;
            }
            File.WriteAllBytes(path, content);
        }

        private static string Strip(string html)
        {
            var lines = html.Split('\n');
            return string.Join("\n", lines.Where(l => l.IndexOf(Marker, StringComparison.Ordinal) < 0 && l.IndexOf(OldMarker, StringComparison.Ordinal) < 0));
        }

        // Keep a copy of the untouched index.html (per server version) under /config/plugins/BetterTheEmby.
        private void BackupOriginal(string original, bool bom)
        {
            var dir = Path.Combine(_paths.PluginsPath, "BetterTheEmby");
            Directory.CreateDirectory(dir);
            var version = typeof(IServerEntryPoint).Assembly.GetName().Version;
            var path = Path.Combine(dir, "index.html.orig-" + version);
            if (!File.Exists(path))
            {
                File.WriteAllText(path, original, new UTF8Encoding(bom));
            }
        }

        private string ReadHtml(out bool bom)
        {
            var bytes = File.ReadAllBytes(IndexPath);
            bom = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF;
            return bom ? Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3) : Encoding.UTF8.GetString(bytes);
        }

        private void WriteHtml(string html, bool bom)
        {
            var tmp = IndexPath + ".albumtint-tmp";
            File.WriteAllText(tmp, html, new UTF8Encoding(bom));
            File.Copy(tmp, IndexPath, true);
            File.Delete(tmp);
        }
    }
}
