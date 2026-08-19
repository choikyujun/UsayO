const { createRunOncePlugin, withPlugins } = require('@expo/config-plugins');
// ⚠️ iOS 1차 출시(위젯 없음) — withYuSayWidgetsIOS는 **의도적으로 적용하지 않는다.**
//    삭제가 아니라 비활성화다. 파일(withYuSayWidgetsIOS.ts/.js)은 그대로 두었으니
//    위젯을 붙일 때 아래 require와 withPlugins 배열만 되살리면 복구된다.
//
//    왜 빼는가 — 이 플러그인은 iOS prebuild에서 실제로 WidgetKit **확장 타겟을 만든다**:
//      1) withEntitlementsPlist로 App Group 주입 (app.json에서 지워도 여기서 되살아난다)
//      2) widget-extension/ios/* + 브릿지 Swift를 ios/ 아래로 복사
//      3) withXcodeProject로 'YuSayWidget' app_extension 타겟 신규 생성 + 프레임워크 링크
//    확장 타겟은 별도 번들 ID(com.usayo.app.widget)와 자기 프로비저닝 프로파일이 필요하고,
//    entitlements의 App Group이 포털에 등록돼 있지 않으면 서명 단계에서 빌드가 죽는다.
//    위젯을 내지 않는 릴리스에서 그 비용을 질 이유가 없다.
//
//    ⚠️ app.json이 로드하는 것은 **이 파일(index.js)** 이다. 소스는 index.ts지만 런타임에
//       읽히는 건 여기다. 둘을 반드시 함께 유지할 것(어긋나면 EAS가 "Unknown error"로만 죽는다).
// const { withYuSayWidgetsIOS } = require('./withYuSayWidgetsIOS');
const { withYuSayWidgetsAndroid } = require('./withYuSayWidgetsAndroid');

function withYuSayWidgets(config) {
  // Android 전용. iOS를 되살릴 때는 배열 앞에 withYuSayWidgetsIOS를 다시 넣는다.
  return withPlugins(config, [withYuSayWidgetsAndroid]);
}

module.exports = createRunOncePlugin(withYuSayWidgets, 'withYuSayWidgets', '1.0.0');
