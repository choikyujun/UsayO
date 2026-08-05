package com.yusay.app.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView

// 위젯 설정: 배경 투명도. 슬라이더 조작 시 미리보기가 즉시 반영되고, 라벨은 퍼센트 대신
// 양끝 "투명 / 불투명". 투명도는 배경(흰색)에만 적용 — 글자·아이콘은 항상 불투명.
class WidgetConfigActivity : Activity() {
  private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  private fun dp(v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)

    appWidgetId = intent?.extras?.getInt(
      AppWidgetManager.EXTRA_APPWIDGET_ID,
      AppWidgetManager.INVALID_APPWIDGET_ID,
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

    val prefs = getSharedPreferences("widget_prefs", MODE_PRIVATE)
    val currentAlpha = prefs.getInt("alpha_$appWidgetId", 100)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(20), dp(20), dp(20))
      setBackgroundColor(Color.WHITE)
    }

    root.addView(TextView(this).apply {
      text = "위젯 설정"; textSize = 16f; setTextColor(Color.parseColor("#26215C"))
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      setPadding(0, 0, 0, dp(16))
    })

    root.addView(TextView(this).apply {
      text = "미리보기"; textSize = 12f; setTextColor(Color.parseColor("#6B6B78"))
      setPadding(0, 0, 0, dp(8))
    })

    // 미리보기: 어두운 배경 위에 흰색(투명도 반영) 카드 + 샘플 행
    val previewOuter = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(12), dp(12), dp(12))
      setBackgroundColor(Color.parseColor("#3B4066"))
    }
    val previewCard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(10), dp(9), dp(10), dp(9))
    }
    fun applyPreviewAlpha(a: Int) {
      previewCard.setBackgroundColor(Color.argb((a * 255 / 100).coerceIn(0, 255), 255, 255, 255))
    }
    previewCard.addView(TextView(this).apply {
      text = "오늘"; textSize = 11f; setTextColor(Color.parseColor("#26215C"))
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    })
    for (s in listOf("17:00  미팅", "18:00  회의")) {
      previewCard.addView(TextView(this).apply {
        text = s; textSize = 10.5f; setTextColor(Color.parseColor("#22202E")); setPadding(0, dp(5), 0, 0)
      })
    }
    applyPreviewAlpha(currentAlpha)
    previewOuter.addView(previewCard)
    root.addView(previewOuter, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(18) })

    root.addView(TextView(this).apply {
      text = "배경 투명도"; textSize = 12f; setTextColor(Color.parseColor("#6B6B78"))
      setPadding(0, 0, 0, dp(6))
    })

    val seekBar = SeekBar(this).apply {
      max = 100
      progress = currentAlpha
      setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) { applyPreviewAlpha(p) }
        override fun onStartTrackingTouch(s: SeekBar?) {}
        override fun onStopTrackingTouch(s: SeekBar?) {}
      })
    }
    root.addView(seekBar)

    // 양끝 라벨: 투명 / 불투명
    val range = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    range.addView(TextView(this).apply {
      text = "투명"; textSize = 10.5f; setTextColor(Color.parseColor("#9A97AC"))
    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    range.addView(TextView(this).apply {
      text = "불투명"; textSize = 10.5f; setTextColor(Color.parseColor("#9A97AC")); gravity = Gravity.END
    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    root.addView(range)

    root.addView(Button(this).apply {
      text = "저장"
      setOnClickListener {
        prefs.edit().putInt("alpha_$appWidgetId", seekBar.progress).apply()
        val mgr = AppWidgetManager.getInstance(this@WidgetConfigActivity)
        val updateIntent = Intent(this@WidgetConfigActivity, YuSayMediumWidget::class.java).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
        }
        sendBroadcast(updateIntent)
        setResult(RESULT_OK, Intent().apply { putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId) })
        finish()
      }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(20) })

    setContentView(root)
  }
}
