import { withAndroidManifest, createRunOncePlugin } from '@expo/config-plugins';

// 캘린더 앱에 불필요한 권한 제거 (구글 플레이 심사 대응).
// - READ/WRITE_EXTERNAL_STORAGE: expo-file-system이 선언. 앱은 앱 전용(cache/documents)
//   경로만 접근하므로(녹음 .m4a 읽기·삭제) 공유 저장소 권한 불필요.
// - SYSTEM_ALERT_WINDOW: react-native 디버그 매니페스트(개발 오버레이)에서 유입. 오버레이 미사용.
// tools:node="remove"로 병합 단계에서 라이브러리 주입분까지 제거한다.
//
// 주의: app.json은 컴파일된 index.js를 로드한다. 이 .ts를 고치면 index.js도 갱신할 것.
const REMOVE = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

function withRemovePermissions(config: any) {
  return withAndroidManifest(config, (cfg: any) => {
    const manifest = cfg.modResults.manifest;

    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const strip = (arr: any[]) =>
      (arr || []).filter((p) => !REMOVE.includes(p && p.$ && p.$['android:name']));

    manifest['uses-permission'] = strip(manifest['uses-permission']);
    if (manifest['uses-permission-sdk-23']) {
      manifest['uses-permission-sdk-23'] = strip(manifest['uses-permission-sdk-23']);
    }

    for (const name of REMOVE) {
      manifest['uses-permission'].push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }

    return cfg;
  });
}

export default createRunOncePlugin(withRemovePermissions, 'withRemovePermissions', '1.0.0');
