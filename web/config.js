define(['loading', 'emby-input', 'emby-button', 'emby-checkbox', 'emby-textarea'], function (loading) {
    'use strict';

    var pluginId = '6f3c2a8e-4b7d-4e1a-9c55-a1b7d0e2f4c3';

    function folderTabsProblem(text) {
        if (!text.trim()) return null;
        try {
            var value = JSON.parse(text);
            if (!Array.isArray(value)) return '应为数组 · should be an array';
            for (var i = 0; i < value.length; i++) {
                if (!value[i] || !value[i].library || !Array.isArray(value[i].shelves)) return '第 ' + (i + 1) + ' 项缺少 library 或 shelves · entry ' + (i + 1) + ' needs library and shelves';
            }
            return null;
        } catch (e) {
            return 'JSON 格式错误 · not valid JSON: ' + e.message;
        }
    }

    return function (view) {
        view.addEventListener('viewshow', function () {
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
