import { ClassifiedIntent, ParsedDateTime } from '../../types';
import { KoreanDateParser } from '../nlp/KoreanDateParser';

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
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
- "오전" = AM, "오후" = PM
- "아침" = 08:00, "점심" = 12:00, "퇴근 후" = 18:00, "저녁" = 18:00, "밤" = 21:00
- 오전/오후 미지정 시간 ("11시", "3시" 등) 해석 규칙:
  * 7~11 → 기본 오전(AM). 12~6 → 기본 오후(PM, 즉 12:00~18:00)
  * 해석한 시각이 현재({currentDateTime}) 기준으로 이미 지났으면 다음 날 같은 시간으로 이월
  * 예: 22:16에 "11시 약속" → 오늘 11:00 이미 지남 → 내일 오전 11:00
  * 예: 10:30에 "3시 미팅" → 오후로 해석 → 오늘 15:00 (아직 안 지남)
- 시간 미지정 → 해당 날 09:00, confidence 0.6
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

## 예시
발화: "내일 3시 강남역 스타벅스에서 김부장님과 팀 회의, 자료 준비 메모"
→ {"intent":"CREATE","title":"팀 회의","startDateTime":{"date":"{exampleTomorrow}T15:00:00+09:00","isRecurring":false,"confidence":0.95,"originalText":"내일 3시"},"location":"강남역 스타벅스","notes":"자료 준비","attendees":["김부장"],"category":"work","confidence":0.95}

발화: "오늘 7시 친구랑 저녁, 카드 챙기기"
→ {"intent":"CREATE","title":"저녁","startDateTime":{"date":"{exampleToday}T19:00:00+09:00","isRecurring":false,"confidence":0.9,"originalText":"오늘 7시"},"location":null,"notes":"카드 챙기기","attendees":["친구"],"category":"personal","confidence":0.9}

발화: "매주 월요일 10시 팀 스탠드업"
→ {"intent":"CREATE","title":"팀 스탠드업","startDateTime":{"date":"{exampleNextMonday}T10:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=WEEKLY;BYDAY=MO","confidence":0.98,"originalText":"매주 월요일 10시"},"location":null,"notes":null,"attendees":null,"category":"work","confidence":0.98}

발화: "매일 아침 7시 운동"
→ {"intent":"CREATE","title":"운동","startDateTime":{"date":"{exampleToday}T07:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=DAILY","confidence":0.97,"originalText":"매일 아침 7시"},"location":null,"notes":null,"attendees":null,"category":"personal","confidence":0.97}

발화: "평일 매일 9시 출근"
→ {"intent":"CREATE","title":"출근","startDateTime":{"date":"{exampleToday}T09:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR","confidence":0.97,"originalText":"평일 매일 9시"},"location":null,"notes":null,"attendees":null,"category":"work","confidence":0.97}

발화: "매월 15일 임대료 자동이체"
→ {"intent":"CREATE","title":"임대료 자동이체","startDateTime":{"date":"{exampleNext15th}T09:00:00+09:00","isRecurring":true,"recurrenceRule":"FREQ=MONTHLY;BYMONTHDAY=15","confidence":0.96,"originalText":"매월 15일"},"location":null,"notes":null,"attendees":null,"category":"personal","confidence":0.96}

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
  "targetEventQuery": "수정/삭제/완료 대상 검색어 (UPDATE/DELETE/COMPLETE)",
  "updateFields": { "startDateTime": ..., "title": ..., "location": ..., "notes": ... },
  "deleteTargetQuery": "삭제 대상 검색어",
  "completeTargetQuery": "완료 처리 대상 검색어 (COMPLETE)",
  "queryRange": { "start": "ISO8601", "end": "ISO8601" },
  "queryType": "list|free_slots|specific",
  "navigationTarget": "today|calendar|upcoming|settings"
}`;

export class IntentClassifierService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
  }

  async classify(
    transcript: string,
    language = 'ko',
    userTimezone = 'Asia/Seoul',
    prefillContext?: string,
  ): Promise<ClassifiedIntent> {
    if (!this.apiKey) {
      console.warn('[Intent] API 키 없음 — regex fallback 사용');
      return this.regexFallback(transcript, prefillContext);
    }

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
      const response = await fetch(CLAUDE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 512,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: prefillContext
                ? `발화 (언어: ${language}): "${transcript}" [기본 날짜/시간: ${prefillContext}, 발화에서 날짜·시간이 명시되지 않으면 이 값을 사용]`
                : `발화 (언어: ${language}): "${transcript}"`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error('[Intent] Claude API 오류:', response.status, errBody);
        if (response.status >= 500) {
          throw new Error(`Claude API 서버 오류: ${response.status}`);
        }
        // 4xx (모델 ID 오류, 키 오류 등) → regex fallback으로 음성 입력 유지
        console.warn('[Intent] Claude API 4xx — regex fallback 사용');
        return this.regexFallback(transcript, prefillContext);
      }

      const data = await response.json();
      const rawText: string = data.content?.[0]?.text ?? '{}';

      // JSON 파싱 (마크다운 코드블록 제거)
      const jsonText = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonText) as ClassifiedIntent;
      parsed.rawTranscript = transcript;
      console.log('[Intent] classified:', JSON.stringify({
        intent: parsed.intent,
        title: parsed.title,
        targetEventQuery: parsed.targetEventQuery,
        deleteTargetQuery: parsed.deleteTargetQuery,
        updateFields: parsed.updateFields,
        startDateTime: parsed.startDateTime?.date,
        events: parsed.events?.length,
        confidence: parsed.confidence,
      }));
      return parsed;

    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error('[Intent] JSON 파싱 실패 — fallback');
        return this.regexFallback(transcript);
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Network') || msg.includes('fetch')) {
        throw new Error('인터넷 연결을 확인해주세요.');
      }
      throw e;
    }
  }

  // API 키 없거나 오류 시 기본 regex 분류
  private regexFallback(text: string, prefillContext?: string): ClassifiedIntent {
    const lower = text;
    let intent: ClassifiedIntent['intent'] = 'CREATE';
    let navigationTarget: ClassifiedIntent['navigationTarget'];

    if (/방금.*취소|방금.*되돌|방금.*원래|되돌려줘|원래대로/.test(lower)) {
      intent = 'RESCHEDULE_UNDO';
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

    // DELETE/UPDATE: targetEventQuery 추출 (제목 키워드, 검색용)
    const eventKeyword = this.extractEventKeyword(text);

    return {
      intent,
      confidence: 0.7,
      title: this.extractTitle(text, intent),
      startDateTime: intent === 'NAVIGATION' ? undefined : startDateTime,
      navigationTarget,
      targetEventQuery:    (intent === 'DELETE' || intent === 'UPDATE' || intent === 'COMPLETE') ? eventKeyword : undefined,
      deleteTargetQuery:   intent === 'DELETE'                                                  ? eventKeyword : undefined,
      completeTargetQuery: intent === 'COMPLETE'                                                ? eventKeyword : undefined,
      rawTranscript: text,
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
