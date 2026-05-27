import { localDateStr } from '../utils/timeHelpers';

/** Fixed solar-calendar Korean public holidays (MM-DD) */
const SOLAR: Record<string, true> = {
  '01-01': true, '03-01': true, '05-05': true,
  '06-06': true, '08-15': true, '10-03': true,
  '10-09': true, '12-25': true,
};

/** Pre-calculated lunar-based holiday dates (YYYY-MM-DD) */
const LUNAR_DATES: Set<string> = new Set([
  // 설날 연휴
  '2025-01-28','2025-01-29','2025-01-30',
  '2026-02-16','2026-02-17','2026-02-18',
  '2027-02-05','2027-02-06','2027-02-07',
  '2028-02-25','2028-02-26','2028-02-27',
  '2029-02-12','2029-02-13','2029-02-14',
  '2030-02-02','2030-02-03','2030-02-04',
  // 추석 연휴
  '2025-10-05','2025-10-06','2025-10-07',
  '2026-09-24','2026-09-25','2026-09-26',
  '2027-10-14','2027-10-15','2027-10-16',
  '2028-10-03','2028-10-04','2028-10-05',
  '2029-09-21','2029-09-22','2029-09-23',
  '2030-09-11','2030-09-12','2030-09-13',
  // 부처님 오신 날
  '2025-05-05','2026-05-24','2027-05-13',
  '2028-06-01','2029-05-20','2030-05-10',
]);

export function isKoreanHoliday(date: Date): boolean {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return !!SOLAR[mmdd] || LUNAR_DATES.has(localDateStr(date));
}
