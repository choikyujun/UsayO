package com.usayo.app.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

private const val PREFS_NAME = "com.usayo.app.widget"
private const val PREFS_KEY = "widget_data"
private const val PENDING_KEY = "pending_completions" // 앱 실행 시 Supabase로 동기화할 완료 대기 큐

// JS(WidgetService)가 계산해 보낸 플랫 row. 네이티브는 그대로 렌더만 한다.
// type: "day" | "event" | "now" | "empty"
data class WidgetRow(
  val type: String,
  val label: String = "",
  val isToday: Boolean = false,
  val id: String = "",
  val time: String = "",
  val title: String = "",
  val location: String = "",
  val category: String = "work",
  val completed: Boolean = false,
  val past: Boolean = false,
  val recurring: Boolean = false,
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
          location = r.optString("location", ""),
          category = r.optString("category", "work"),
          completed = r.optBoolean("completed", false),
          past = r.optBoolean("past", false),
          recurring = r.optBoolean("recurring", false),
        )
      }
      WidgetData(rows = rows, nowLabel = json.optString("nowLabel", ""))
    } catch (e: Exception) {
      null
    }
  }

  // 기본 배경 불투명도 — 저장값 없을 때(최초 배치). 목업의 글래스 톤(흰 배경 72%)에 맞춘다.
  // 100(완전 불투명)은 첫인상이 과하게 solid, 너무 낮으면 흐릿 → 72로 균형.
  const val DEFAULT_ALPHA = 72

  fun getWidgetAlpha(context: Context, appWidgetId: Int): Int {
    val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
    return prefs.getInt("alpha_$appWidgetId", DEFAULT_ALPHA)
  }

  // 카테고리 색 바. personal은 연한 톤(wave), 그 외(work/important)는 퍼플.
  fun categoryColor(category: String): Int {
    return if (category == "personal") android.graphics.Color.parseColor("#AFA9EC")
    else android.graphics.Color.parseColor("#534AB7")
  }

  // ── 옵션 B: 앱을 열지 않고 완료 처리 ──────────────────────────────
  // widget_data prefs의 해당 이벤트 row.completed를 낙관적으로 뒤집는다(위젯 즉시 반영용).
  fun setRowCompletedOptimistic(context: Context, eventId: String, done: Boolean) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(PREFS_KEY, null) ?: return
    try {
      val json = JSONObject(raw)
      val rows = json.optJSONArray("rows") ?: return
      for (i in 0 until rows.length()) {
        val r = rows.getJSONObject(i)
        if (r.optString("type") == "event" && r.optString("id") == eventId) {
          r.put("completed", done)
        }
      }
      prefs.edit().putString(PREFS_KEY, json.toString()).apply()
    } catch (_: Exception) { /* 손상된 데이터면 무시 */ }
  }

  // 완료 대기 큐에 적재(last-tap-wins: 같은 id 기존 항목 제거 후 추가). ts는 폐기 판정용.
  fun enqueuePendingCompletion(context: Context, eventId: String, done: Boolean, ts: Long) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val arr = try { JSONArray(prefs.getString(PENDING_KEY, "[]")) } catch (_: Exception) { JSONArray() }
    val out = JSONArray()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optString("id") != eventId) out.put(o)
    }
    out.put(JSONObject().put("id", eventId).put("done", done).put("ts", ts))
    prefs.edit().putString(PENDING_KEY, out.toString()).apply()
  }
}
