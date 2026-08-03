const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// --- Hermes 호환: @supabase/supabase-js 를 CJS(require) 빌드로 강제 해석 ---
// SDK 54의 package-exports 해석은 supabase-js의 ESM(.mjs) 빌드를 고르는데, 이 빌드의
// OpenTelemetry 트레이싱 로더가 "동적 import + 변수 지정자" 를 쓴다:
//   const OTEL_PKG = "@opentelemetry/api";
//   otelModulePromise = import(OTEL_PKG).catch(() => null);
// Babel/Metro의 dynamic-import 변환은 "문자열 리터럴" 지정자만 require 로 바꾼다.
// 변수 지정자는 변환되지 못해 런타임 import() 로 번들에 남고(Metro가 OTEL_PKG 상수를
// 인라인해 import("@opentelemetry/api") 형태가 됨), Hermes 바이트코드 컴파일러가 이를
// "Invalid expression encountered" 로 거부해 EAS 빌드가 실패한다.
// CJS(.cjs) 빌드는 동일 로직을 require(s) 로 구현해 Hermes 안전 → 이 패키지만 'require'
// 컨디션으로 해석하도록 우회. (@opentelemetry/api 는 미설치이므로 트레이싱은 원래대로
// no-op — 기능 영향 없음. 다른 패키지 해석은 그대로 둠.)
const finalConfig = withNativeWind(config, { input: './global.css' });

// resolveRequest 우회는 withNativeWind 이후에 적용해야 한다(withNativeWind 가 자체
// resolver.resolveRequest 를 설정하므로, 그 앞에서 걸면 덮어써진다). 기존(nativewind)
// resolveRequest 로 체이닝해 CSS 처리 등을 보존한다.
//
// 봉인된 CJS 엔트리를 명시적 filePath 로 직접 반환한다. per-request 로 컨디션명을
// 바꾸는 방식은 하위 resolver(nativewind→Metro 기본)가 컨디션을 전역 config 에서
// 다시 읽어 무시됐다. index.cjs 는 자기완결형 번들이며 동적 import() 가 0개라 Hermes 안전.
const supabaseCjs = require.resolve('@supabase/supabase-js/dist/index.cjs', { paths: [__dirname] });
const _prevResolveRequest = finalConfig.resolver.resolveRequest;
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@supabase/supabase-js') {
    return { type: 'sourceFile', filePath: supabaseCjs };
  }
  return (_prevResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = finalConfig;
