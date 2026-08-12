const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

// 캘린더 앱에 불필요한 권한 제거 (구글 플레이 심사 대응).
// - READ/WRITE_EXTERNAL_STORAGE: expo-file-system이 선언. 앱은 앱 전용(cache/documents)
//   경로만 접근하므로(녹음 .m4a 읽기·삭제) 공유 저장소 권한 불필요.
// - SYSTEM_ALERT_WINDOW: react-native 디버그 매니페스트(개발 오버레이)에서 유입. 오버레이 미사용.
// tools:node="remove"로 병합 단계에서 라이브러리 주입분까지 제거한다.
const REMOVE = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

function withRemovePermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // tools 네임스페이스 보장 (tools:node 사용 위해 필요)
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const strip = (arr) =>
      (arr || []).filter((p) => !REMOVE.includes(p && p.$ && p.$['android:name']));

    // 소스 매니페스트에 이미 flatten된 선언 제거
    manifest['uses-permission'] = strip(manifest['uses-permission']);
    if (manifest['uses-permission-sdk-23']) {
      manifest['uses-permission-sdk-23'] = strip(manifest['uses-permission-sdk-23']);
    }

    // 병합 단계에서 라이브러리가 다시 주입해도 제거되도록 remove 마커 추가
    for (const name of REMOVE) {
      manifest['uses-permission'].push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }

    return cfg;
  });
}

module.exports = createRunOncePlugin(withRemovePermissions, 'withRemovePermissions', '1.0.0');
