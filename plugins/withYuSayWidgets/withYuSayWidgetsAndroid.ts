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

    // Small 위젯 제거 — Medium(4x2↔4x4 리사이즈) 하나로 통일.
    ensureReceiver('YuSayMediumWidget', 'widget_medium_info');

    // 컬렉션(ListView) 어댑터 서비스 — RemoteViewsService는 BIND_REMOTEVIEWS 권한이 필요.
    const services = (app.service ??= []);
    const svcExists = services.some(
      (s: any) => s.$?.['android:name']?.includes('WidgetListService'),
    );
    if (!svcExists) {
      services.push({
        $: {
          'android:name': '.widget.WidgetListService',
          'android:permission': 'android.permission.BIND_REMOTEVIEWS',
          'android:exported': 'false',
        },
      } as any);
    }

    // WidgetActionReceiver — 리스트 클릭 브로드캐스트 수신(항목 열기 / 완료 처리). provider가
    // 아니므로 intent-filter 없이 명시적 PendingIntent로만 호출된다(exported=false).
    const actExists = receivers.some(
      (r: any) => r.$?.['android:name']?.includes('WidgetActionReceiver'),
    );
    if (!actExists) {
      receivers.push({
        $: {
          'android:name': '.widget.WidgetActionReceiver',
          'android:exported': 'false',
        },
      } as any);
    }

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
        'com', 'usayo', 'app', 'widget',
      );
      const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(path.join(resDir, 'layout'), { recursive: true });
      fs.mkdirSync(path.join(resDir, 'xml'), { recursive: true });
      fs.mkdirSync(path.join(resDir, 'drawable'), { recursive: true });

      // Copy Kotlin sources (Small 제거, 컬렉션 서비스 추가)
      for (const file of [
        'WidgetDataManager.kt',
        'YuSayMediumWidget.kt',
        'WidgetListService.kt',
        'WidgetActionReceiver.kt',
        'WidgetConfigActivity.kt',
      ]) {
        fs.copyFileSync(path.join(SRC, file), path.join(javaDir, file));
      }

      // 브릿지 모듈(YuSayWidgetBridgeModule.kt)은 :app 에 복사하지 않는다. autolink된
      // :yusay-widget-bridge 가 이 Expo 모듈을 제공/등록하며, :app 에도 두면 duplicate-class 로
      // 빌드가 실패한다. (:app 는 위젯 provider/res/manifest만 담당)

      // Copy layout XMLs (컬렉션 위젯 루트 + 아이템 row 레이아웃들)
      for (const file of [
        'widget_medium.xml',
        'widget_row_day.xml',
        'widget_row_event.xml',
        'widget_row_now.xml',
        'widget_row_empty.xml',
      ]) {
        fs.copyFileSync(
          path.join(SRC, 'res', 'layout', file),
          path.join(resDir, 'layout', file),
        );
      }

      // Copy XML resources
      for (const file of ['widget_medium_info.xml']) {
        fs.copyFileSync(
          path.join(SRC, 'res', 'xml', file),
          path.join(resDir, 'xml', file),
        );
      }

      // Copy drawables (벡터 아이콘·배경). widget-extension/android/res/drawable 전체를 복사.
      const srcDrawable = path.join(SRC, 'res', 'drawable');
      for (const file of fs.readdirSync(srcDrawable)) {
        fs.copyFileSync(
          path.join(srcDrawable, file),
          path.join(resDir, 'drawable', file),
        );
      }

      return mod;
    },
  ]);

  return config;
}
