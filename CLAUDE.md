# YuSay — CLAUDE.md

## 프로젝트 개요

**YuSay**는 타이핑 없이 음성만으로 스케줄을 생성·수정·삭제하는 Voice-First 캘린더 앱이다.
슬로건: *"Yu say. It's done."*

핵심 차별점:
- **Full-Cycle Voice CRUD**: 생성뿐 아니라 수정·삭제까지 완전 음성 제어 (경쟁 앱은 생성만 가능)
- **한국어/아시아어 특화**: 비영어권 음성 인식 최적화 (사실상 블루오션)
- **AI 재확인 플로우**: "3시에 회의 잡았어요, 맞나요?" 방식으로 오인식 즉시 보정

## 기술 스택

| 계층 | 기술 |
|------|------|
| 프레임워크 | React Native + Expo |
| 백엔드/DB | Supabase (PostgreSQL + RLS) |
| 음성 인식(STT) | Whisper API 또는 Google Speech-to-Text |
| AI/LLM | Claude API (Anthropic) 또는 OpenAI GPT |
| TTS | expo-speech 또는 플랫폼 네이티브 TTS |
| 오디오 | expo-av (마이크 레벨 측정, 노이즈 감지) |
| 언어 | TypeScript |

## 핵심 아키텍처

음성 입력 처리 파이프라인:
```
마이크 입력
  → 노이즈 레벨 감지 (expo-av)
  → STT 변환 (Whisper / Google STT)
  → LLM 인텐트 분류 → { intent, entities } JSON
  → TTS 재확인 피드백
  → 사용자 확인
  → Supabase DB 반영
```

LLM이 분류하는 4가지 인텐트:
- `CREATE` — 새 일정 생성 (날짜, 시간, 제목, 반복 여부 추출)
- `UPDATE` — 기존 일정 수정 (대상 식별 + 변경 필드 추출)
- `DELETE` — 기존 일정 삭제 (대상 식별 + 확인 플로우)
- `QUERY` — 일정 조회 ("이번 주 일정 알려줘")

## MVP 개발 범위 (Phase 1, 0~3개월)

1. 음성 스케줄 생성
2. 음성 스케줄 수정
3. 음성 스케줄 삭제
4. AI 재확인 플로우 (TTS 피드백 + 확인 UI)
5. 한국어 자연어 날짜/시간 파싱

Phase 1 목표: 앱스토어 출시 / DAU 1,000

## 브랜딩

- 컬러: Primary `#534AB7` (Voice Purple), Deep `#26215C` (Night Ink)
- 서브 컬러: Accent `#AFA9EC`, Background `#EEEDFE`, Success `#1D9E75`

## Supabase 설계 원칙

- Row Level Security(RLS) 필수 적용
- 본인 일정만 수정 가능, 타인 일정은 요청(request)만 가능
- 음성 녹음 데이터는 처리 후 즉시 삭제 (개인정보 정책)
- B2B Phase에서 WokyToky의 `workers`, `companies` 테이블과 연동 예정

## 한국어 날짜/시간 파싱 규칙

파싱 대상 표현 예시:
- "내일 오후 3시" → tomorrow 15:00
- "다음 주 금요일 저녁" → next Friday 18:00~21:00
- "매주 월요일 10시" → recurring every Monday 10:00
- "3일 후 점심시간" → +3 days 12:00
- "오늘 퇴근 후" → today 18:00

파싱 결과 형식:
```ts
{
  date: string        // ISO8601
  isRecurring: boolean
  recurrenceRule?: string
  confidence: number  // 0~1
}
```
confidence가 낮으면 사용자에게 재질문하는 fallback 필수.

## 모호한 일정 매칭 (수정/삭제용)

- 후보가 여러 개이면 음성으로 선택지 제공: "내일 오후에 일정이 2개 있어요. 팀 회의인가요, 고객 미팅인가요?"
- 후보가 없으면: "해당 날짜에 일정이 없어요" 피드백
- 퍼지 매칭 쿼리로 제목이 정확하지 않아도 식별

## 노이즈 대응 하이브리드 모드

- SNR < 15dB 또는 confidence score 낮을 때 자동 전환
- 하이브리드 모드: 날짜/시간만 음성, 나머지는 스마트 자동완성

## 관련 링크

- WokyToky GitHub: https://github.com/choikyujin/wokytoky
- Supabase 대시보드: (프로젝트 생성 후 추가)

## 개발 시 주의사항

- Voice-First 원칙: 앱 실행 즉시 음성 대기 상태, 타이핑은 보조 수단
- 음성 녹음 파일은 STT 완료 즉시 메모리에서 제거, 서버에 저장 금지
- 삭제 인텐트는 반드시 TTS 확인 단계를 거친 뒤 실행
- 새 LLM 프롬프트 작성 시 한국어 날짜/시간 표현 테스트 케이스 포함
