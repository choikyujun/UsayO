import { requireOptionalNativeModule } from 'expo-modules-core';
import type { IYuSayWidgetBridge, WidgetData } from './types';

export * from './types';

const NativeWidget = requireOptionalNativeModule<IYuSayWidgetBridge>('YuSayWidgetBridge');

export async function updateWidget(data: WidgetData): Promise<void> {
  if (!NativeWidget) return;
  return NativeWidget.updateWidget(data);
}

export async function clearWidget(): Promise<void> {
  if (!NativeWidget) return;
  return NativeWidget.clearWidget();
}
