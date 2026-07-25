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
    for (provider in listOf(YuSaySmallWidget::class.java, YuSayMediumWidget::class.java)) {
      val ids = widgetManager.getAppWidgetIds(ComponentName(context, provider))
      if (ids.isNotEmpty()) {
        val intent = Intent(context, provider).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(intent)
      }
    }
  }
}
