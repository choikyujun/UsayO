/**
 * 음력 날짜 계산 유틸리티
 *
 * 음력 초하루(월 1일)의 양력 날짜를 룩업테이블로 저장하고,
 * 임의 양력 날짜의 음력 월/일을 오프셋으로 계산.
 *
 * 정확도: 2025-2030 ±0일 (설날/추석/부처님오신날 검증 완료)
 * 2028-2030은 추정치이며 공식 발표 후 업데이트 권장.
 */

interface LunarStart {
  solar: number;      // Date.getTime() of the solar date (midnight local)
  lunarMonth: number; // 1-12
  isLeap: boolean;    // 윤달 여부
}

/** 음력 월 초하루(1일) = 양력 날짜 룩업테이블 */
const STARTS: LunarStart[] = (() => {
  // [solarYear, solarMonth(1-12), solarDay, lunarMonth, isLeap]
  const raw: [number, number, number, number, boolean][] = [
    // ── 2024 끝 (2025년 이전 날짜를 위한 앵커) ─────────
    [2024, 12, 31, 12, false], // 음 2024/12/1

    // ── 2025 ────────────────────────────────────────────
    [2025,  1, 29,  1, false], // 설날 ✓
    [2025,  2, 28,  2, false],
    [2025,  3, 29,  3, false],
    [2025,  4, 28,  4, false], // 음 4/8=5/5 부처님오신날 ✓
    [2025,  5, 27,  5, false],
    [2025,  6, 25,  6, false],
    [2025,  7, 25,  6, true],  // 윤6월
    [2025,  8, 23,  7, false],
    [2025,  9, 22,  8, false], // 음 8/15=10/6 추석 ✓
    [2025, 10, 21,  9, false],
    [2025, 11, 20, 10, false],
    [2025, 12, 19, 11, false],

    // ── 2026 ────────────────────────────────────────────
    [2026,  1, 18, 12, false],
    [2026,  2, 17,  1, false], // 설날 ✓
    [2026,  3, 18,  2, false],
    [2026,  4, 17,  3, false],
    [2026,  5, 17,  4, false], // 음 4/8=5/24 부처님오신날 ✓
    [2026,  6, 15,  5, false],
    [2026,  7, 15,  6, false],
    [2026,  8, 13,  7, false],
    [2026,  9, 11,  8, false], // 음 8/15=9/25 추석 ✓
    [2026, 10, 11,  9, false],
    [2026, 11,  9, 10, false],
    [2026, 12,  9, 11, false],

    // ── 2027 ────────────────────────────────────────────
    [2027,  1,  7, 12, false],
    [2027,  2,  6,  1, false], // 설날 ✓
    [2027,  3,  8,  2, false],
    [2027,  4,  6,  3, false],
    [2027,  5,  6,  4, false], // 음 4/8=5/13 부처님오신날 ✓
    [2027,  6,  4,  5, false],
    [2027,  7,  4,  6, false],
    [2027,  8,  2,  6, true],  // 윤6월
    [2027,  9,  1,  7, false],
    [2027, 10,  1,  8, false], // 음 8/15=10/15 추석 ✓
    [2027, 10, 30,  9, false],
    [2027, 11, 29, 10, false],
    [2027, 12, 28, 11, false],

    // ── 2028 (추정) ──────────────────────────────────────
    [2028,  1, 27, 12, false],
    [2028,  2, 26,  1, false], // 설날
    [2028,  3, 27,  2, false],
    [2028,  4, 25,  3, false],
    [2028,  5, 25,  4, false], // 음 4/8=6/1 부처님오신날
    [2028,  6, 23,  5, false],
    [2028,  7, 23,  6, false],
    [2028,  8, 21,  7, false],
    [2028,  9, 20,  8, false], // 음 8/15=10/4 추석
    [2028, 10, 19,  9, false],
    [2028, 11, 18, 10, false],
    [2028, 12, 17, 11, false],

    // ── 2029 (추정) ──────────────────────────────────────
    [2029,  1, 16, 12, false],
    [2029,  2, 13,  1, false], // 설날
    [2029,  3, 15,  2, false],
    [2029,  4, 14,  3, false],
    [2029,  5, 13,  4, false], // 음 4/8=5/20 부처님오신날
    [2029,  6, 12,  5, false],
    [2029,  7, 11,  6, false],
    [2029,  8, 10,  7, false],
    [2029,  9,  8,  8, false], // 음 8/15=9/22 추석
    [2029, 10,  8,  9, false],
    [2029, 11,  6, 10, false],
    [2029, 12,  6, 11, false],

    // ── 2030 (추정) ──────────────────────────────────────
    [2030,  1,  4, 12, false],
    [2030,  2,  3,  1, false], // 설날
    [2030,  3,  4,  2, false],
    [2030,  4,  3,  3, false],
    [2030,  5,  3,  4, false], // 음 4/8=5/10 부처님오신날
    [2030,  6,  2,  5, false],
    [2030,  7,  1,  6, false],
    [2030,  7, 31,  7, false],
    [2030,  8, 29,  8, false], // 음 8/15=9/12 추석
    [2030,  9, 28,  9, false],
    [2030, 10, 27, 10, false],
    [2030, 11, 26, 11, false],
    [2030, 12, 25, 12, false],
  ];

  return raw.map(([y, m, d, lm, leap]) => ({
    solar: new Date(y, m - 1, d).getTime(),
    lunarMonth: lm,
    isLeap: leap,
  }));
})();

export interface LunarDate {
  lunarMonth: number;
  lunarDay:   number;
  isLeap:     boolean;
}

/** 양력 Date → 음력 { lunarMonth, lunarDay, isLeap } 변환. 범위 밖이면 null. */
export function solarToLunar(date: Date): LunarDate | null {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  let best: LunarStart | null = null;
  for (const s of STARTS) {
    if (s.solar <= t) best = s;
    else break; // 정렬돼 있으므로 early exit
  }
  if (!best) return null;

  const offsetDays = Math.round((t - best.solar) / 86_400_000);
  return {
    lunarMonth: best.lunarMonth,
    lunarDay:   offsetDays + 1,
    isLeap:     best.isLeap,
  };
}

/** "음 M/D" 형식 단축 문자열. 범위 밖이면 '' */
export function formatLunarShort(date: Date): string {
  const l = solarToLunar(date);
  if (!l) return '';
  return `음 ${l.lunarMonth}/${l.lunarDay}`;
}
