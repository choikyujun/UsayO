package com.yusay.app.widget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.yusay.app.R

// 컬렉션 위젯 어댑터. WidgetDataManager.load()의 플랫 rows를 그대로 렌더한다.
class WidgetListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
    WidgetListFactory(applicationContext)
}

private class WidgetListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var rows: List<WidgetRow> = emptyList()

  override fun onCreate() {}
  override fun onDestroy() {}
  override fun onDataSetChanged() {
    rows = WidgetDataManager.load(context)?.rows ?: emptyList()
  }

  override fun getCount(): Int = rows.size
  override fun getViewTypeCount(): Int = 4
  override fun getItemId(position: Int): Long = position.toLong()
  override fun hasStableIds(): Boolean = true
  override fun getLoadingView(): RemoteViews? = null

  override fun getViewAt(position: Int): RemoteViews {
    val row = rows.getOrNull(position) ?: return RemoteViews(context.packageName, R.layout.widget_row_empty)
    return when (row.type) {
      "day"   -> dayView(row)
      "now"   -> nowView(row)
      "empty" -> RemoteViews(context.packageName, R.layout.widget_row_empty)
      else    -> eventView(row)
    }
  }

  private fun dayView(row: WidgetRow): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.widget_row_day)
    v.setTextViewText(R.id.day_label, row.label)
    v.setTextColor(R.id.day_label, if (row.isToday) Color.parseColor("#534AB7") else Color.parseColor("#8A86A3"))
    return v
  }

  private fun nowView(row: WidgetRow): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.widget_row_now)
    v.setTextViewText(R.id.now_time, row.time)
    return v
  }

  private fun eventView(row: WidgetRow): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.widget_row_event)
    v.setInt(R.id.event_bar, "setBackgroundColor", WidgetDataManager.categoryColor(row.category))
    v.setTextViewText(R.id.event_time, row.time)
    v.setTextViewText(R.id.event_title, row.title)

    // 완료: 취소선 + 회색 제목 + 채운 체크. 미완료: 일반 제목 + 빈 원.
    if (row.completed) {
      v.setTextColor(R.id.event_title, Color.parseColor("#8A86A3"))
      v.setInt(R.id.event_title, "setPaintFlags", Paint.STRIKE_THRU_TEXT_FLAG or Paint.ANTI_ALIAS_FLAG)
      v.setImageViewResource(R.id.event_check_icon, R.drawable.ic_check_done)
    } else {
      v.setTextColor(R.id.event_title, Color.parseColor("#22202E"))
      v.setInt(R.id.event_title, "setPaintFlags", Paint.ANTI_ALIAS_FLAG)
      v.setImageViewResource(R.id.event_check_icon, R.drawable.ic_check_empty)
    }

    // 과거 일정은 42% 불투명도(완료 취소선과 겹쳐도 무방 — alpha는 뷰 전체에 적용).
    v.setFloat(R.id.event_root, "setAlpha", if (row.past) 0.42f else 1.0f)

    // 항목 탭 = 앱 열기(개별 일정으로 가지 않음). 홈(/)으로 안착 — expo-router unmatched 회피.
    v.setOnClickFillInIntent(R.id.event_body, Intent().setData(Uri.parse("yusay:///")))
    // 완료 원 탭 = 완료 토글(딥링크로 앱이 처리). done = 새 상태(현재 완료면 해제=0, 아니면 완료=1).
    val done = if (row.completed) 0 else 1
    v.setOnClickFillInIntent(
      R.id.event_check,
      Intent().setData(Uri.parse("yusay:///?w=complete&id=${Uri.encode(row.id)}&done=$done")),
    )
    return v
  }
}
