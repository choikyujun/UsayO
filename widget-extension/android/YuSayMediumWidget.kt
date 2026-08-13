package com.usayo.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.util.Log
import android.widget.RemoteViews
import com.usayo.app.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class YuSayMediumWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> update(context, manager, id) }
    // 컬렉션 데이터 새로고침(prefs 재로딩). 실패해도 위젯 배치 자체엔 영향 없게 방어.
    try { manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list) } catch (_: Throwable) {}
  }

  companion object {
    private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    private const val MUTABLE = PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

    private fun dateText(): String =
      SimpleDateFormat("M월 d일 EEEE", Locale.KOREAN).format(Date())

    // 흰 배경 + 저장된 투명도(기본 72). 실패해도 무시.
    private fun applyBackground(context: Context, views: RemoteViews, id: Int) {
      val alpha = WidgetDataManager.getWidgetAlpha(context, id)
      val alphaInt = (alpha * 255 / 100).coerceIn(0, 255)
      views.setInt(R.id.widget_root, "setBackgroundColor", Color.argb(alphaInt, 255, 255, 255))
    }

    fun update(context: Context, manager: AppWidgetManager, id: Int) {
      try {
        val views = RemoteViews(context.packageName, R.layout.widget_medium)
        views.setTextViewText(R.id.widget_header_date, dateText())
        applyBackground(context, views, id)

        // 리스트 어댑터(컬렉션) — 위젯별 고유 data로 팩토리 구분.
        val svcIntent = Intent(context, WidgetListService::class.java).apply {
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
          data = Uri.parse("yusaywidget://$id")
        }
        views.setRemoteAdapter(R.id.widget_list, svcIntent)
        views.setEmptyView(R.id.widget_list, R.id.widget_empty)

        // 스크롤 제어 없음. RemoteViews로는 '오늘을 최상단에' 맞출 수 없어(setScrollPosition =
        // smoothScrollToPosition = "보이게 한다", 최상단 정렬 아님) 데이터 순서로 해결한다 —
        // JS가 오늘을 항상 첫 row로 실어 보낸다. 경위는 docs/voice-known-issues.md 5-7.

        // 리스트 아이템 클릭 템플릿 — WidgetActionReceiver로 가는 '브로드캐스트'. fill-in extra의
        // action(open|complete)으로 리시버가 분기한다(완료는 앱을 안 열고 처리 = 옵션 B).
        // MUTABLE(fill-in이 extra를 채움) + 명시적 컴포넌트(리시버) → Android 12+ 제약 회피.
        val templateIntent = Intent(context, WidgetActionReceiver::class.java)
        val templatePi = PendingIntent.getBroadcast(context, id * 10 + 4, templateIntent, MUTABLE)
        views.setPendingIntentTemplate(R.id.widget_list, templatePi)

        // 헤더 아이콘: 설정(재구성) — 명시적 컴포넌트라 IMMUTABLE로 안전.
        val settingsIntent = Intent(context, WidgetConfigActivity::class.java).apply {
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
          data = Uri.parse("yusaywidgetcfg://$id")
        }
        views.setOnClickPendingIntent(
          R.id.widget_btn_settings,
          PendingIntent.getActivity(context, id * 10 + 1, settingsIntent, IMMUTABLE),
        )
        // 추가/음성 — IMMUTABLE + 암시적 딥링크는 12+에서 허용(MUTABLE만 암시적 금지).
        views.setOnClickPendingIntent(
          R.id.widget_btn_add,
          PendingIntent.getActivity(
            context, id * 10 + 2,
            Intent(Intent.ACTION_VIEW, Uri.parse("usayo:///?w=add")).setPackage(context.packageName),
            IMMUTABLE,
          ),
        )
        views.setOnClickPendingIntent(
          R.id.widget_btn_mic,
          PendingIntent.getActivity(
            context, id * 10 + 3,
            Intent(Intent.ACTION_VIEW, Uri.parse("usayo://voice")).setPackage(context.packageName),
            IMMUTABLE,
          ),
        )

        manager.updateAppWidget(id, views)
        Log.i("Widget", "[Widget] onUpdate id=$id → ok")
      } catch (e: Throwable) {
        // 어떤 이유로든 실패해도 최소 RemoteViews(헤더만)를 넘겨 '배치 자체'는 성립시킨다.
        // 절대 null이 나가면 안 됨(런처가 그릴 것이 없어 "위젯 추가 불가"가 된다).
        Log.e("Widget", "[Widget] onUpdate id=$id → error=${e.message}", e)
        try {
          val fallback = RemoteViews(context.packageName, R.layout.widget_medium)
          fallback.setTextViewText(R.id.widget_header_date, dateText())
          applyBackground(context, fallback, id)
          manager.updateAppWidget(id, fallback)
          Log.w("Widget", "[Widget] onUpdate id=$id → fallback(header-only)")
        } catch (e2: Throwable) {
          Log.e("Widget", "[Widget] onUpdate id=$id → fallback 실패: ${e2.message}", e2)
        }
      }
    }
  }
}
