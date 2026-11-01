using System;
using System.Collections.Generic;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace BetterTheEmby
{
    public class PluginConfiguration : BasePluginConfiguration
    {
        // ----- look -----

        /// <summary>The modernized web client: banners, art behind pages, motion, glass header and menus.</summary>
        public bool EnableModernUI { get; set; } = true;

        /// <summary>Album colours, covers and lyrics in the music player.</summary>
        public bool EnableAlbumTint { get; set; } = true;

        /// <summary>Phones: no tab bar at the bottom, search in the header, albums three to a row, calmer motion.</summary>
        public bool EnablePhoneLayout { get; set; } = true;

        /// <summary>Caches the web client's files in the browser (HTTPS only), so pages open faster.</summary>
        public bool EnableWebCache { get; set; } = true;

        // ----- libraries -----

        /// <summary>Video and music libraries show only the tabs in use (and ours) instead of all of Emby's.</summary>
        public bool SimplifyLibraryTabs { get; set; } = true;

        /// <summary>A "Series" tab in video libraries, built from Emby collections.</summary>
        public bool EnableSeriesTab { get; set; } = true;

        /// <summary>An "Artists" tab in music libraries: one row per artist with photo, biography and albums.</summary>
        public bool EnableArtistFeed { get; set; } = true;

        /// <summary>
        /// Music libraries whose tabs come from their folders, as JSON (see the README): which library, its tabs and
        /// the folder each one shows. Empty: none.
        /// </summary>
        public string FolderTabs { get; set; } = string.Empty;

        // ----- search -----

        /// <summary>Search shows titles (shows, films, albums); an episode or a song only when its own name matches.</summary>
        public bool EnableSmartSearch { get; set; } = true;

        /// <summary>Search by pinyin and pinyin initials, with n and l alike.</summary>
        public bool EnablePinyinSearch { get; set; } = true;

        /// <summary>The A-Z index beside library grids shows pinyin initials instead of characters.</summary>
        public bool EnablePinyinIndex { get; set; } = true;

        // ----- NetEase Cloud Music -----

        /// <summary>
        /// The Cookie header of a signed-in music.163.com session (or just its MUSIC_U value). Optional: used only
        /// when NetEase refuses an anonymous lookup.
        /// </summary>
        public string NetEaseCookie { get; set; }

        /// <summary>Milliseconds between two NetEase lookups.</summary>
        public int NetEaseSpacingMs { get; set; } = 1500;

        /// <summary>
        /// Sends a different mainland client address (X-Real-IP / X-Forwarded-For) with every lookup. NetEase counts
        /// lookups by that address, so this gets past its limit; it is a workaround NetEase does not offer, so it is
        /// off unless turned on.
        /// </summary>
        public bool NetEaseRotateAddress { get; set; }
    }

    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        public static readonly Guid PluginId = new Guid("6f3c2a8e-4b7d-4e1a-9c55-a1b7d0e2f4c3");

        public static Plugin Instance { get; private set; }

        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
        }

        public override string Name => "BetterTheEmby";

        public override string Description => "A modernized Emby web client: Apple-TV-style home and detail pages, Apple-Music-style album colours and lyrics, motion, simpler library tabs (series, artists, folder tabs), title and pinyin search, a phone layout, NetEase Cloud Music and Apple Music metadata, and a web client cache.";

        public override Guid Id => PluginId;

        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo { Name = "bettertheemby", EmbeddedResourcePath = "BetterTheEmby.config.html" },
                new PluginPageInfo { Name = "bettertheembyjs", EmbeddedResourcePath = "BetterTheEmby.config.js" }
            };
        }

        // settings that change the web client take effect at its next reload
        public override void UpdateConfiguration(BasePluginConfiguration configuration)
        {
            base.UpdateConfiguration(configuration);
            WebInjector.Current?.Run();
        }

        public override void OnUninstalling()
        {
            WebInjector.Current?.Remove();
            base.OnUninstalling();
        }
    }
}
