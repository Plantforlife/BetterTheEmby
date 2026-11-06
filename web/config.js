define(['loading', 'emby-input', 'emby-button', 'emby-checkbox', 'emby-textarea', 'emby-select'], function (loading) {
    'use strict';

    var pluginId = '6f3c2a8e-4b7d-4e1a-9c55-a1b7d0e2f4c3';

    // The page is written in Chinese (config.html); this is its English, for whoever picks English at the top.
    // The choice is kept in this browser.
    var LANG_KEY = 'bettertheemby.config.lang';
    var EN = {
        language: 'Language',
        reloadNote: 'Changes apply after reloading the web client.',
        look: 'Look',
        modernUI: 'Modern UI',
        modernUIDesc: 'Banners, art behind pages, detail backdrops, motion, glass header.',
        albumTint: 'Album colours and lyrics',
        albumTintDesc: 'The player takes the cover\'s colours; Apple-Music-style lyrics.',
        phoneLayout: 'Phone layout',
        phoneLayoutDesc: 'No bottom tab bar, search at the top right, albums three to a row, calmer motion; pages scroll as a whole like an ordinary site, so Safari\'s toolbar shrinks away.',
        liquidGlass: 'Liquid glass',
        liquidGlassDesc: 'Buttons, tabs and menus on phones in the manner of iOS 26 liquid glass (clear, with a bright rim, swelling under the finger, bending the page under it in Chromium). Off: frosted glass, as on the desktop.',
        webCache: 'Web client cache',
        webCacheDesc: 'Caches the web client\'s files in the browser (HTTPS only), so it opens faster.',
        libraries: 'Libraries',
        simplifyTabs: 'Simpler tabs',
        simplifyTabsDesc: 'Video libraries keep shows/films, suggestions and favourites; music libraries keep albums.',
        seriesTab: 'Series tab',
        seriesTabDesc: 'Lists the franchises of a video library, from Emby collections.',
        artistFeed: 'Artists tab',
        artistFeedDesc: 'One row per artist: photo, biography and albums.',
        folderTabs: 'Folder tabs (JSON)',
        folderTabsDesc: 'Music libraries whose tabs are their folders; see the README for the format. Empty: none.',
        shortVersionNames: 'Short version names',
        shortVersionNamesDesc: 'A detail page\'s version picker shows what comes after the first " - " of each name, leaving off the title it starts with.',
        search: 'Search',
        smartSearch: 'Title search',
        smartSearchDesc: 'Shows, films, albums and album artists; albums also match their album artist. Episodes and songs match only their own name.',
        pinyinSearch: 'Pinyin search',
        pinyinSearchDesc: 'Full pinyin or initials (gdyg → 孤独摇滚), with n and l alike.',
        pinyinIndex: 'Pinyin A–Z index',
        pinyinIndexDesc: 'The index beside library grids shows A–Z instead of characters.',
        netEase: 'NetEase Cloud Music',
        netEaseSpacing: 'Pause between lookups (ms)',
        rotateAddress: 'Rotate client address',
        rotateAddressDesc: 'Sends a different mainland address in X-Real-IP with every lookup, which gets past NetEase\'s per-address limit. NetEase does not offer this and it may stop working; turn it on at your own discretion.',
        netEaseCookie: 'NetEase cookie (optional)',
        netEaseCookieDesc: 'Used only when an anonymous lookup is refused. The whole Cookie header or just the MUSIC_U value; a spare account is best.',
        save: 'Save'
    };

    function savedLang() {
        try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'; } catch (e) { return 'zh'; }
    }
    var lang = savedLang();
    function t(zh, en) { return lang === 'en' ? en : zh; }

    // The text emby-input / emby-textarea / emby-select drew from their label attribute. Only that text: the
    // <label> of a select or a textarea holds the field itself.
    function setLabel(field, text) {
        field.setAttribute('label', text);
        var box = field.closest('.inputContainer, .selectContainer');
        var holder = box && box.querySelector('.selectLabelText, .emby-textarea-labeltext, label.inputLabel');
        if (holder && !holder.contains(field)) holder.textContent = text;
    }
    function applyLang(view) {
        view.querySelectorAll('[data-i18n]').forEach(function (el) {
            if (el.__zh == null) el.__zh = el.textContent;
            el.textContent = lang === 'en' ? EN[el.getAttribute('data-i18n')] || el.__zh : el.__zh;
        });
        view.querySelectorAll('[data-i18n-label]').forEach(function (field) {
            if (field.__zh == null) field.__zh = field.getAttribute('label');
            setLabel(field, lang === 'en' ? EN[field.getAttribute('data-i18n-label')] || field.__zh : field.__zh);
        });
        var picker = view.querySelector('#configLanguage');
        if (picker) picker.value = lang;
    }
    // the language never stands in the way of the settings themselves
    function tryApplyLang(view) {
        try { applyLang(view); } catch (e) { console.warn('[BetterTheEmby] settings language', e); }
    }

    function folderTabsProblem(text) {
        if (!text.trim()) return null;
        try {
            var value = JSON.parse(text);
            if (!Array.isArray(value)) return t('应为数组', 'should be an array');
            for (var i = 0; i < value.length; i++) {
                if (!value[i] || !value[i].library || !Array.isArray(value[i].shelves)) return t('第 ' + (i + 1) + ' 项缺少 library 或 shelves', 'entry ' + (i + 1) + ' needs library and shelves');
            }
            return null;
        } catch (e) {
            return t('JSON 格式错误：', 'not valid JSON: ') + e.message;
        }
    }

    return function (view) {
        var picker = view.querySelector('#configLanguage');
        if (picker) picker.addEventListener('change', function () {
            lang = this.value === 'en' ? 'en' : 'zh';
            try { localStorage.setItem(LANG_KEY, lang); } catch (e) { }
            tryApplyLang(view);
        });

        view.addEventListener('viewshow', function () {
            tryApplyLang(view);
            loading.show();
            ApiClient.getPluginConfiguration(pluginId).then(function (config) {
                view.querySelectorAll('input[type=checkbox][data-key]').forEach(function (box) {
                    box.checked = !!config[box.getAttribute('data-key')];
                });
                view.querySelector('#folderTabs').value = config.FolderTabs || '';
                view.querySelector('#netEaseSpacing').value = config.NetEaseSpacingMs || 1500;
                view.querySelector('#netEaseCookie').value = config.NetEaseCookie || '';
                loading.hide();
            });
        });

        view.querySelector('.betterTheEmbyConfigForm').addEventListener('submit', function (e) {
            e.preventDefault();
            var form = this, folderTabs = form.querySelector('#folderTabs').value;
            var problem = folderTabsProblem(folderTabs);
            if (problem) {
                Dashboard.alert({ message: problem });
                return false;
            }
            loading.show();
            ApiClient.getPluginConfiguration(pluginId).then(function (config) {
                form.querySelectorAll('input[type=checkbox][data-key]').forEach(function (box) {
                    config[box.getAttribute('data-key')] = box.checked;
                });
                config.FolderTabs = folderTabs.trim();
                config.NetEaseSpacingMs = parseInt(form.querySelector('#netEaseSpacing').value, 10) || 1500;
                config.NetEaseCookie = form.querySelector('#netEaseCookie').value.trim();
                ApiClient.updatePluginConfiguration(pluginId, config).then(function (result) {
                    Dashboard.processPluginConfigurationUpdateResult(result);
                });
            });
            return false;
        });
    };
});
