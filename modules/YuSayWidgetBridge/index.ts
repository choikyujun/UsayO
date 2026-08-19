// ⚠️ iOS 1차 출시(위젯 없음) — 이 브릿지는 **Android 전용으로 오토링킹**된다.
//    expo-module.config.json의 `platforms`에서 "ios"를 뺐다. 그러지 않으면
//    ios/YuSayWidgetBridge.podspec이 Pod으로 잡혀 YuSayWidgetBridgeModule.swift가
//    컴파일되고, 위젯을 넣지 않아도 iOS 빌드가 이 파일에서 깨진다.
//    iOS 쪽 소스(ios/*.swift·podspec)는 지우지 않고 그대로 뒀다 —
//    **위젯을 붙일 때 `platforms`에 "ios"만 되돌리면 복구된다.**
//    (같은 이유로 plugins/withYuSayWidgets의 iOS 경로도 함께 비활성화돼 있다.)
//
//    그래서 iOS에서는 아래 requireOptionalNativeModule이 항상 null을 돌려주고,
//    이 파일의 모든 함수가 조용한 no-op이 된다(예외 없음). 이건 사고가 아니라 설계다.

import { requireOptionalNativeModule } from 'expo-modules-core';
import type { IYuSayWidgetBridge, WidgetData } from './types';

export * from './types';

const NativeWidget = requireOptionalNativeModule<IYuSayWidgetBridge>('YuSayWidgetBridge');

// [진단] 브릿지 모듈 존재 여부 — 이 모듈이 임포트되는 앱 시작 시 1회 단독 로그.
// push가 한 번도 안 돌아도 modulePresent를 확인할 수 있게 별도로 찍는다.
export const widgetBridgePresent = NativeWidget != null;
console.log(`[Widget] bridge check → modulePresent=${widgetBridgePresent}`);

export async function updateWidget(data: WidgetData): Promise<void> {
  if (!NativeWidget) {
    console.log('[Widget] native write → failed (module absent)');
    return;
  }
  try {
    // 중첩 객체 대신 직렬화된 JSON 문자열을 넘긴다(A′). 네이티브는 이 문자열을 그대로 저장.
    await NativeWidget.updateWidget(JSON.stringify(data));
    console.log('[Widget] native write → ok');
  } catch (e) {
    console.log('[Widget] native write → failed', e instanceof Error ? e.message : String(e));
  }
}

export async function clearWidget(): Promise<void> {
  if (!NativeWidget) return;
  return NativeWidget.clearWidget();
}

// 옵션 B: 완료 대기 큐 조회/제거. 모듈 부재(iOS 등)면 안전한 기본값.
export async function getPendingCompletions(): Promise<string> {
  if (!NativeWidget) return '[]';
  try { return await NativeWidget.getPendingCompletions(); } catch { return '[]'; }
}

export async function removePendingCompletion(id: string): Promise<void> {
  if (!NativeWidget) return;
  try { await NativeWidget.removePendingCompletion(id); } catch { /* 무시 */ }
}
