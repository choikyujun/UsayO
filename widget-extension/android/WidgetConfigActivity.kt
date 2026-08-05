package com.yusay.app.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView

// 위젯 설정: 배경 투명도. 슬라이더 조작 시 미리보기가 즉시 반영되고, 라벨은 퍼센트 대신
// 양끝 "투명 / 불투명". 투명도는 배경(흰색)에만 적용 — 글자·아이콘은 항상 불투명.
// 방어: onCreate가 어떤 이유로든 실패하면 크래시 대신 기본 투명도로 RESULT_OK 처리 후 종료해
// 위젯 '배치 자체'가 실패하지 않게 한다(설정 액티비티가 죽으면 배치가 취소됨).
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
    Log.i("WidgetConfig", "[WidgetConfig] onCreate id=$appWidgetId")

    // 유효한 위젯 id가 없으면 구성할 대상이 없음 → 종료(시스템은 정상 시 항상 유효 id 전달).
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      Log.w("WidgetConfig", "[WidgetConfig] result=cancel (invalid id)")
      finish()
      return
    }

    try {
      buildUi()
    } catch (e: Throwable) {
      // UI 구성 중 예외 → 크래시 방지. 기본/현재 투명도로 위젯은 추가되게 한다.
      Log.e("WidgetConfig", "[WidgetConfig] onCreate 예외 → fallback: ${e.message}", e)
      finalizeConfig("fallback")
    }
  }

  private fun finalizeConfig(reason: String) {
    try {
      val updateIntent = Intent(this, YuSayMediumWidget::class.java).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
      }
      sendBroadcast(updateIntent)
      // 컬렉션(ListView) 데이터 갱신은 위 브로드캐스트 → YuSayMediumWidget.onUpdate가
      // notifyAppWidgetViewDataChanged로 수행한다(여기서 중복 호출 불필요).
    } catch (_: Throwable) { /* 브로드캐스트 실패는 무시 — 결과는 OK로 마무리 */ }
    setResult(RESULT_OK, Intent().apply { putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId) })
    Log.i("WidgetConfig", "[WidgetConfig] result=$reason")
    finish()
  }

  private fun buildUi() {
    val prefs = getSharedPreferences("widget_prefs", MODE_PRIVATE)
    val currentAlpha = prefs.getInt("alpha_$appWidgetId", WidgetDataManager.DEFAULT_ALPHA)

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

    // 미리보기: 어두운 배경 위에 흰색(투명도 반영) 카드 + 샘플 행. 색상 파싱/배경 설정만 사용
    // (drawable 로드 없음 → 로드 실패 위험 없음).
    val previewCard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(10), dp(9), dp(10), dp(9))
    }
    fun applyPreviewAlpha(a: Int) {
      try {
        previewCard.setBackgroundColor(Color.argb((a * 255 / 100).coerceIn(0, 255), 255, 255, 255))
      } catch (_: Throwable) { /* 미리보기 갱신 실패는 설정 자체를 막지 않는다 */ }
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

    val previewOuter = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(12), dp(12), dp(12))
      setBackgroundColor(Color.parseColor("#3B4066"))
      addView(previewCard)
    }
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
        try { prefs.edit().putInt("alpha_$appWidgetId", seekBar.progress).apply() } catch (_: Throwable) {}
        finalizeConfig("ok")
      }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(20) })

    setContentView(root)
  }
}
