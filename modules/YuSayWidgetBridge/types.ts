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
  updateWidget(data: WidgetData): Promise<void>;
  clearWidget(): Promise<void>;
}
