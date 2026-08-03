import { withAndroidManifest, withDangerousMod, AndroidConfig } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'widget-extension', 'android');

export function withYuSayWidgetsAndroid(config: any) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    const receivers = (app.receiver ??= []);

    function ensureReceiver(name: string, metaResource: string) {
      const exists = receivers.some(
        (r: any) => r.$?.['android:name']?.includes(name)
      );
      if (exists) return;

      receivers.push({
        $: {
          'android:name': `.widget.${name}`,
          'android:exported': 'true',
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
      } as any);
    }

    ensureReceiver('YuSaySmallWidget', 'widget_small_info');
    ensureReceiver('YuSayMediumWidget', 'widget_medium_info');

    // WidgetConfigActivity — 투명도 슬라이더
    const activities = (app.activity ??= []);
    const configExists = activities.some(
      (a: any) => a.$?.['android:name']?.includes('WidgetConfigActivity')
    );
    if (!configExists) {
      activities.push({
        $: {
          'android:name': '.widget.WidgetConfigActivity',
          'android:exported': 'true',
          'android:theme': '@android:style/Theme.Material.Light.Dialog',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_CONFIGURE' } },
            ],
          },
        ],
      } as any);
    }

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

      // Copy Kotlin sources
      for (const file of [
        'WidgetDataManager.kt',
        'YuSaySmallWidget.kt',
        'YuSayMediumWidget.kt',
        'WidgetConfigActivity.kt',
      ]) {
        fs.copyFileSync(path.join(SRC, file), path.join(javaDir, file));
      }

      // 브릿지 모듈(YuSayWidgetBridgeModule.kt)은 :app 에 복사하지 않는다. autolink된
      // :yusay-widget-bridge 가 이 Expo 모듈을 제공/등록하며, :app 에도 두면 duplicate-class 로
      // 빌드가 실패한다. (:app 는 위젯 provider/res/manifest만 담당)

      // Copy layout XMLs
      for (const file of ['widget_small.xml', 'widget_medium.xml']) {
        fs.copyFileSync(
          path.join(SRC, 'res', 'layout', file),
          path.join(resDir, 'layout', file),
        );
      }

      // Copy XML resources
      for (const file of ['widget_small_info.xml', 'widget_medium_info.xml']) {
        fs.copyFileSync(
          path.join(SRC, 'res', 'xml', file),
          path.join(resDir, 'xml', file),
        );
      }

      return mod;
    },
  ]);

  return config;
}
