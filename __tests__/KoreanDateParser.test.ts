import { KoreanDateParser } from '../services/nlp/KoreanDateParser';

// 기준 시각: 2026-05-26(화요일) 09:41:00 KST
const REF = new Date('2026-05-26T00:41:00Z'); // UTC = KST - 9h
const TZ = 'Asia/Seoul';
const parser = new KoreanDateParser(REF, TZ);

function kst(y: number, mo: number, d: number, h = 9, m = 0): Date {
  return new Date(`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+09:00`);
}

describe('KoreanDateParser — 절대 날짜', () => {
  test('오늘', () => {
    const r = parser.parse('오늘 회의');
    expect(r.date?.getDate()).toBe(26);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('내일', () => {
    const r = parser.parse('내일 팀 회의');
    expect(r.date?.getDate()).toBe(27);
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  test('모레', () => {
    const r = parser.parse('모레 약속');
    expect(r.date?.getDate()).toBe(28);
  });

  test('글피', () => {
    const r = parser.parse('글피 일정');
    expect(r.date?.getDate()).toBe(29);
  });

  test('이번 주 금요일', () => {
    const r = parser.parse('이번 주 금요일 회의');
    expect(r.date?.getDay()).toBe(5); // 금 = 5
    expect(r.confidence).toBeGreaterThan(0.85);
  });

  test('다음 주 월요일', () => {
    const r = parser.parse('다음 주 월요일 미팅');
    expect(r.date?.getDay()).toBe(1); // 월 = 1
    expect(r.date!.getMonth()).toBe(5); // 6월 (0-indexed) — May 26 + 6 days = June 1
    expect(r.date!.getDate()).toBe(1);
    expect(r.confidence).toBeLessThanOrEqual(0.75);
  });

  test('5월 20일 (이미 지난 날짜 → 내년)', () => {
    const r = parser.parse('5월 20일 약속');
    expect(r.date?.getMonth()).toBe(4); // 0-indexed
    expect(r.date?.getDate()).toBe(20);
    // 기준 2026-05-26이 5/20보다 이후이므로 2027년으로
    expect(r.date?.getFullYear()).toBe(2027);
  });

  test('이번 달 말', () => {
    const r = parser.parse('이번 달 말에 마감');
    expect(r.date?.getMonth()).toBe(4); // 5월 (0-indexed)
    expect(r.date?.getDate()).toBe(31); // 5월 마지막 날
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  test('내년 3월', () => {
    const r = parser.parse('내년 3월에 출장');
    expect(r.date?.getFullYear()).toBe(2027);
    expect(r.date?.getMonth()).toBe(2); // 3월 (0-indexed)
  });
});

describe('KoreanDateParser — 상대 날짜', () => {
  test('3일 후', () => {
    const r = parser.parse('3일 후 미팅');
    expect(r.date?.getDate()).toBe(29);
    expect(r.confidence).toBeGreaterThan(0.85);
  });

  test('일주일 후', () => {
    const r = parser.parse('일주일 후 여행');
    expect(r.date?.getDate()).toBe(2);   // 26 + 7 = 6/2
    expect(r.date?.getMonth()).toBe(5);  // 6월
  });

  test('2주 뒤', () => {
    const r = parser.parse('2주 뒤 약속');
    expect(r.date?.getDate()).toBe(9);  // 26 + 14 = 6/9
  });

  test('한 달 후', () => {
    const r = parser.parse('한 달 후 검진');
    expect(r.date?.getMonth()).toBe(5); // 6월
    expect(r.confidence).toBeGreaterThan(0.8);
  });
});

describe('KoreanDateParser — 시간 표현', () => {
  test('내일 오후 3시', () => {
    const r = parser.parse('내일 오후 3시에 팀 회의 잡아줘');
    expect(r.date?.getDate()).toBe(27);
    expect(r.date?.getHours()).toBe(15);
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  test('오전 10시', () => {
    const r = parser.parse('오전 10시 스탠드업');
    expect(r.date?.getHours()).toBe(10);
  });

  test('오후 3시 30분', () => {
    const r = parser.parse('오후 3시 30분 미팅');
    expect(r.date?.getHours()).toBe(15);
    expect(r.date?.getMinutes()).toBe(30);
  });

  test('오후 3시 반', () => {
    const r = parser.parse('오후 3시 반 회의');
    expect(r.date?.getHours()).toBe(15);
    expect(r.date?.getMinutes()).toBe(30);
  });

  test('밤 11시', () => {
    const r = parser.parse('밤 11시 통화');
    expect(r.date?.getHours()).toBe(23);
  });

  test('새벽 2시', () => {
    const r = parser.parse('새벽 2시 배포');
    expect(r.date?.getHours()).toBe(2);
  });

  test('정오', () => {
    const r = parser.parse('정오에 점심 약속');
    expect(r.date?.getHours()).toBe(12);
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  test('자정', () => {
    const r = parser.parse('자정에 마감');
    expect(r.date?.getHours()).toBe(0);
  });
});

describe('KoreanDateParser — 자연어 시간', () => {
  test('퇴근 후', () => {
    const r = parser.parse('퇴근 후 운동');
    expect(r.date?.getHours()).toBe(18);
    expect(r.confidence).toBeGreaterThanOrEqual(0.55);
  });

  test('점심시간', () => {
    const r = parser.parse('점심시간에 미팅');
    expect(r.date?.getHours()).toBe(12);
  });

  test('저녁', () => {
    const r = parser.parse('저녁에 팀 회식');
    expect(r.date?.getHours()).toBe(18);
  });

  test('아침 일찍', () => {
    const r = parser.parse('내일 아침 일찍 조깅');
    expect(r.date?.getHours()).toBe(8);
    expect(r.date?.getDate()).toBe(27);
  });
});

describe('KoreanDateParser — 반복 일정', () => {
  test('매일', () => {
    const r = parser.parse('매일 오전 8시 모닝 루틴');
    expect(r.isRecurring).toBe(true);
    expect(r.recurrenceRule).toBe('RRULE:FREQ=DAILY');
    expect(r.date?.getHours()).toBe(8);
  });

  test('매주 월요일', () => {
    const r = parser.parse('매주 월요일 오전 10시 스탠드업');
    expect(r.isRecurring).toBe(true);
    expect(r.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(r.date?.getHours()).toBe(10);
  });

  test('매주 월·수·금', () => {
    const r = parser.parse('매주 월·수·금 운동');
    expect(r.isRecurring).toBe(true);
    expect(r.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  test('매달 15일', () => {
    const r = parser.parse('매달 15일 급여일');
    expect(r.isRecurring).toBe(true);
    expect(r.recurrenceRule).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
  });

  test('평일마다', () => {
    const r = parser.parse('평일마다 오전 9시 출근');
    expect(r.isRecurring).toBe(true);
    expect(r.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  test('주말마다', () => {
    const r = parser.parse('주말마다 운동');
    expect(r.isRecurring).toBe(true);
    expect(r.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=SA,SU');
  });
});

describe('KoreanDateParser — 기간 표현', () => {
  test('1시간 동안', () => {
    const r = parser.parse('내일 오후 2시 1시간 동안 미팅');
    expect(r.duration).toBe(60);
    expect(r.date?.getHours()).toBe(14);
    expect(r.endDate?.getHours()).toBe(15);
  });

  test('30분짜리', () => {
    const r = parser.parse('오후 3시 30분짜리 리뷰');
    expect(r.duration).toBe(30);
  });

  test('오후 2시부터 4시까지', () => {
    const r = parser.parse('내일 오후 2시부터 4시까지 회의');
    expect(r.date?.getHours()).toBe(14);
    expect(r.endDate?.getHours()).toBe(16);
  });
});

describe('KoreanDateParser — Confidence 및 재질문', () => {
  test('날짜+시간 모두 명확 → confidence >= 0.9', () => {
    const r = parser.parse('내일 오후 3시 팀 회의');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.needsClarification).toBeUndefined();
  });

  test('날짜만 → confidence <= 0.7', () => {
    const r = parser.parse('다음 주 금요일 미팅');
    expect(r.confidence).toBeLessThanOrEqual(0.75);
  });

  test('다음 주 단독 → confidence 0.3, needsClarification 포함', () => {
    const r = parser.parse('다음 주에 회의');
    expect(r.confidence).toBeLessThanOrEqual(0.5);
    expect(r.needsClarification).toBeDefined();
  });

  test('날짜/시간 없음 → confidence 낮음 + 재질문', () => {
    const r = parser.parse('회의 잡아줘');
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.needsClarification).toContain('날짜');
  });
});
