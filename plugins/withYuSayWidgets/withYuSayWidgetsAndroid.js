const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const { AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'widget-extension', 'android');
const MODULE_SRC = path.join(__dirname, '..', '..', 'modules', 'YuSayWidgetBridge', 'android');

function withYuSayWidgetsAndroid(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    if (!app.receiver) app.receiver = [];
    const receivers = app.receiver;

    function ensureReceiver(name, metaResource) {
      const exists = receivers.some(
        (r) => r.$ && r.$['android:name'] && r.$['android:name'].includes(name),
      );
      if (exists) return;

      receivers.push({
        $: {
          'android:name': `.widget.${name}`,
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': `@xml/${metaResource}`,
            },
          },
        ],
      });
    }

    ensureReceiver('YuSaySmallWidget', 'widget_small_info');
    ensureReceiver('YuSayMediumWidget', 'widget_medium_info');

    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const javaDir = path.join(
        projectRoot,
        'android', 'app', 'src', 'main', 'java',
        'com', 'yusay', 'app', 'widget',
      );
      const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(path.join(resDir, 'layout'), { recursive: true });
      fs.mkdirSync(path.join(resDir, 'xml'), { recursive: true });

      for (const file of ['WidgetDataManager.kt', 'YuSaySmallWidget.kt', 'YuSayMediumWidget.kt']) {
        fs.copyFileSync(path.join(SRC, file), path.join(javaDir, file));
      }

      fs.copyFileSync(
        path.join(MODULE_SRC, 'src', 'main', 'java', 'com', 'yusay', 'app', 'widget', 'YuSayWidgetBridgeModule.kt'),
        path.join(javaDir, 'YuSayWidgetBridgeModule.kt'),
      );

      for (const file of ['widget_small.xml', 'widget_medium.xml']) {
        fs.copyFileSync(
          path.join(SRC, 'res', 'layout', file),
          path.join(resDir, 'layout', file),
        );
      }

      for (const file of ['widget_small_info.xml', 'widget_medium_info.xml']) {
        fs.copyFileSync(
          path.join(SRC, 'res', 'xml', file),
          path.join(resDir, 'xml', file),
        );
      }

      fs.mkdirSync(path.join(resDir, 'drawable'), { recursive: true });
      for (const file of ['ic_mic.xml', 'widget_fab_background.xml']) {
        fs.copyFileSync(
          path.join(SRC, 'res', 'drawable', file),
          path.join(resDir, 'drawable', file),
        );
      }

      return mod;
    },
  ]);

  return config;
}

module.exports = { withYuSayWidgetsAndroid };
