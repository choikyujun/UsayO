package com.yusay.app.widget

import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val PREFS_NAME = "com.yusay.app.widget"
private const val PREFS_KEY = "widget_data"

data class WidgetEvent(
  val id: String,
  val title: String,
  val startAt: String,
  val colorTag: String?,
)

data class WidgetData(
  val nextEvent: WidgetEvent?,
  val todayEvents: List<WidgetEvent>,
  val todayRemainingCount: Int,
)

object WidgetDataManager {
  fun load(context: Context): WidgetData? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(PREFS_KEY, null) ?: return null
    return try {
      val json = JSONObject(raw)

      val nextEventJson = if (json.isNull("nextEvent")) null else json.getJSONObject("nextEvent")
      val nextEvent = nextEventJson?.let {
        WidgetEvent(
          id = it.getString("id"),
          title = it.getString("title"),
          startAt = it.getString("startAt"),
          colorTag = if (it.isNull("colorTag")) null else it.getString("colorTag"),
        )
      }

      val eventsArray = json.getJSONArray("todayEvents")
      val todayEvents = (0 until eventsArray.length()).map { i ->
        val e = eventsArray.getJSONObject(i)
        WidgetEvent(
          id = e.getString("id"),
          title = e.getString("title"),
          startAt = e.getString("startAt"),
          colorTag = if (e.isNull("colorTag")) null else e.getString("colorTag"),
        )
      }

      WidgetData(
        nextEvent = nextEvent,
        todayEvents = todayEvents,
        todayRemainingCount = json.getInt("todayRemainingCount"),
      )
    } catch (e: Exception) {
      null
    }
  }

  fun getWidgetAlpha(context: Context, appWidgetId: Int): Int {
    val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
    return prefs.getInt("alpha_$appWidgetId", 100)
  }

  fun formatTime(isoString: String): String {
    return try {
      val formats = arrayOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss",
      )
      var date: Date? = null
      for (fmt in formats) {
        try { date = SimpleDateFormat(fmt, Locale.getDefault()).parse(isoString); break } catch (_: Exception) {}
      }
      date?.let { SimpleDateFormat("HH:mm", Locale.getDefault()).format(it) } ?: ""
    } catch (e: Exception) {
      ""
    }
  }
}
