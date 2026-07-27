import { ClassifiedIntent, ParsedDateTime } from '../../types';
import { KoreanDateParser } from '../nlp/KoreanDateParser';
import { supabase } from '../../lib/supabase';
import { activityWindowHour24 } from '../../utils/timeHelpers';

// Claude 호출/키는 intent-proxy(서버 secret)가 전담. 클라이언트엔 URL·키를 두지 않는다.
const MODEL = 'claude-haiku-4-5-20251001';  // 실시간 처리 → 속도 우선 (Claude Haiku 4.5)

const SYSTEM_PROMPT = `당신은 음성 캘린더 앱(YuSay)의 자연어 처리 엔진입니다.
사용자의 한국어 발화를 분석하여 반드시 유효한 JSON만 반환하세요. 다른 텍스트는 절대 포함하지 마세요.

## 인텐트 분류
- CREATE: 새 일정 생성 ("잡아줘", "등록해줘", "추가해줘", "만들어줘")
- UPDATE: 기존 일정 수정 ("바꿔줘", "수정해줘", "변경해줘", "옮겨줘")
- DELETE: 기존 일정 삭제 ("취소해줘", "삭제해줘", "지워줘", "없애줘")
- COMPLETE: 기존 일정 완료 처리 ("완료해줘", "완료 처리해줘", "끝났어", "다 했어", "체크해줘", "done", "끝냈어", "마쳤어")
- QUERY:  일정 조회 ("알려줘", "보여줘", "뭐 있어", "확인해줘") — 단, 화면 이동이 명확하면 NAVIGATION 우선
- NAVIGATION: 화면 이동 ("보여줘" + 화면명, "이동해줘", "열어줘")
- NOTIFICATION_UPDATE: 일정 알림 시점 변경 ("알림 바꿔줘", "알림 꺼줘", "N분 전으로 알림 설정해줘", "알림 없애줘")
- RESCHEDULE_UNDO: 드래그 이동 취소 ("방금 옮긴 거 취소", "방금 이동한 거 되돌려", "되돌려줘", "원래대로")
- UNKNOWN: 위에 해당하지 않음

## NAVIGATION 화면 매핑
- "캘린더 보여줘", "이번 달 보여줘", "월별로 보여줘", "달력 보여줘" → target: "calendar"
- "다가올 일정", "이번 주 일정", "앞으로 일정", "다음 일정 뭐야", "이후 일정" → target: "upcoming"
- "설정 열어줘", "환경설정", "내 정보", "설정으로" → target: "settings"
- "오늘 일정", "오늘로 돌아가", "홈으로", "처음으로", "오늘 보여줘" → target: "today"

## 날짜/시간 변환 규칙 (기준: {currentDateTime}, 타임존: {timezone})
- **date 필드는 반드시 타임존 포함 ISO8601 형식으로 출력**: "2026-05-24T23:00:00+09:00"
  Z(UTC) 표기 금지. 항상 +09:00 형식 사용.
- "오늘" → 오늘 날짜
- "내일" → 내일 날짜
- "모레" → 모레 날짜
- "다음 주 {요일}" → 다음 주 해당 요일
- "이번 주 {요일}" → 이번 주 해당 요일
- "{N}일 후" → 오늘 + N일
- 명시적 AM/PM 키워드 → ambiguous: false
  * "오전/아침/새벽 N시" → AM, ambiguous: false
  * "오후/저녁/밤 N시" → PM, ambiguous: false
  * "낮 12시" → 12:00, ambiguous: false
  * "밤 12시" / "자정" → 00:00, ambiguous: false
  * "점심" = 12:00, "퇴근 후" = 18:00, "아침" = 08:00 → 모두 ambiguous: false
- 단독 숫자 ("6시", "3시", "11시" 등, AM/PM 명시어 전혀 없음) → 활동 시간대 규칙으로 확정(ambiguous: false, 절대 되묻지 않음):
  * 9·10·11시 → 오전 (09:00, 10:00, 11:00)
  * 12시 → 12:00 (정오)
  * 1·2·3·4·5·6·7·8시 → 오후 (13:00 ~ 20:00)
  * 즉 9·10·11만 오전, 12·1·2·3·4·5·6·7·8은 오후. 모든 입력이 유일하게 결정됨.
  * 예: "3시 미용실" → 15:00 / "5시 약속" → 17:00 / "10시 회의" → 10:00 / "12시 점심" → 12:00 / "8시 약속" → 20:00
  * date는 위 규칙으로 확정한 24시간제 시각, ambiguous는 항상 false, suggestedMeridiem은 출력하지 말 것.
- 시간 미지정 → 해당 날 09:00, confidence 0.6, ambiguous: false
- 날짜 미지정 → 오늘, confidence 0.5
- 반복 일정 인식 (isRecurring: true, recurrenceRule에 RRULE 형식 반환):
  * "매일" → FREQ=DAILY
  * "매주 월요일" → FREQ=WEEKLY;BYDAY=MO
  * "매주 화요일, 목요일" → FREQ=WEEKLY;BYDAY=TU,TH
  * "평일 매일" → FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR
  * "주말마다" → FREQ=WEEKLY;BYDAY=SA,SU
  * "매월 15일" → FREQ=MONTHLY;BYMONTHDAY=15
  * "매월 첫째 월요일" → FREQ=MONTHLY;BYDAY=1MO
  * "매월 마지막 금요일" → FREQ=MONTHLY;BYDAY=-1FR
  * "매년" → FREQ=YEARLY
  * BYDAY 코드: MO=월, TU=화, WE=수, TH=목, FR=금, SA=토, SU=일
  * recurrenceRule이 있으면 반드시 isRecurring: true 설정
  * startDateTime.date = 해당 반복 패턴의 첫 번째 발생일 (가장 가까운 미래)

## 복수 일정 입력
발화에 2개 이상의 별개 일정이 포함될 때 ("A 그리고 B", "A랑 B도", "A, B 잡아줘" 등):
- 최상위 intent를 "CREATE"로 유지하고 events 배열에 각 일정을 개별 JSON으로 반환
- 각 배열 항목은 아래 ## 반환 JSON 형식과 동일한 구조
- 단일 일정이면 events 필드 없이 기존 형식 그대로 반환
- 예시: "내일 오전 10시 팀 회의, 오후 6시에 저녁 약속도 잡아줘"
  → {"intent":"CREATE","events":[
       {"intent":"CREATE","title":"팀 회의","startDateTime":{"date":"...T10:00:00+09:00","isRecurring":false,"confidence":0.95},"confidence":0.95},
       {"intent":"CREATE","title":"저녁 약속","startDateTime":{"date":"...T18:00:00+09:00","isRecurring":false,"confidence":0.95},"confidence":0.95}
     ]}

## 장소·메모·참석자 추출 규칙
- location: 발화에 명확한 장소("에서", "~에서", "~에서 만나", 특정 건물/카페/역 이름)가 있을 때만 추출. 없으면 반드시 null.
- notes: 할 일·준비물·메모성 언급("챙기기", "준비", "미리", "확인해야" 등)을 정리. 없으면 null.
- attendees: "~씨", "~님", "~장", "~팀장", 인명 등 참석자. 없으면 null.
- 확신 없는 경우 null 반환 — 잘못된 값보다 null이 낫다.

## UPDATE 인텐트 핵심 규칙
- **targetEventQuery**: 수정할 일정의 제목만 추출 (시간·날짜 제외). 예: "8시 30분 영화보기를 바꿔줘" → targetEventQuery는 "영화보기"
- **startDateTime**: 대상 일정의 원래 시간 (검색 힌트). 발화에 원래 시간이 있으면 반드시 설정.
- **updateFields**: 바꿀 내용 (새 시간, 새 제목, 새 장소 등). startDateTime과 별도.

발화: "8시 30분 영화보기를 10시로 바꿔줘"
→ {"intent":"UPDATE","targetEventQuery":"영화보기","startDateTime":{"date":"{exampleToday}T08:30:00+09:00","isRecurring":false,"confidence":0.9,"originalText":"8시 30분"},"updateFields":{"startDateTime":{"date":"{exampleToday}T10:00:00+09:00","isRecurring":false,"confidence":0.95,"originalText":"10시"}},"confidence":0.95}

발화: "내일 3시 팀 회의 제목을 고객 미팅으로 바꿔줘"
→ {"intent":"UPDATE","targetEventQuery":"팀 회의","startDateTime":{"date":"{exampleTomorrow}T15:00:00+09:00","isRecurring":false,"confidence":0.9,"originalText":"내일 3시"},"updateFields":{"title":"고객 미팅"},"confidence":0.95}

## CREATE 예시
발화: "내일 3시 강남역 스타벅스에서 김부장님과 팀 회의, 자료 준비 메모"
→ {"intent":"CREATE","title":"팀 회의","startDateTime":{"date":"{exampleTomorrow}T15:00:00+09:00","isRecurring":false,"confidence":0.95,"originalText":"내일 3시"},"location":"강남역 스타벅스","notes":"자료 준비","attendees":["김부장"],"category":"work","confidence":0.95}

발화: "오늘 7시 친구랑 저녁, 카드 챙기기"
→ {"intent":"CREATE","title":"저녁","startDateTime":{"date":"{exampleToday}T19:00:00+09:00","isRecurring":false,"confidence":0.9,"originalText":"오늘 7시"},"location":null,"notes":"카드 챙기기","attendees":["친구"],"category":"personal","confidence":0.9,"ambiguous":false}
(주의: "7시" 뒤 "저녁"은 제목이지 수식어 아님 → 단독 7시 → 활동 규칙으로 오후 19:00, ambiguous: false)

발화: "오늘 저녁 7시 친구랑 식사"
→ {"intent":"CREATE","title":"식사","startDateTime":{"date":"{exampleToday}T19:00:00+09:00","isRecurring":false,"confidence":0.95,"originalText":"오늘 저녁 7시"},"location":null,"notes":null,"attendees":["친구"],"category":"personal","confidence":0.95,"ambiguous":false}
(주의: "저녁"이 "7시" 앞에 위치 → PM, ambiguous: false)

발화: "매주 월요일 10시 팀 스탠드업"
→ {"intent":"CREATE","title":"팀 스탠드업","startDateTime":{"date":"{exampleNextMonday}T10:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=WEEKLY;BYDAY=MO","confidence":0.98,"originalText":"매주 월요일 10시"},"location":null,"notes":null,"attendees":null,"category":"work","confidence":0.98}

발화: "매일 아침 7시 운동"
→ {"intent":"CREATE","title":"운동","startDateTime":{"date":"{exampleToday}T07:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=DAILY","confidence":0.97,"originalText":"매일 아침 7시"},"location":null,"notes":null,"attendees":null,"category":"personal","confidence":0.97}

발화: "평일 매일 9시 출근"
→ {"intent":"CREATE","title":"출근","startDateTime":{"date":"{exampleToday}T09:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR","confidence":0.97,"originalText":"평일 매일 9시"},"location":null,"notes":null,"attendees":null,"category":"work","confidence":0.97}

발화: "매월 15일 임대료 자동이체"
→ {"intent":"CREATE","title":"임대료 자동이체","startDateTime":{"date":"{exampleNext15th}T09:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=MONTHLY;BYMONTHDAY=15","confidence":0.96,"originalText":"매월 15일"},"location":null,"notes":null,"attendees":null,"category":"personal","confidence":0.96}

## 일정 목록 컨텍스트 활용 (UPDATE/DELETE/COMPLETE 전용)
사용자 발화에 '근처 일정 목록'이 제공될 수 있습니다. 제공된 경우:
- 발화가 UPDATE/DELETE/COMPLETE 인텐트이고 목록에서 대상 일정이 명확히 특정되면 → 'targetEventId'에 해당 id를 설정
- 발화에 "다/모두/전부/다 취소/전부 삭제/다 지워" 등 일괄 패턴이 있으면 → 매칭 id들을 'targetEventIds' 배열에 설정 + scope 설정
  * "내일 일정 다 취소" → 내일 날짜 모든 이벤트 id 배열, scope: "all_day"
  * "오늘 회의 다 취소" → 오늘 + 회의 키워드 매칭 id 배열, scope: "filtered"
  * "이번 주 일정 다 지워" → 이번 주 모든 이벤트 id 배열, scope: "filtered"
  * targetEventIds는 반드시 목록에 실제 있는 id만 포함 (추측 금지)
- 단일 특정 → 'targetEventId' (문자열), 일괄 → 'targetEventIds' (배열)
- 후보가 2개 이상이면 'targetEventId'는 null, 'targetEventQuery'만 반환 (호출자가 모호성 처리)
- 목록에 없는 일정이면 'targetEventId'는 null

## 시간 해석 규칙 (오전/오후) — 되묻지 않고 항상 유일하게 확정(ambiguous: false)
1) 명시적 표현이 숫자 **앞**에 있으면 그대로 확정: "저녁 7시"→19:00, "오전 11시"→11:00, "밤 10시"→22:00, "낮 12시"→12:00. 독립 키워드: "점심"=12:00, "퇴근 후"=18:00, "정오"=12:00, "자정"=00:00.
2) 24시간제 표기("15시", "21시")는 그대로 확정.
3) 그 외 단독 숫자 N시(1~12, 오전/오후 미명시)는 **활동 시간대 규칙**으로 확정:
  * 9·10·11시 → 오전(09:00·10:00·11:00) / 12시 → 12:00(정오) / 1~8시 → 오후(+12, 13:00~20:00)
  * 즉 9·10·11만 오전, 12·1·2·3·4·5·6·7·8은 오후.
  * "3시 미용실"→15:00 / "10시 회의"→10:00 / "12시 점심"→12:00 / "8시 약속"→20:00 / "6시 운동"→18:00 / "7시 저녁 약속"→19:00
  * 숫자 뒤 단어(밥집/저녁/운동/회의/약속/식사 등)는 제목일 뿐 시간 수식어가 아님. 그래도 위 규칙으로 확정.
  * ambiguous는 항상 false, suggestedMeridiem은 출력하지 않는다.

## 반환 JSON 형식
{
  "intent": "CREATE|UPDATE|DELETE|COMPLETE|QUERY|NAVIGATION|RESCHEDULE_UNDO|UNKNOWN",
  "confidence": 0~1,
  "title": "일정 제목 (CREATE/UPDATE)",
  "startDateTime": {
    "date": "ISO8601",
    "isRecurring": false,
    "recurrenceRule": "FREQ=WEEKLY;BYDAY=MO",
    "confidence": 0~1,
    "originalText": "내일 오후 3시"
  },
  "endDateTime": null,
  "location": null,
  "notes": null,
  "attendees": null,
  "category": "work|personal|important",
  "targetEventId": "uuid (단일 매칭, UPDATE/DELETE/COMPLETE 시)",
  "targetEventIds": ["uuid1", "uuid2"],
  "scope": "single|all_day|filtered",
  "targetEventQuery": "수정/삭제/완료 대상 검색어 (UPDATE/DELETE/COMPLETE)",
  "updateFields": { "startDateTime": ..., "title": ..., "location": ..., "notes": ... },
  "deleteTargetQuery": "삭제 대상 검색어",
  "completeTargetQuery": "완료 처리 대상 검색어 (COMPLETE)",
  "queryRange": { "start": "ISO8601", "end": "ISO8601" },
  "queryType": "list|free_slots|specific",
  "navigationTarget": "today|calendar|upcoming|settings",
  "ambiguous": false,
  "notificationOffsetMinutes": null
}

## NOTIFICATION_UPDATE 규칙
- targetEventQuery: 알림을 바꿀 일정 제목 키워드
- targetEventId / targetEventIds: nearby events에서 특정 가능할 때 설정
- notificationOffsetMinutes: 알림 시점(분 단위, 일정 시작 N분 전)
  * null = 알림 없음 ("꺼줘", "없애줘", "알림 없음")
  * 0 = 시작 시 알림
  * 5, 10, 15, 30 = N분 전
  * 60 = 1시간 전, 120 = 2시간 전
  * 1440 = 1일 전, 2880 = 2일 전, 10080 = 1주 전

발화: "내일 팀 회의 알림을 30분 전으로 바꿔줘"
→ {"intent":"NOTIFICATION_UPDATE","targetEventQuery":"팀 회의","startDateTime":{"date":"{exampleTomorrow}T09:00:00+09:00","isRecurring":false,"confidence":0.8},"notificationOffsetMinutes":30,"confidence":0.95}

발화: "오늘 운동 알림 꺼줘"
→ {"intent":"NOTIFICATION_UPDATE","targetEventQuery":"운동","notificationOffsetMinutes":null,"confidence":0.95}

발화: "팀 미팅 알림을 1시간 전으로 설정해줘"
→ {"intent":"NOTIFICATION_UPDATE","targetEventQuery":"팀 미팅","notificationOffsetMinutes":60,"confidence":0.95}`;

export class IntentClassifierService {
  // API 키는 클라이언트에 두지 않는다. Claude 호출/키는 intent-proxy(서버 secret)가 전담.

  async classify(
    transcript: string,
    language = 'ko',
    userTimezone = 'Asia/Seoul',
    prefillContext?: string,
    nearbyEventsContext?: string,
  ): Promise<ClassifiedIntent> {
    const _t0 = Date.now(); // [임시 계측 · voice-verify]

    const currentDateTime = new Date().toLocaleString('ko-KR', {
      timeZone: userTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    });

    // 예시 날짜 동적 계산 (KST 기준)
    const nowKST = new Date(new Date().toLocaleString('en-US', { timeZone: userTimezone }));
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const exampleToday = fmtDate(nowKST);

    const tom = new Date(nowKST); tom.setDate(tom.getDate() + 1);
    const exampleTomorrow = fmtDate(tom);

    // 다음 월요일 (0=Sun, 1=Mon)
    const daysToMon = (8 - nowKST.getDay()) % 7 || 7;
    const nextMon = new Date(nowKST); nextMon.setDate(nowKST.getDate() + daysToMon);
    const exampleNextMonday = fmtDate(nextMon);

    // 다음 15일
    const next15 = new Date(nowKST.getFullYear(), nowKST.getMonth(), 15);
    if (next15 <= nowKST) next15.setMonth(next15.getMonth() + 1);
    const exampleNext15th = fmtDate(next15);

    const systemPrompt = SYSTEM_PROMPT
      .replace('{currentDateTime}', currentDateTime)
      .replace('{timezone}', userTimezone)
      .replace(/{exampleToday}/g, exampleToday)
      .replace(/{exampleTomorrow}/g, exampleTomorrow)
      .replace(/{exampleNextMonday}/g, exampleNextMonday)
      .replace(/{exampleNext15th}/g, exampleNext15th);

    try {
      // API 키는 서버(intent-proxy Edge Function)에만 존재. 세션 JWT로 호출.
      const { data: proxyData, error: proxyError } = await supabase.functions.invoke('intent-proxy', {
        body: {
          model: MODEL,
          max_tokens: 512,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: this.buildUserMessage(transcript, language, prefillContext, nearbyEventsContext),
            },
          ],
        },
      });

      // 네트워크/인증/릴레이 오류 → 기존 네트워크 오류 경로
      if (proxyError) {
        console.error('[Intent] intent-proxy 호출 오류:', proxyError.message);
        throw new Error('인터넷 연결을 확인해주세요.');
      }

      // 프록시는 항상 200으로 {upstreamStatus, body} 래핑 → 상류 상태로 4xx/5xx 분기 재현
      const upstreamStatus: number = proxyData?.upstreamStatus ?? 0;
      const data = proxyData?.body ?? {};

      if (upstreamStatus < 200 || upstreamStatus >= 300) {
        console.error('[Intent] Claude(proxy) 오류:', upstreamStatus);
        if (upstreamStatus >= 500) {
          throw new Error(`Claude API 서버 오류: ${upstreamStatus}`);
        }
        // 4xx → regex fallback으로 음성 입력 유지
        console.log('[Intent] Claude 4xx(proxy) — regex fallback 사용');
        const _r = this.postProcessAmbiguous(this.regexFallback(transcript, prefillContext), transcript);
        console.log(`[VOICE][3-INTENT] PATH=FALLBACK reason=4xx(${upstreamStatus}) elapsedMs=${Date.now() - _t0} json=${JSON.stringify(_r)}`);
        return _r;
      }

      const rawText: string = data.content?.[0]?.text ?? '{}';

      // JSON 파싱 (마크다운 코드블록 제거)
      const jsonText = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonText) as ClassifiedIntent;
      parsed.rawTranscript = transcript;
      console.log('[Intent] === 발화 분석 ===');
      console.log('[Intent] 발화:', transcript);
      console.log('[Intent] LLM 시스템 프롬프트 길이:', systemPrompt.length);
      console.log('[Intent] LLM 응답 raw:', rawText);
      console.log('[Intent] parsed time:', parsed.startDateTime?.date ?? 'none');
      console.log('[Intent] parsed ambiguous:', parsed.ambiguous);
      console.log('[Intent] parsed suggested_meridiem:', parsed.suggestedMeridiem ?? 'none');
      console.log('[Intent] classified:', JSON.stringify({
        intent: parsed.intent,
        title: parsed.title,
        targetEventQuery: parsed.targetEventQuery,
        deleteTargetQuery: parsed.deleteTargetQuery,
        targetEventId: parsed.targetEventId ?? null,
        targetEventIds: parsed.targetEventIds ?? null,
        updateFields: parsed.updateFields,
        startDateTime: parsed.startDateTime?.date,
        events: parsed.events?.length,
        confidence: parsed.confidence,
      }));
      if (parsed.events?.length) {
        console.log('[Intent] 멀티 일정 분류 결과:');
        console.log('[Intent] events:', JSON.stringify(parsed.events, null, 2));
      }
      const _r = this.postProcessAmbiguous(parsed, transcript);
      console.log(`[VOICE][3-INTENT] PATH=CLAUDE elapsedMs=${Date.now() - _t0} json=${JSON.stringify(_r)}`);
      return _r;

    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error('[Intent] JSON 파싱 실패 — fallback');
        const _r = this.postProcessAmbiguous(this.regexFallback(transcript), transcript);
        console.log(`[VOICE][3-INTENT] PATH=FALLBACK reason=JSON파싱실패 elapsedMs=${Date.now() - _t0} json=${JSON.stringify(_r)}`);
        return _r;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Network') || msg.includes('fetch')) {
        throw new Error('인터넷 연결을 확인해주세요.');
      }
      throw e;
    }
  }

  private buildUserMessage(
    transcript: string,
    language: string,
    prefillContext?: string,
    nearbyEventsContext?: string,
  ): string {
    const parts: string[] = [];
    if (nearbyEventsContext) {
      parts.push(`[근처 일정 목록 (±7일)]\n${nearbyEventsContext}`);
    }
    const base = prefillContext
      ? `발화 (언어: ${language}): "${transcript}" [기본 날짜/시간: ${prefillContext}, 발화에서 날짜·시간이 명시되지 않으면 이 값을 사용]`
      : `발화 (언어: ${language}): "${transcript}"`;
    parts.push(base);
    return parts.join('\n\n');
  }

  // API 키 없거나 오류 시 기본 regex 분류
  private regexFallback(text: string, prefillContext?: string): ClassifiedIntent {
    const lower = text;
    let intent: ClassifiedIntent['intent'] = 'CREATE';
    let navigationTarget: ClassifiedIntent['navigationTarget'];

    if (/방금.*취소|방금.*되돌|방금.*원래|되돌려줘|원래대로/.test(lower)) {
      intent = 'RESCHEDULE_UNDO';
    } else if (/알림.*(바꿔|설정|변경|꺼|없애)|알림\s*없애줘/.test(lower)) {
      intent = 'NOTIFICATION_UPDATE';
    } else if (/캘린더|달력|이번 달|월별/.test(lower)) {
      intent = 'NAVIGATION'; navigationTarget = 'calendar';
    } else if (/다가올|이번 주|이후 일정|앞으로/.test(lower)) {
      intent = 'NAVIGATION'; navigationTarget = 'upcoming';
    } else if (/설정|환경설정|내 정보/.test(lower)) {
      intent = 'NAVIGATION'; navigationTarget = 'settings';
    } else if (/홈으로|처음으로|오늘로|오늘 보여/.test(lower)) {
      intent = 'NAVIGATION'; navigationTarget = 'today';
    } else if (/바꿔|수정|변경|옮겨/.test(lower)) intent = 'UPDATE';
    else if (/취소|삭제|지워|없애/.test(lower)) intent = 'DELETE';
    else if (/완료|끝났어|다 했어|체크|끝냈어|마쳤어/.test(lower)) intent = 'COMPLETE';
    else if (/알려줘|보여줘|확인|뭐 있어/.test(lower)) intent = 'QUERY';

    let startDateTime = this.parseDateTime(text);

    // prefillContext로 날짜/시간 보완: 발화에 명시된 날짜/시간이 없으면 prefill 값 적용
    if (prefillContext && intent !== 'NAVIGATION') {
      const parts = prefillContext.split(' ');
      const datePart = parts[0]; // "2026-05-26"
      const timePart = parts[1]; // "14:30" | undefined

      const hasExplicitDate = this.hasExplicitDate(text);
      const hasExplicitTime = this.hasExplicitTime(text);

      // 발화에 날짜 없음 → prefill 날짜로 교체
      // 발화에 시간 없고 prefill에 시간 있음 → prefill 시간으로 교체
      if (!hasExplicitDate || (!hasExplicitTime && timePart)) {
        const base = hasExplicitDate
          ? new Date(startDateTime.date)          // NLP 날짜 유지
          : new Date(`${datePart}T00:00:00`);     // prefill 날짜 사용

        if (timePart && !hasExplicitTime) {
          const [h, m] = timePart.split(':').map(Number);
          base.setHours(h, m, 0, 0);
          startDateTime = { ...startDateTime, date: base.toISOString(), confidence: 0.95 };
        } else if (!hasExplicitDate) {
          // 날짜만 교체, 시간은 NLP 결과 유지
          const nlp = new Date(startDateTime.date);
          base.setHours(nlp.getHours(), nlp.getMinutes(), 0, 0);
          startDateTime = { ...startDateTime, date: base.toISOString() };
        }
      }
    }

    // DELETE/UPDATE/NOTIFICATION_UPDATE: targetEventQuery 추출 (제목 키워드, 검색용)
    const eventKeyword = this.extractEventKeyword(text);

    // NOTIFICATION_UPDATE: notificationOffsetMinutes 추출
    let notifOffset: number | null | undefined;
    if (intent === 'NOTIFICATION_UPDATE') {
      if (/없음|안\s*함|꺼줘|끄기|알림\s*없음/.test(text)) {
        notifOffset = null;
      } else {
        const mM = text.match(/(\d+)\s*분\s*전/);
        const hM = text.match(/(\d+)\s*시간\s*전/);
        const dM = text.match(/(\d+)\s*일\s*전/);
        if (mM) notifOffset = parseInt(mM[1]);
        else if (hM) notifOffset = parseInt(hM[1]) * 60;
        else if (dM) notifOffset = parseInt(dM[1]) * 1440;
        else notifOffset = null;
      }
    }

    return {
      intent,
      confidence: 0.7,
      title: this.extractTitle(text, intent),
      startDateTime: intent === 'NAVIGATION' ? undefined : startDateTime,
      navigationTarget,
      targetEventQuery:          (intent === 'DELETE' || intent === 'UPDATE' || intent === 'COMPLETE' || intent === 'NOTIFICATION_UPDATE') ? eventKeyword : undefined,
      deleteTargetQuery:         intent === 'DELETE'               ? eventKeyword : undefined,
      completeTargetQuery:       intent === 'COMPLETE'             ? eventKeyword : undefined,
      notificationOffsetMinutes: intent === 'NOTIFICATION_UPDATE'  ? notifOffset  : undefined,
      rawTranscript: text,
    };
  }

  // 단독 N시(1-12, 수식어 없음)를 활동 시간대 규칙으로 확정. 규칙 적용 시 보정된 ISO, 아니면 null.
  // 명시적 수식어(오전/오후/새벽/밤/아침/저녁/낮 + N시)와 독립 시간 키워드(점심/퇴근/정오/자정/출근)는 LLM 해석 신뢰.
  private ruleAdjustedDate(dateIso: string, segment: string): string | null {
    const timeMatch = segment.match(/(\d{1,2})\s*시/);
    if (!timeMatch) return null;                                   // 숫자+시 없음(STT 한글 숫자 등)
    const hourNum = parseInt(timeMatch[1]);
    if (hourNum < 1 || hourNum > 12) return null;                  // 24시 표기 등 범위 밖
    if (/(오전|오후|새벽|밤|아침|저녁|낮)\s*\d{1,2}\s*시/.test(segment)) return null; // 명시적 수식어
    if (/(점심|퇴근|정오|자정|출근)/.test(segment)) return null;    // 독립 시간 키워드
    const h24 = activityWindowHour24(hourNum);
    const d = new Date(dateIso);
    d.setHours(h24, d.getMinutes(), 0, 0);
    return d.toISOString();
  }

  // LLM 무관하게 단독 N시(1-12)를 활동 시간대 규칙으로 확정 (LLM + postProcess 이중 일관성).
  // 단일 startDateTime과 멀티 events[] 양쪽 경로 모두 같은 규칙 함수를 통과시킨다.
  private postProcessAmbiguous(parsed: ClassifiedIntent, transcript: string): ClassifiedIntent {
    console.log('[Intent] postProcess 진입 — intent:', parsed.intent, '| ambiguous:', parsed.ambiguous, '| transcript:', transcript);

    if (parsed.intent !== 'CREATE') {
      console.log('[Intent] postProcess bail: CREATE 아님');
      return parsed;
    }

    // 멀티 이벤트: 각 이벤트의 originalText(없으면 전체 발화)로 규칙 적용
    if (parsed.events?.length) {
      const events = parsed.events.map((ev, i) => {
        if (!ev.startDateTime) return ev;
        const segment = ev.startDateTime.originalText ?? transcript;
        const adj = this.ruleAdjustedDate(ev.startDateTime.date, segment);
        if (!adj) return ev;
        console.log(`[Intent] postProcess(multi[${i}]): 활동 규칙 적용 | ${segment} →`, adj);
        return { ...ev, ambiguous: false, suggestedMeridiem: undefined,
          startDateTime: { ...ev.startDateTime, date: adj } };
      });
      return { ...parsed, events };
    }

    if (!parsed.startDateTime) {
      console.log('[Intent] postProcess bail: startDateTime 없음');
      return parsed;
    }
    // 단독 N시 → 활동 시간대 규칙으로 확정(되묻지 않음). LLM의 날짜/분은 유지, 시각(hour)만 규칙으로 보정.
    const adj = this.ruleAdjustedDate(parsed.startDateTime.date, transcript);
    if (!adj) {
      console.log('[Intent] postProcess bail: 규칙 미적용(수식어/키워드/패턴 없음)');
      return parsed;
    }
    console.log('[Intent] postProcess: 활동 규칙 적용 |', transcript, '→', adj);
    return {
      ...parsed,
      ambiguous: false,
      suggestedMeridiem: undefined,
      startDateTime: { ...parsed.startDateTime, date: adj },
    };
  }

  // 발화에서 제목 키워드 추출 (DELETE/UPDATE 검색용)
  private extractEventKeyword(text: string): string {
    return text
      .replace(/내일|모레|오늘|다음\s*주|이번\s*주|어제/, '')
      .replace(/오전|오후|아침|점심|저녁|밤|새벽|퇴근/, '')
      .replace(/\d+\s*시(\s*\d+\s*분)?/, '')
      .replace(/취소해줘|삭제해줘|지워줘|없애줘|바꿔줘|수정해줘|변경해줘|옮겨줘|잡아줘|등록해줘|추가해줘|완료해줘|완료\s*처리해줘|체크해줘|끝냈어|끝났어|다\s*했어|마쳤어|해줘/, '')
      .replace(/을|를|이|가|은|는/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseDateTime(text: string): ParsedDateTime {
    const nlpParser = new KoreanDateParser(new Date(), 'Asia/Seoul');
    const result = nlpParser.parse(text);
    return {
      date: (result.date ?? new Date()).toISOString(),
      isRecurring: result.isRecurring,
      recurrenceRule: result.recurrenceRule,
      confidence: result.confidence,
      originalText: result.originalText,
    };
  }

  private hasExplicitTime(text: string): boolean {
    return /\d+\s*시(\s*\d+\s*분)?|(오전|오후|아침|점심|저녁|밤|새벽|정오|자정|퇴근|출근)/.test(text);
  }

  private hasExplicitDate(text: string): boolean {
    return /(내일|모레|오늘|다음\s*주|이번\s*주|\d+\s*월\s*\d+\s*일|\d+일\s*후|월요일|화요일|수요일|목요일|금요일|토요일|일요일)/.test(text);
  }

  private extractTitle(text: string, intent: string): string {
    if (intent === 'DELETE' || intent === 'QUERY') return '';
    return text
      .replace(/내일|모레|오늘|다음\s*주|이번\s*주/, '')
      .replace(/오전|오후/, '')
      .replace(/\d{1,2}\s*시(\s*\d{1,2}\s*분)?/, '')
      .replace(/잡아줘|등록해줘|추가해줘|만들어줘|해줘|바꿔줘|수정해줘/, '')
      .replace(/\s+/g, ' ')
      .trim() || '새 일정';
  }
}

export const intentService = new IntentClassifierService();
