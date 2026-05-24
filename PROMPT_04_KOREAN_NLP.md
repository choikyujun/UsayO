# PROMPT 04 — 한국어 자연어 날짜·시간 파싱
> Claude Code에게 전달하는 YuSay 한국어 NLP 프롬프트

---

당신은 TypeScript로 한국어 자연어 처리를 구현하는 전문 개발자입니다.
한국어 음성 명령에서 날짜와 시간을 정확하게 파싱하는 시스템을 구현해주세요.

## 파싱 목표

다음 한국어 표현을 모두 정확히 처리해야 합니다:

### 절대 날짜
- "오늘" → today
- "내일" → tomorrow
- "모레" → day after tomorrow
- "글피" → 3 days later
- "어제" → yesterday (조회용)
- "이번 주 금요일" → this Friday
- "다음 주 월요일" → next Monday
- "다다음 주 화요일" → week after next Tuesday
- "이번 달 15일" → 15th of current month
- "다음 달 1일" → 1st of next month
- "이번 달 말" → last day of current month
- "5월 20일" → May 20th (현재 연도)
- "내년 3월" → March next year

### 상대 날짜
- "3일 후" → +3 days
- "일주일 후" → +7 days
- "2주 뒤" → +14 days
- "한 달 후" → +1 month

### 시간 표현
- "오전 10시" → 10:00
- "오후 3시" → 15:00
- "오후 3시 30분" → 15:30
- "오후 3시 반" → 15:30
- "밤 11시" → 23:00
- "새벽 2시" → 02:00
- "정오" → 12:00
- "자정" → 00:00

### 자연어 시간 (기본값 매핑)
- "아침" → 09:00
- "아침 일찍" → 08:00
- "점심", "점심시간" → 12:00
- "점심 후" → 13:00
- "오후" → 14:00
- "저녁" → 18:00
- "저녁 식사" → 19:00
- "밤" → 20:00
- "퇴근 후", "퇴근하고" → 18:00
- "출근 전" → 08:00
- "자기 전" → 22:00

### 반복 일정
- "매일" → RRULE:FREQ=DAILY
- "매주 월요일" → RRULE:FREQ=WEEKLY;BYDAY=MO
- "매주 월·수·금" → RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
- "매달 15일" → RRULE:FREQ=MONTHLY;BYMONTHDAY=15
- "매년 크리스마스" → RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25
- "평일마다" → RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
- "주말마다" → RRULE:FREQ=WEEKLY;BYDAY=SA,SU

### 기간 표현
- "1시간 동안" → duration: 60분
- "30분짜리" → duration: 30분
- "오후 2시부터 4시까지" → start: 14:00, end: 16:00
- "2시간 회의" → duration: 120분

## 인터페이스 정의

```typescript
// services/nlp/KoreanDateParser.ts

interface ParseResult {
  date: Date | null;
  endDate?: Date;
  isRecurring: boolean;
  recurrenceRule?: string;  // iCal RRULE
  duration?: number;         // 분 단위
  confidence: number;        // 0~1
  originalText: string;
  needsClarification?: string;  // 재질문 내용
}

class KoreanDateParser {
  constructor(private readonly referenceDate: Date, private readonly timezone: string) {}
  
  parse(text: string): ParseResult
  
  // 단위 파서들
  private parseRelativeDate(token: string): Date | null
  private parseAbsoluteDate(token: string): Date | null
  private parseTime(token: string): { hours: number; minutes: number } | null
  private parseNaturalTime(token: string): { hours: number; minutes: number } | null
  private parseRecurrence(token: string): string | null
  private parseDuration(token: string): number | null
}
```

## 구현 세부 요구사항

1. **정규식 기반 토크나이저**: 한국어 형태소 분석 없이 패턴 매칭으로 구현
2. **우선순위**: 명시적 시간 > 자연어 시간 > 기본값
3. **Confidence 계산**:
   - 날짜 + 시간 모두 명확: 0.95
   - 날짜만 명확: 0.7
   - 자연어 시간만: 0.6
   - 모호한 표현: 0.4 이하
4. **재질문 트리거**: confidence < 0.5이면 needsClarification에 질문 내용 포함
   - 예: "언제로 잡아드릴까요? 날짜를 말씀해주세요."
5. **타임존 처리**: 모든 결과를 UTC로 변환, 표시는 사용자 타임존
6. **엣지 케이스**:
   - "내일 오후" → 내일 14:00
   - "다음 주" 단독 → confidence 0.3 (어떤 요일?)
   - "이번 달 말" → 마지막 날 계산 (28~31일 자동)

## 테스트 케이스 (Jest)
다음 케이스를 모두 통과하는 단위 테스트 작성:

```typescript
describe('KoreanDateParser', () => {
  const parser = new KoreanDateParser(new Date('2026-05-26T09:41:00'), 'Asia/Seoul');
  
  test('내일 오후 3시', () => {
    const result = parser.parse('내일 오후 3시에 팀 회의');
    expect(result.date).toEqual(new Date('2026-05-27T15:00:00+09:00'));
    expect(result.confidence).toBeGreaterThan(0.9);
  });
  
  test('다음 주 금요일 저녁', () => {
    const result = parser.parse('다음 주 금요일 저녁');
    expect(result.date?.getDay()).toBe(5); // 금요일
    expect(result.date?.getHours()).toBe(18);
  });
  
  test('매주 월요일 10시', () => {
    const result = parser.parse('매주 월요일 오전 10시 스탠드업');
    expect(result.isRecurring).toBe(true);
    expect(result.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
  });
  
  test('퇴근 후', () => {
    const result = parser.parse('퇴근 후 운동');
    expect(result.date?.getHours()).toBe(18);
    expect(result.confidence).toBeGreaterThan(0.55);
  });
  
  // ... 최소 20개 케이스 작성
});
```

Pure TypeScript로 구현, 외부 NLP 라이브러리 사용 금지 (번들 크기 최소화).
