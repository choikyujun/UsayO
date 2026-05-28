package com.yusay.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import com.yusay.app.R

class YuSayMediumWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val data = WidgetDataManager.load(context)
    ids.forEach { id -> update(context, manager, id, data) }
  }

  companion object {
    fun update(context: Context, manager: AppWidgetManager, id: Int, data: WidgetData?) {
      val views = RemoteViews(context.packageName, R.layout.widget_medium)

      // Remaining count
      val count = data?.todayRemainingCount ?: 0
      views.setTextViewText(R.id.widget_count, "$count")

      // Event rows (up to 3)
      val events = data?.todayEvents ?: emptyList()
      val rowIds = listOf(
        Triple(R.id.event_row_1, R.id.event_time_1, R.id.event_title_1),
        Triple(R.id.event_row_2, R.id.event_time_2, R.id.event_title_2),
        Triple(R.id.event_row_3, R.id.event_time_3, R.id.event_title_3),
      )
      rowIds.forEachIndexed { i, (rowId, timeId, titleId) ->
        val event = events.getOrNull(i)
        views.setViewVisibility(rowId, if (event != null) View.VISIBLE else View.GONE)
        if (event != null) {
          views.setTextViewText(timeId, WidgetDataManager.formatTime(event.startAt))
          views.setTextViewText(titleId, event.title)
        }
      }

      if (events.isEmpty()) {
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.widget_empty, View.GONE)
      }

      // Mic FAB tap → open app with voice
      val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("yusay://voice")).apply {
        setPackage(context.packageName)
      }
      val pi = PendingIntent.getActivity(
        context, 1, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.widget_fab, pi)

      manager.updateAppWidget(id, views)
    }
  }
}
