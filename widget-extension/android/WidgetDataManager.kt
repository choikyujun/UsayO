package com.yusay.app.widget

import android.content.Context
import org.json.JSONObject

private const val PREFS_NAME = "com.yusay.app.widget"
private const val PREFS_KEY = "widget_data"

// JS(WidgetService)가 계산해 보낸 플랫 row. 네이티브는 그대로 렌더만 한다.
// type: "day" | "event" | "now" | "empty"
data class WidgetRow(
  val type: String,
  val label: String = "",
  val isToday: Boolean = false,
  val id: String = "",
  val time: String = "",
  val title: String = "",
  val category: String = "work",
  val completed: Boolean = false,
  val past: Boolean = false,
)

data class WidgetData(
  val rows: List<WidgetRow>,
  val nowLabel: String,
)

object WidgetDataManager {
  fun load(context: Context): WidgetData? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(PREFS_KEY, null) ?: return null
    return try {
      val json = JSONObject(raw)
      val rowsArray = json.optJSONArray("rows")
      val rows = if (rowsArray == null) emptyList() else (0 until rowsArray.length()).map { i ->
        val r = rowsArray.getJSONObject(i)
        WidgetRow(
          type = r.optString("type", "event"),
          label = r.optString("label", ""),
          isToday = r.optBoolean("isToday", false),
          id = r.optString("id", ""),
          time = r.optString("time", ""),
          title = r.optString("title", ""),
          category = r.optString("category", "work"),
          completed = r.optBoolean("completed", false),
          past = r.optBoolean("past", false),
        )
      }
      WidgetData(rows = rows, nowLabel = json.optString("nowLabel", ""))
    } catch (e: Exception) {
      null
    }
  }

  fun getWidgetAlpha(context: Context, appWidgetId: Int): Int {
    val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
    return prefs.getInt("alpha_$appWidgetId", 100)
  }

  // 카테고리 색 바. personal은 연한 톤(wave), 그 외(work/important)는 퍼플.
  fun categoryColor(category: String): Int {
    return if (category == "personal") android.graphics.Color.parseColor("#AFA9EC")
    else android.graphics.Color.parseColor("#534AB7")
  }
}
