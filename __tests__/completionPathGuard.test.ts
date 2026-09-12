// 소스 수준 회귀 가드 — 렌더 테스트로 덮을 수 없는 경로를 문자열로 고정한다.
//
// 왜 이런 테스트가 필요한가: jest의 testMatch가 '**/__tests__/**/*.test.ts'라 .tsx를 잡지 않고,
// DayViewScreen·EventActionSheet·TimeSpine·WeekViewScreen은 전부 .tsx다. 그런데 이번 버그의
// 원인이 정확히 "그 화면들이 공통 함수를 우회해 supabase를 직접 호출한 것"이었다.
// 동작을 실행해 검증할 수 없으니, 최소한 우회가 다시 생기는 것은 여기서 막는다.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'contexts', 'hooks', 'lib', 'modules', 'screens', 'services', 'stores', 'utils'];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('완료 경로 단일화', () => {
  test('completed_at을 쓰는 supabase update는 services/eventCompletion.ts 한 곳뿐이다', () => {
    // 이 패턴이 다른 파일에 생겼다 = 어떤 진입점이 공통 함수를 우회했다 = 알림 취소가 빠진다.
    const writesCompletedAt = /\.update\(\s*\{[^}]*completed_at/;
    const offenders = SOURCE_FILES
      .filter(f => writesCompletedAt.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f));

    expect(offenders).toEqual(['services/eventCompletion.ts']);
  });

  test('일간뷰 완료 핸들러는 setEventCompletion을 거친다', () => {
    const src = read('screens/DayViewScreen.tsx');
    expect(src).toContain("from '../services/eventCompletion'");
    expect(src).toMatch(/function handleCompleteEvent[\s\S]{0,400}setEventCompletion/);
  });
});

describe('삭제 경로 알림 취소', () => {
  test('EventActionSheet 반복 전체 삭제가 알림을 취소한다', () => {
    const src = read('components/EventActionSheet.tsx');
    expect(src).toContain("from '../services/notifications'");
    expect(src).toMatch(/handleDeleteAll[\s\S]{0,1600}cancelEventNotification\(/);
  });

  test.each([
    ['components/TimeSpine.tsx', 'handleDeleteRecurring'],
    ['screens/DayViewScreen.tsx', 'handleDeleteRecurring'],
    ['screens/WeekViewScreen.tsx', 'handleDeleteRecurring'],
  ])('%s의 반복 부분 삭제가 알림을 정리한다', (rel, fnName) => {
    const src = read(rel);
    const body = src.slice(src.indexOf(`function ${fnName}`));
    // scope 'this' / 'future' 양쪽 모두에서 호출되어야 한다.
    const hits = body.match(/reconcileRecurringDeletion\(/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(body).toContain("reconcileRecurringDeletion(event.id, 'this')");
    expect(body).toContain("reconcileRecurringDeletion(event.id, 'future')");
  });

  test.each([
    ['components/TimeSpine.tsx'],
    ['screens/DayViewScreen.tsx'],
    ['screens/WeekViewScreen.tsx'],
  ])('%s의 단일 삭제는 종전대로 알림을 취소한다 (회귀 방지)', (rel) => {
    expect(read(rel)).toContain('cancelEventNotification(');
  });
});
