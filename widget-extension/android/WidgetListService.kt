package com.yusay.app.widget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.util.Log
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

  override fun onCreate() { Log.i("WidgetList", "[WidgetList] onCreate") }
  override fun onDestroy() {}
  override fun onDataSetChanged() {
    rows = WidgetDataManager.load(context)?.rows ?: emptyList()
    Log.i("WidgetList", "[WidgetList] onDataSetChanged getCount=${rows.size}")
  }

  override fun getCount(): Int = rows.size
  override fun getViewTypeCount(): Int = 4
  override fun getItemId(position: Int): Long = position.toLong()
  override fun hasStableIds(): Boolean = true
  override fun getLoadingView(): RemoteViews? = null

  override fun getViewAt(position: Int): RemoteViews {
    val row = rows.getOrNull(position)
    Log.i("WidgetList", "[WidgetList] getViewAt($position) type=${row?.type}")
    if (row == null) return RemoteViews(context.packageName, R.layout.widget_row_empty)
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

    // 항목 탭 = 앱 열기(개별 일정으로 가지 않음). 브로드캐스트 템플릿에 action=open을 실어 보냄.
    v.setOnClickFillInIntent(
      R.id.event_body,
      Intent().putExtra("action", "open").putExtra("open_uri", "yusay:///"),
    )

    if (row.recurring) {
      // 반복(가상 인스턴스): completed_at 단일 모델로 완료 반영 불가 → 완료 원 비활성(회색·무반응).
      // fill-in을 붙이지 않아 탭해도 아무 동작 없음(위젯에 거짓 완료가 남는 것을 방지).
      v.setFloat(R.id.event_check_icon, "setAlpha", 0.3f)
    } else {
      v.setFloat(R.id.event_check_icon, "setAlpha", 1.0f)
      // 완료 원 탭 = 완료 토글(앱 안 열고 처리). done = 새 상태(현재 완료면 해제, 아니면 완료).
      v.setOnClickFillInIntent(
        R.id.event_check,
        Intent()
          .putExtra("action", "complete")
          .putExtra("event_id", row.id)
          .putExtra("done", !row.completed),
      )
    }
    return v
  }
}
