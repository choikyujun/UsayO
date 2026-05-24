import { clearWidget, updateWidget, WidgetData, WidgetEvent } from '../../modules/YuSayWidgetBridge';

export class WidgetService {
  async push(
    events: { id: string; title: string; start_at: string; color_tag?: string }[],
    allTodayEvents: typeof events,
  ): Promise<void> {
    const now = new Date();
    const upcoming = events
      .filter(e => new Date(e.start_at) >= now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));

    const toWidgetEvent = (e: typeof events[0]): WidgetEvent => ({
      id: e.id,
      title: e.title,
      startAt: e.start_at,
      colorTag: e.color_tag,
    });

    const data: WidgetData = {
      nextEvent: upcoming[0] ? toWidgetEvent(upcoming[0]) : null,
      todayEvents: upcoming.slice(0, 3).map(toWidgetEvent),
      todayRemainingCount: upcoming.length,
      updatedAt: now.toISOString(),
    };

    await updateWidget(data);
  }

  async clear(): Promise<void> {
    await clearWidget();
  }
}

export const widgetService = new WidgetService();
