package com.yusay.app.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView

class WidgetConfigActivity : Activity() {
  private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)

    appWidgetId = intent?.extras?.getInt(
      AppWidgetManager.EXTRA_APPWIDGET_ID,
      AppWidgetManager.INVALID_APPWIDGET_ID,
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    val prefs = getSharedPreferences("widget_prefs", MODE_PRIVATE)
    val currentAlpha = prefs.getInt("alpha_$appWidgetId", 100)

    val container = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(48, 48, 48, 48)
    }

    val title = TextView(this).apply {
      text = "위젯 투명도"
      textSize = 18f
      setPadding(0, 0, 0, 16)
    }
    container.addView(title)

    val valueLabel = TextView(this).apply {
      text = "$currentAlpha%"
      textSize = 14f
      gravity = Gravity.END
    }
    container.addView(valueLabel)

    val seekBar = SeekBar(this).apply {
      max = 100
      progress = currentAlpha
      setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) {
          valueLabel.text = "$p%"
        }
        override fun onStartTrackingTouch(s: SeekBar?) {}
        override fun onStopTrackingTouch(s: SeekBar?) {}
      })
    }
    container.addView(seekBar)

    val saveButton = Button(this).apply {
      text = "저장"
      setOnClickListener {
        val alpha = seekBar.progress
        prefs.edit().putInt("alpha_$appWidgetId", alpha).apply()

        val mgr = AppWidgetManager.getInstance(this@WidgetConfigActivity)
        for (cls in listOf(YuSaySmallWidget::class.java, YuSayMediumWidget::class.java)) {
          val updateIntent = Intent(this@WidgetConfigActivity, cls).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
          }
          sendBroadcast(updateIntent)
        }

        val resultIntent = Intent().apply {
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        }
        setResult(RESULT_OK, resultIntent)
        finish()
      }
    }
    container.addView(saveButton)

    setContentView(container)
  }
}
