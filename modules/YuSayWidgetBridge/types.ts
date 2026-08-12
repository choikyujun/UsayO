export interface WidgetEvent {
  id: string;
  title: string;
  startAt: string; // ISO 8601
  colorTag?: string;
}

// Android 컬렉션 위젯이 그대로 렌더하는 플랫 row. 그룹/현재선/과거·완료 판정은 JS에서 계산해
// 네이티브는 단순 렌더만 하도록 한다(로직 이원화 방지).
export type WidgetRow =
  | { type: 'day'; label: string; isToday: boolean }
  | { type: 'event'; id: string; time: string; title: string; category: string; completed: boolean; past: boolean; recurring: boolean }
  | { type: 'now'; time: string }
  | { type: 'empty' };

export interface WidgetData {
  // ── iOS 하위호환(기존 위젯 UI) — 기존 필드 유지 ──
  nextEvent: WidgetEvent | null;
  todayEvents: WidgetEvent[]; // max 3
  todayRemainingCount: number;
  // ── Android 컬렉션 위젯(과거 3일·오늘·앞으로 7일 그룹) ──
  rows: WidgetRow[];
  todayIndex: number; // 오늘 day 헤더 row 인덱스(위젯 최초 스크롤 위치)
  nowLabel: string; // 현재 HH:mm
  updatedAt: string;
}

export interface IYuSayWidgetBridge {
  // 네이티브는 직렬화된 JSON 문자열 1개를 받는다(중첩 객체 마샬링 실패 회피 — A′).
  // 저장소에 그대로 putString/set하고, 읽기 측(WidgetDataManager/WidgetDataModel)이 파싱한다.
  updateWidget(payload: string): Promise<void>;
  clearWidget(): Promise<void>;
  // 옵션 B: 위젯에서 탭한 완료의 서버 동기화 대기 큐(JSON 문자열). 앱 실행 시 드레인.
  getPendingCompletions(): Promise<string>;
  removePendingCompletion(id: string): Promise<void>;
}

export interface PendingCompletion {
  id: string;
  done: boolean;
  ts: number; // epoch ms
}
