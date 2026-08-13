package com.usayo.app.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import com.usayo.app.R

// 컬렉션 위젯의 단일 클릭 템플릿(getBroadcast) 수신처. fill-in의 extra로 동작을 분기한다.
// - action=open    → 앱(MainActivity) 열기(항목 탭). 딥링크 URI는 open_uri로 전달.
// - action=complete→ 앱을 열지 않고 완료 처리(옵션 B): 위젯 데이터 낙관적 토글 + 대기 큐 적재 +
//                    위젯 즉시 갱신. 실제 Supabase 반영은 앱 다음 실행 시 큐 드레인이 수행.
class WidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.getStringExtra("action")
    val eventId = intent.getStringExtra("event_id")
    // 진단: 완료 원 탭인데 앱이 열리는 증상의 분기를 특정하기 위한 로그.
    //  · action=complete → 완료 처리(앱 안 열림). 정상.
    //  · action=open     → 항목 본문(event_body) 탭으로 들어온 것. 완료 원이 아니라 행을 눌렀다는 뜻.
    //  · action=null     → fill-in extra가 안 실려 온 것(행 여백 탭 또는 템플릿/필인 불일치).
    Log.i("WidgetAction", "[WidgetAction] received action=$action eventId=$eventId done=${intent.getBooleanExtra("done", false)}")
    when (action) {
      "open" -> {
        val uri = intent.getStringExtra("open_uri") ?: "usayo:///"
        Log.i("WidgetAction", "[WidgetAction] → open 분기(앱 실행) uri=$uri")
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
        val id = eventId
        if (id.isNullOrEmpty()) {
          Log.w("WidgetAction", "[WidgetAction] → complete 무시 — event_id 없음")
          return
        }
        val done = intent.getBooleanExtra("done", true)
        Log.i("WidgetAction", "[WidgetAction] → complete 분기(앱 안 엶) id=$id done=$done")
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
      else -> {
        // fill-in extra가 실려 오지 않음(행 여백 탭 등) → 아무 동작도 하지 않는다.
        // 이 로그가 찍히는데 앱이 열린다면 원인은 이 리시버 바깥에 있다.
        Log.w("WidgetAction", "[WidgetAction] → 분기 없음(action=$action) — 무시")
      }
    }
  }
}
