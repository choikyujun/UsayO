package com.yusay.app.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import com.yusay.app.R

// 컬렉션 위젯의 단일 클릭 템플릿(getBroadcast) 수신처. fill-in의 extra로 동작을 분기한다.
// - action=open    → 앱(MainActivity) 열기(항목 탭). 딥링크 URI는 open_uri로 전달.
// - action=complete→ 앱을 열지 않고 완료 처리(옵션 B): 위젯 데이터 낙관적 토글 + 대기 큐 적재 +
//                    위젯 즉시 갱신. 실제 Supabase 반영은 앱 다음 실행 시 큐 드레인이 수행.
class WidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.getStringExtra("action")) {
      "open" -> {
        val uri = intent.getStringExtra("open_uri") ?: "yusay:///"
        try {
          context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(uri))
              .setClassName(context.packageName, "${context.packageName}.MainActivity")
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
        } catch (e: Throwable) {
          Log.e("WidgetAction", "[WidgetAction] open 실패: ${e.message}", e)
        }
      }
      "complete" -> {
        val id = intent.getStringExtra("event_id") ?: return
        val done = intent.getBooleanExtra("done", true)
        Log.i("WidgetAction", "[WidgetAction] complete id=$id done=$done")
        WidgetDataManager.setRowCompletedOptimistic(context, id, done)
        WidgetDataManager.enqueuePendingCompletion(context, id, done, System.currentTimeMillis())
        // 위젯 즉시 갱신 — 컬렉션 데이터 무효화(factory 재로딩 → 완료 표시 반영).
        try {
          val mgr = AppWidgetManager.getInstance(context)
          val ids = mgr.getAppWidgetIds(ComponentName(context, YuSayMediumWidget::class.java))
          mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
        } catch (e: Throwable) {
          Log.e("WidgetAction", "[WidgetAction] 위젯 갱신 실패: ${e.message}", e)
        }
      }
    }
  }
}
