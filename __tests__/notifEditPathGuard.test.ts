// 소스 수준 회귀 가드 — 수정 경로가 알림 재예약을 다시 빠뜨리는 것을 막는다.
//
// 왜 소스 가드인가: jest testMatch가 '**/__tests__/**/*.test.ts'라 .tsx를 잡지 않고,
// 제목·시간 수정 UI(EditTitleModal / EditTimeModal)와 그것을 띄우는 6개 화면은 전부 .tsx다.
// 그런데 이번 버그의 원인이 정확히 "제목 수정 경로에 재예약 호출이 없었다"였다.
// 동작으로 검증할 수 없으니(그건 notifications.contentReschedule.test.ts가 서비스 계층에서
// 덮는다), 최소한 호출이 사라지는 것과 화면별 중복 구현이 되살아나는 것은 여기서 막는다.

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
const rel = (abs: string) => path.relative(ROOT, abs);

// save(scope) 본문만 떼어 본다 — 파일 어딘가에 호출이 있는 것으로는 부족하고,
// 저장이 끝난 그 지점에서 불려야 한다.
function saveBody(src: string): string {
  const start = src.indexOf('async function save(scope: Scope)');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('\n  }', start));
}

describe('수정 경로 알림 재예약', () => {
  test.each([
    ['components/EditTitleModal.tsx', 'editTitle'],
    ['components/EditTimeModal.tsx',  'editTime'],
  ])('%s 의 save()가 공통 재예약 경로를 거친다', (file, caller) => {
    const src = read(file);
    expect(src).toContain("from '../services/notifications'");
    const body = saveBody(src);
    expect(body).toContain(`reconcileNotifAfterEdit(ev, scope, '${caller}')`);
    // 재예약 판정은 DB 쓰기가 끝난 뒤, 화면 콜백(onSaved)으로 넘어가기 전에 일어나야 한다.
    expect(body.indexOf('reconcileNotifAfterEdit')).toBeLessThan(body.indexOf('onSaved()'));
  });

  test('reconcileNotifAfterEdit을 쓰는 곳은 두 수정 모달뿐이다', () => {
    const callers = SOURCE_FILES
      .filter(f => /reconcileNotifAfterEdit\(/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(callers).toEqual([
      'components/EditTimeModal.tsx',
      'components/EditTitleModal.tsx',
      'services/notifications.ts', // 정의 지점
    ]);
  });

  test('화면이 재예약을 직접 구현하지 않는다', () => {
    // 종전에는 화면 5곳이 각자 events를 재조회해 rescheduleEventNotification을 불렀고,
    // 그 코드가 가상 인스턴스 id로 조회해 반복 일정에서는 아무것도 재예약하지 못했다.
    // HomeScreen에는 그 코드조차 없었다. 중복이 되살아나면 같은 구멍이 다시 생긴다.
    const offenders = SOURCE_FILES
      .filter(f => f.endsWith('.tsx'))
      .filter(f => /rescheduleEventNotification\(/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test('알림 content 필드를 events에 쓰는 파일은 재예약을 함께 책임지는 세 곳뿐이다', () => {
    // title / start_at 은 알림 content와 발화 시각에 그대로 들어간다.
    // 새 파일이 이 둘을 쓰기 시작했다면 재예약도 같이 붙였는지 확인해야 한다.
    const writesContent = /\.update\(\s*\{[^}]*\b(title|start_at)\b/;
    const offenders = SOURCE_FILES
      .filter(f => writesContent.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(offenders).toEqual([
      'components/EditTimeModal.tsx',
      'components/EditTitleModal.tsx',
      'hooks/useSchedules.ts',
    ]);
  });

  test('음성 UPDATE는 content 필드 변화를 보고 재예약한다', () => {
    const src = read('hooks/useSchedules.ts');
    expect(src).toContain("rescheduleIfNotifContentChanged(target, data as Event, 'voice-update')");
  });
});
