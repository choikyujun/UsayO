package com.yusay.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.widget.RemoteViews
import com.yusay.app.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class YuSayMediumWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> update(context, manager, id) }
    // 컬렉션 데이터 새로고침(prefs 재로딩)
    manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
  }

  companion object {
    private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    private const val MUTABLE = PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

    fun update(context: Context, manager: AppWidgetManager, id: Int) {
      val views = RemoteViews(context.packageName, R.layout.widget_medium)

      // 헤더 날짜(오늘)
      views.setTextViewText(
        R.id.widget_header_date,
        SimpleDateFormat("M월 d일 EEEE", Locale.KOREAN).format(Date()),
      )

      // 배경 투명도 — 흰 배경에만 적용(글자·아이콘은 항상 불투명). 투명↔불투명.
      val alpha = WidgetDataManager.getWidgetAlpha(context, id)
      val alphaInt = (alpha * 255 / 100).coerceIn(0, 255)
      views.setInt(R.id.widget_root, "setBackgroundColor", Color.argb(alphaInt, 255, 255, 255))

      // 리스트 어댑터(컬렉션) — 위젯별 고유 data로 팩토리 구분
      val svcIntent = Intent(context, WidgetListService::class.java).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
        data = Uri.parse("yusaywidget://$id")
      }
      views.setRemoteAdapter(R.id.widget_list, svcIntent)
      views.setEmptyView(R.id.widget_list, R.id.widget_empty)

      // 리스트 아이템 클릭 템플릿 — fill-in의 data(yusay://open | yusay://complete?...)로 앱을 연다.
      val templatePi = PendingIntent.getActivity(
        context, id * 10 + 4,
        Intent(Intent.ACTION_VIEW).setPackage(context.packageName),
        MUTABLE,
      )
      views.setPendingIntentTemplate(R.id.widget_list, templatePi)

      // 헤더 아이콘: 설정(재구성) / 추가 / 음성
      val settingsIntent = Intent(context, WidgetConfigActivity::class.java).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
        data = Uri.parse("yusaywidgetcfg://$id")
      }
      views.setOnClickPendingIntent(
        R.id.widget_btn_settings,
        PendingIntent.getActivity(context, id * 10 + 1, settingsIntent, IMMUTABLE),
      )
      views.setOnClickPendingIntent(
        R.id.widget_btn_add,
        PendingIntent.getActivity(
          context, id * 10 + 2,
          Intent(Intent.ACTION_VIEW, Uri.parse("yusay:///?w=add")).setPackage(context.packageName),
          IMMUTABLE,
        ),
      )
      views.setOnClickPendingIntent(
        R.id.widget_btn_mic,
        PendingIntent.getActivity(
          context, id * 10 + 3,
          Intent(Intent.ACTION_VIEW, Uri.parse("yusay://voice")).setPackage(context.packageName),
          IMMUTABLE,
        ),
      )

      manager.updateAppWidget(id, views)
    }
  }
}
