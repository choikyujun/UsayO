package com.yusay.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.graphics.Color
import android.widget.RemoteViews
import com.yusay.app.R

class YuSaySmallWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val data = WidgetDataManager.load(context)
    ids.forEach { id -> update(context, manager, id, data) }
  }

  companion object {
    fun update(context: Context, manager: AppWidgetManager, id: Int, data: WidgetData?) {
      val views = RemoteViews(context.packageName, R.layout.widget_small)

      if (data?.nextEvent != null) {
        views.setTextViewText(R.id.widget_time, WidgetDataManager.formatTime(data.nextEvent.startAt))
        views.setTextViewText(R.id.widget_title, data.nextEvent.title)
      } else {
        views.setTextViewText(R.id.widget_time, "")
        views.setTextViewText(R.id.widget_title, "일정 없음")
      }

      val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("yusay://voice")).apply {
        setPackage(context.packageName)
      }
      val pi = PendingIntent.getActivity(
        context, 0, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.widget_root, pi)

      val alpha = WidgetDataManager.getWidgetAlpha(context, id)
      val baseColor = Color.parseColor("#1A1640")
      val alphaInt = (alpha * 255 / 100).coerceIn(0, 255)
      val finalColor = Color.argb(alphaInt, Color.red(baseColor), Color.green(baseColor), Color.blue(baseColor))
      views.setInt(R.id.widget_root, "setBackgroundColor", finalColor)

      manager.updateAppWidget(id, views)
    }
  }
}
