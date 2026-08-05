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
    await NativeWidget.updateWidget(data);
    console.log('[Widget] native write → ok');
  } catch (e) {
    console.log('[Widget] native write → failed', e instanceof Error ? e.message : String(e));
  }
}

export async function clearWidget(): Promise<void> {
  if (!NativeWidget) return;
  return NativeWidget.clearWidget();
}
