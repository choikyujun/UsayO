/**
 * Korean calendar terms fed to Whisper as a prompt.
 * Improves recognition of domain-specific words that STT often mishears.
 * Keep under ~200 tokens — Whisper uses this as context, not instructions.
 */

const CALENDAR_TERMS = [
  // 인텐트 동사
  '잡아줘', '등록해줘', '추가해줘', '만들어줘',
  '바꿔줘', '수정해줘', '변경해줘', '옮겨줘',
  '취소해줘', '삭제해줘', '지워줘',
  '알려줘', '보여줘', '확인해줘',

  // 날짜/시간 표현
  '오늘', '내일', '모레', '어제',
  '이번 주', '다음 주', '저번 주',
  '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  '오전', '오후', '아침', '점심', '저녁', '밤', '새벽',
  '정오', '자정', '퇴근 후', '출근 전',
  '시', '분', '시간', '일 후', '주 후',

  // 반복 패턴
  '매일', '매주', '매월', '매년',
  '평일', '주말', '격주',

  // 카테고리/장소
  '회의', '미팅', '약속', '면담', '발표', '면접',
  '점심 약속', '저녁 약속', '출장', '워크숍', '세미나',
  '병원', '치과', '헬스장', '운동',
  '팀 회의', '팀장', '부장', '대리', '과장',

  // 앱 화면
  '캘린더', '달력', '일정', '스케줄',
  '다가올 일정', '이번 달', '오늘 일정',
];

export function buildWhisperPrompt(): string {
  return CALENDAR_TERMS.join(', ');
}
