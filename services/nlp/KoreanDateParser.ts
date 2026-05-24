// Pure TypeScript 한국어 날짜·시간 파서 (외부 라이브러리 없음)

export interface ParseResult {
  date: Date | null;
  endDate?: Date;
  isRecurring: boolean;
  recurrenceRule?: string;  // iCal RRULE
  duration?: number;        // 분 단위
  confidence: number;       // 0~1
  originalText: string;
  needsClarification?: string;
}

interface TimeComponents {
  hours: number;
  minutes: number;
  confidence: number;
}

// ── 상수 ─────────────────────────────────────────────────────

const WEEKDAY_KO: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
  일요일: 0, 월요일: 1, 화요일: 2, 수요일: 3, 목요일: 4, 금요일: 5, 토요일: 6,
};

const WEEKDAY_RRULE: Record<string, string> = {
  일: 'SU', 월: 'MO', 화: 'TU', 수: 'WE', 목: 'TH', 금: 'FR', 토: 'SA',
};

const NATURAL_TIME: Record<string, TimeComponents> = {
  '아침 일찍': { hours: 8, minutes: 0, confidence: 0.65 },
  '출근 전': { hours: 8, minutes: 0, confidence: 0.65 },
  '아침': { hours: 9, minutes: 0, confidence: 0.65 },
  '오전 중': { hours: 10, minutes: 0, confidence: 0.55 },
  '점심시간': { hours: 12, minutes: 0, confidence: 0.7 },
  '정오': { hours: 12, minutes: 0, confidence: 0.9 },
  '점심 후': { hours: 13, minutes: 0, confidence: 0.7 },
  '점심': { hours: 12, minutes: 0, confidence: 0.7 },
  '오후 중': { hours: 14, minutes: 0, confidence: 0.55 },
  '오후': { hours: 14, minutes: 0, confidence: 0.6 },
  '퇴근 후': { hours: 18, minutes: 0, confidence: 0.7 },
  '퇴근하고': { hours: 18, minutes: 0, confidence: 0.7 },
  '저녁 식사': { hours: 19, minutes: 0, confidence: 0.7 },
  '저녁': { hours: 18, minutes: 0, confidence: 0.7 },
  '밤': { hours: 20, minutes: 0, confidence: 0.65 },
  '자기 전': { hours: 22, minutes: 0, confidence: 0.65 },
  '자정': { hours: 0, minutes: 0, confidence: 0.95 },
};

// ── 파서 클래스 ───────────────────────────────────────────────

export class KoreanDateParser {
  constructor(
    private readonly referenceDate: Date,
    private readonly timezone = 'Asia/Seoul',
  ) {}

  parse(text: string): ParseResult {
    const t = text.trim();

    // 1. 반복 일정 먼저 감지
    const recurrence = this.parseRecurrence(t);

    // 2. 날짜 파싱
    let date: Date | null = null;
    let dateCf = 0;

    const relDate = this.parseRelativeDate(t);
    if (relDate) { date = relDate.date; dateCf = relDate.confidence; }

    if (!date) {
      const absDate = this.parseAbsoluteDate(t);
      if (absDate) { date = absDate.date; dateCf = absDate.confidence; }
    }

    // 3. 시간 파싱
    let timeCf = 0;
    const explicit = this.parseTime(t);
    const natural = this.parseNaturalTime(t);
    const timeComp = explicit ?? natural;

    if (timeComp) {
      timeCf = timeComp.confidence;
      if (date) {
        date = new Date(date);
        date.setHours(timeComp.hours, timeComp.minutes, 0, 0);
      } else {
        date = new Date(this.referenceDate);
        date.setHours(timeComp.hours, timeComp.minutes, 0, 0);
        // High-precision times (정오, 자정, explicit 시간) imply "today" confidently
        dateCf = timeCf >= 0.9 ? 0.9 : 0.5;
      }
    } else if (date) {
      // 날짜만 있고 시간 없음 → 09:00 기본값
      date.setHours(9, 0, 0, 0);
      timeCf = 0;
    }

    // 4. 기간 파싱
    const duration = this.parseDuration(t);
    const endDate = duration && date
      ? new Date(date.getTime() + duration * 60_000)
      : this.parseEndTime(t, date);

    // "오후 2시부터 4시까지" 형태 처리
    const rangeEnd = this.parseTimeRange(t, date);
    const finalEndDate = rangeEnd ?? endDate;

    // 5. confidence 계산
    const confidence = this.calcConfidence(dateCf, timeCf, !!date, !!timeComp, !!recurrence);

    // 6. 재질문 트리거
    const needsClarification = confidence < 0.5
      ? this.buildClarificationQuestion(t, !!date, !!timeComp)
      : undefined;

    return {
      date,
      endDate: finalEndDate,
      isRecurring: !!recurrence,
      recurrenceRule: recurrence ?? undefined,
      duration: duration ?? undefined,
      confidence,
      originalText: t,
      needsClarification,
    };
  }

  // ── 상대 날짜 ─────────────────────────────────────────────

  parseRelativeDate(text: string): { date: Date; confidence: number } | null {
    const ref = new Date(this.referenceDate);
    ref.setHours(9, 0, 0, 0);

    if (/오늘/.test(text)) {
      return { date: new Date(ref), confidence: 0.95 };
    }
    if (/내일/.test(text)) {
      ref.setDate(ref.getDate() + 1);
      return { date: ref, confidence: 0.95 };
    }
    if (/모레/.test(text)) {
      ref.setDate(ref.getDate() + 2);
      return { date: ref, confidence: 0.95 };
    }
    if (/글피/.test(text)) {
      ref.setDate(ref.getDate() + 3);
      return { date: ref, confidence: 0.95 };
    }
    if (/어제/.test(text)) {
      ref.setDate(ref.getDate() - 1);
      return { date: ref, confidence: 0.95 };
    }

    // "3일 후", "삼일 후"
    const daysLater = text.match(/(\d+)\s*일\s*(?:후|뒤)/);
    if (daysLater) {
      ref.setDate(ref.getDate() + parseInt(daysLater[1], 10));
      return { date: ref, confidence: 0.9 };
    }

    // "일주일 후", "한 주 후"
    if (/일주일\s*(?:후|뒤)|한\s*주\s*(?:후|뒤)/.test(text)) {
      ref.setDate(ref.getDate() + 7);
      return { date: ref, confidence: 0.9 };
    }

    // "2주 후", "두 주 뒤"
    const weeksLater = text.match(/(\d+)\s*주\s*(?:후|뒤)/);
    if (weeksLater) {
      ref.setDate(ref.getDate() + parseInt(weeksLater[1], 10) * 7);
      return { date: ref, confidence: 0.9 };
    }
    if (/두\s*주\s*(?:후|뒤)/.test(text)) {
      ref.setDate(ref.getDate() + 14);
      return { date: ref, confidence: 0.9 };
    }

    // "한 달 후"
    if (/한\s*달\s*(?:후|뒤)|1\s*달\s*(?:후|뒤)|한\s*개월\s*(?:후|뒤)/.test(text)) {
      ref.setMonth(ref.getMonth() + 1);
      return { date: ref, confidence: 0.88 };
    }
    const monthsLater = text.match(/(\d+)\s*(?:달|개월)\s*(?:후|뒤)/);
    if (monthsLater) {
      ref.setMonth(ref.getMonth() + parseInt(monthsLater[1], 10));
      return { date: ref, confidence: 0.88 };
    }

    // "이번 주 {요일}"
    const thisWeek = text.match(/이번\s*주\s*([월화수목금토일])/);
    if (thisWeek) {
      const target = WEEKDAY_KO[thisWeek[1]];
      if (target !== undefined) {
        return { date: this.getThisWeekday(target), confidence: 0.9 };
      }
    }

    // "다음 주 {요일}"
    const nextWeek = text.match(/다음\s*주\s*([월화수목금토일])/);
    if (nextWeek) {
      const target = WEEKDAY_KO[nextWeek[1]];
      if (target !== undefined) {
        return { date: this.getNextWeekday(target, 1), confidence: 0.75 };
      }
    }

    // "다다음 주 {요일}"
    const week2 = text.match(/다다음\s*주\s*([월화수목금토일])/);
    if (week2) {
      const target = WEEKDAY_KO[week2[1]];
      if (target !== undefined) {
        return { date: this.getNextWeekday(target, 2), confidence: 0.88 };
      }
    }

    // "다음 주" 단독 (요일 미지정)
    if (/다음\s*주/.test(text)) {
      ref.setDate(ref.getDate() + 7);
      return { date: ref, confidence: 0.3 };
    }

    // "이번 주" 단독
    if (/이번\s*주/.test(text)) {
      return { date: ref, confidence: 0.3 };
    }

    return null;
  }

  // ── 절대 날짜 ─────────────────────────────────────────────

  parseAbsoluteDate(text: string): { date: Date; confidence: number } | null {
    const ref = new Date(this.referenceDate);

    // "5월 20일" / "5/20"
    const monthDay = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (monthDay) {
      const d = new Date(ref.getFullYear(), parseInt(monthDay[1], 10) - 1, parseInt(monthDay[2], 10));
      d.setHours(9, 0, 0, 0);
      // 이미 지난 날짜면 내년으로
      if (d < ref && !this.isSameDay(d, ref)) d.setFullYear(d.getFullYear() + 1);
      return { date: d, confidence: 0.92 };
    }

    // "이번 달 15일"
    const thisMonthDay = text.match(/이번\s*달\s*(\d{1,2})\s*일/);
    if (thisMonthDay) {
      const d = new Date(ref.getFullYear(), ref.getMonth(), parseInt(thisMonthDay[1], 10));
      d.setHours(9, 0, 0, 0);
      return { date: d, confidence: 0.9 };
    }

    // "다음 달 1일"
    const nextMonthDay = text.match(/다음\s*달\s*(\d{1,2})\s*일/);
    if (nextMonthDay) {
      const d = new Date(ref.getFullYear(), ref.getMonth() + 1, parseInt(nextMonthDay[1], 10));
      d.setHours(9, 0, 0, 0);
      return { date: d, confidence: 0.9 };
    }

    // "이번 달 말"
    if (/이번\s*달\s*말/.test(text)) {
      const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 0); // 말일
      d.setHours(9, 0, 0, 0);
      return { date: d, confidence: 0.85 };
    }

    // "내년 3월"
    const nextYearMonth = text.match(/내년\s*(\d{1,2})\s*월/);
    if (nextYearMonth) {
      const d = new Date(ref.getFullYear() + 1, parseInt(nextYearMonth[1], 10) - 1, 1);
      d.setHours(9, 0, 0, 0);
      return { date: d, confidence: 0.8 };
    }

    return null;
  }

  // ── 시간 파싱 ─────────────────────────────────────────────

  parseTime(text: string): TimeComponents | null {
    // "오후 3시 30분" / "오후 3시 반" / "오후 3:30"
    const fullTime = text.match(/(오전|오후|새벽|밤|낮)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/);
    if (fullTime) {
      let hours = parseInt(fullTime[2], 10);
      const minutes = fullTime[3] ? parseInt(fullTime[3], 10) : fullTime[4] ? 30 : 0;
      const meridiem = fullTime[1];

      if (meridiem === '오후' && hours < 12) hours += 12;
      else if (meridiem === '오전' && hours === 12) hours = 0;
      else if (meridiem === '새벽') hours = hours < 6 ? hours : hours;
      else if (meridiem === '밤') {
        if (hours <= 11) hours += 12;
      } else if (!meridiem && hours < 7) {
        // 시간만 있고 오전/오후 표시 없을 때: 7시 미만이면 오후로 간주
        hours += 12;
      }

      return { hours, minutes, confidence: meridiem ? 0.95 : 0.75 };
    }

    // "정오"
    if (/정오/.test(text)) return { hours: 12, minutes: 0, confidence: 0.95 };
    // "자정"
    if (/자정/.test(text)) return { hours: 0, minutes: 0, confidence: 0.95 };

    return null;
  }

  parseNaturalTime(text: string): TimeComponents | null {
    // 긴 표현 먼저 체크 (점심시간 > 점심)
    for (const [key, val] of Object.entries(NATURAL_TIME).sort((a, b) => b[0].length - a[0].length)) {
      if (text.includes(key)) return { ...val };
    }
    return null;
  }

  // ── 반복 ─────────────────────────────────────────────────

  parseRecurrence(text: string): string | null {
    if (/평일마다|평일에\s*매번/.test(text))
      return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    if (/주말마다|주말에\s*매번/.test(text))
      return 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU';
    if (/매일|날마다|하루마다/.test(text))
      return 'RRULE:FREQ=DAILY';
    if (/매년.*크리스마스|크리스마스마다/.test(text))
      return 'RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25';

    // "매달 15일"
    const monthly = text.match(/매달\s*(\d{1,2})\s*일|매월\s*(\d{1,2})\s*일/);
    if (monthly) {
      const day = monthly[1] ?? monthly[2];
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`;
    }
    if (/매달|매월/.test(text)) return 'RRULE:FREQ=MONTHLY';

    // "매주 월·수·금" (점/중간점/슬래시 구분자)
    const multiWeekly = text.match(/매주\s*([월화수목금토일][·,\/\s][월화수목금토일·,\/\s]+)/);
    if (multiWeekly) {
      const days = multiWeekly[1].split(/[·,\/\s]+/).map(d => WEEKDAY_RRULE[d]).filter(Boolean);
      if (days.length > 0) return `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}`;
    }

    // "매주 월요일"
    const weekly = text.match(/매주\s*([월화수목금토일])/);
    if (weekly) {
      const rruleDay = WEEKDAY_RRULE[weekly[1]];
      if (rruleDay) return `RRULE:FREQ=WEEKLY;BYDAY=${rruleDay}`;
    }
    if (/매주/.test(text)) return 'RRULE:FREQ=WEEKLY';

    return null;
  }

  // ── 기간 ─────────────────────────────────────────────────

  parseDuration(text: string): number | null {
    // "1시간 동안", "2시간 회의"
    const hours = text.match(/(\d+)\s*시간\s*(?:동안|짜리|회의|미팅)?/);
    if (hours) return parseInt(hours[1], 10) * 60;

    // "30분짜리", "30분 동안"
    const mins = text.match(/(\d+)\s*분\s*(?:동안|짜리)?/);
    if (mins) return parseInt(mins[1], 10);

    return null;
  }

  // ── 시간 범위 "2시부터 4시까지" ─────────────────────────────

  private parseTimeRange(text: string, baseDate: Date | null): Date | null {
    const range = text.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*부터\s*(?:(오전|오후)\s*)?(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?(?:\s*까지)?/);
    if (range && baseDate) {
      let endH = parseInt(range[4], 10);
      const endM = range[5] ? parseInt(range[5], 10) : 0;
      const endMeridiem = range[3];
      if (endMeridiem === '오후' && endH < 12) endH += 12;
      else if (endMeridiem === '오전' && endH === 12) endH = 0;
      else if (!endMeridiem) {
        // Inherit PM context from start time already set in baseDate
        const startH = baseDate.getHours();
        if (startH >= 12 && endH < 12 && endH >= 1) endH += 12;
      }

      const end = new Date(baseDate);
      end.setHours(endH, endM, 0, 0);
      return end;
    }
    return null;
  }

  private parseEndTime(text: string, baseDate: Date | null): Date | undefined {
    if (!baseDate) return undefined;
    const dur = this.parseDuration(text);
    if (dur) return new Date(baseDate.getTime() + dur * 60_000);
    // 기본 1시간
    return new Date(baseDate.getTime() + 3_600_000);
  }

  // ── Confidence 계산 ────────────────────────────────────────

  private calcConfidence(
    dateCf: number,
    timeCf: number,
    hasDate: boolean,
    hasTime: boolean,
    hasRecurrence: boolean,
  ): number {
    if (hasRecurrence && hasTime) return Math.min(0.95, (dateCf + timeCf) / 2 + 0.1);
    if (hasRecurrence) return 0.85;
    if (hasDate && hasTime) return Math.min(0.97, (dateCf + timeCf) / 2);
    if (hasDate) {
      if (dateCf >= 0.9) return Math.min(0.92, dateCf);
      if (dateCf >= 0.8) return dateCf * 0.95;
      return dateCf * 0.85;
    }
    return 0.3;
  }

  // ── 재질문 생성 ───────────────────────────────────────────

  private buildClarificationQuestion(text: string, hasDate: boolean, hasTime: boolean): string {
    if (!hasDate && !hasTime) return '언제로 잡아드릴까요? 날짜와 시간을 말씀해주세요.';
    if (!hasDate) return '언제인지 날짜를 말씀해주세요.';
    if (!hasTime) return '몇 시로 잡아드릴까요?';
    return '다시 한번 말씀해주실 수 있나요?';
  }

  // ── 헬퍼 ──────────────────────────────────────────────────

  private getThisWeekday(target: number): Date {
    const ref = new Date(this.referenceDate);
    ref.setHours(9, 0, 0, 0);
    const curr = ref.getDay();
    const diff = (target - curr + 7) % 7;
    ref.setDate(ref.getDate() + (diff === 0 ? 7 : diff));
    return ref;
  }

  private getNextWeekday(target: number, weeksAhead: number): Date {
    const ref = new Date(this.referenceDate);
    ref.setHours(9, 0, 0, 0);
    const curr = ref.getDay();
    const daysToTarget = (target - curr + 7) % 7 || 7;
    ref.setDate(ref.getDate() + daysToTarget + (weeksAhead - 1) * 7);
    return ref;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }
}

export const createParser = (referenceDate = new Date(), timezone = 'Asia/Seoul') =>
  new KoreanDateParser(referenceDate, timezone);
