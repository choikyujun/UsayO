package com.usayo.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.usayo.app.R

// 컬렉션 위젯 어댑터. WidgetDataManager.load()의 플랫 rows를 그대로 렌더한다.
class WidgetListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
    WidgetListFactory(
      applicationContext,
      intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID),
    )
}

// 최초 스크롤을 리스트에 데이터가 실제로 채워진 뒤에 적용하기 위한 지연.
// onDataSetChanged 시점엔 아직 getCount/getViewAt 이전이라 여기서 바로 쏘면 빈 리스트에
// 스크롤하는 셈이 돼 무시된다.
private const val SCROLL_DELAY_MS = 400L

private class WidgetListFactory(
  private val context: Context,
  private val appWidgetId: Int,
) : RemoteViewsService.RemoteViewsFactory {
  private var rows: List<WidgetRow> = emptyList()

  override fun onCreate() { Log.i("WidgetList", "[WidgetList] onCreate id=$appWidgetId") }
  override fun onDestroy() {}
  override fun onDataSetChanged() {
    val data = WidgetDataManager.load(context)
    rows = data?.rows ?: emptyList()
    Log.i("WidgetList", "[WidgetList] onDataSetChanged getCount=${rows.size} id=$appWidgetId")
    if (data != null) scrollToTodayOnce(data)
  }

  // 최초 1회만 오늘 위치로 스크롤한다.
  // provider(update)에서도 setScrollPosition을 쏘지만, 그건 setRemoteAdapter와 같은 RemoteViews에
  // 담겨 **리스트에 데이터가 채워지기 전에** 적용되므로 무시될 수 있다. 데이터 로드가 끝나는
  // 지점(=여기)에서 한 번 더 확실히 적용하고, 성공한 뒤에야 플래그를 세운다.
  // 플래그를 여기서만 세우므로 "데이터 없이 플래그만 소모"되는 일이 없다.
  private fun scrollToTodayOnce(data: WidgetData) {
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return
    if (data.rows.isEmpty()) return
    val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
    if (prefs.getBoolean("scrolled_$appWidgetId", false)) return

    val position = data.todayIndex.coerceIn(0, data.rows.size - 1)
    Handler(Looper.getMainLooper()).postDelayed({
      try {
        // 스크롤 액션만 담은 RemoteViews → partiallyUpdateAppWidget은 이 액션만 적용하므로
        // 다른 뷰(헤더·배경·클릭 템플릿)를 건드리지 않는다.
        val views = RemoteViews(context.packageName, R.layout.widget_medium)
        views.setScrollPosition(R.id.widget_list, position)
        AppWidgetManager.getInstance(context).partiallyUpdateAppWidget(appWidgetId, views)
        prefs.edit().putBoolean("scrolled_$appWidgetId", true).apply()
        Log.i("Widget", "[Widget] scroll → position=$position (rows=${data.rows.size}, todayIndex=${data.todayIndex}) stage=factory id=$appWidgetId")
      } catch (e: Throwable) {
        // 실패 시 플래그를 세우지 않는다 → 다음 갱신에서 다시 시도.
        Log.e("Widget", "[Widget] scroll 실패 id=$appWidgetId: ${e.message}", e)
      }
    }, SCROLL_DELAY_MS)
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

    // 장소(있을 때만) — 앱 홈 항목과 통일. 없으면 숨김(제목만).
    if (row.location.isNotBlank()) {
      v.setTextViewText(R.id.event_location, row.location)
      v.setViewVisibility(R.id.event_location, android.view.View.VISIBLE)
    } else {
      v.setViewVisibility(R.id.event_location, android.view.View.GONE)
    }

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
      Intent().putExtra("action", "open").putExtra("open_uri", "usayo:///"),
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
