package com.yusay.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

private const val PREFS_NAME = "com.yusay.app.widget"
private const val PREFS_KEY = "widget_data"

class YuSayWidgetBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("YuSayWidgetBridge")

    AsyncFunction("updateWidget") { data: Map<String, Any> ->
      val context = requireNotNull(appContext.reactContext)
      val json = JSONObject(data).toString()
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit().putString(PREFS_KEY, json).apply()
      triggerWidgetUpdate(context)
    }

    AsyncFunction("clearWidget") {
      val context = requireNotNull(appContext.reactContext)
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit().remove(PREFS_KEY).apply()
      triggerWidgetUpdate(context)
    }
  }

  private fun triggerWidgetUpdate(context: Context) {
    val widgetManager = AppWidgetManager.getInstance(context)
    // provider 클래스(YuSaySmallWidget/YuSayMediumWidget)는 :app(위젯 확장)에 있다.
    // 이 모듈이 그 클래스에 컴파일 의존하지 않도록 문자열 클래스명으로 ComponentName을 만든다.
    // (런타임에 시스템이 앱 패키지의 리시버로 해석 — 기능 동일)
    val providerClassNames = listOf(
      "com.yusay.app.widget.YuSaySmallWidget",
      "com.yusay.app.widget.YuSayMediumWidget",
    )
    for (className in providerClassNames) {
      val cn = ComponentName(context.packageName, className)
      val ids = widgetManager.getAppWidgetIds(cn)
      if (ids.isNotEmpty()) {
        val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
          component = cn
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(intent)
      }
    }
  }
}
