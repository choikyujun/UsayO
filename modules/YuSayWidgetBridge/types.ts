export interface WidgetEvent {
  id: string;
  title: string;
  startAt: string; // ISO 8601
  colorTag?: string;
}

export interface WidgetData {
  nextEvent: WidgetEvent | null;
  todayEvents: WidgetEvent[]; // max 3
  todayRemainingCount: number;
  updatedAt: string;
}

export interface IYuSayWidgetBridge {
  // 네이티브는 직렬화된 JSON 문자열 1개를 받는다(중첩 객체 마샬링 실패 회피 — A′).
  // 저장소에 그대로 putString/set하고, 읽기 측(WidgetDataManager/WidgetDataModel)이 파싱한다.
  updateWidget(payload: string): Promise<void>;
  clearWidget(): Promise<void>;
}
