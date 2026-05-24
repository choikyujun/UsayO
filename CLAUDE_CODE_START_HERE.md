# YuSay — Claude Code 개발 마스터 지시서
> 이 파일을 Claude Code에게 가장 먼저 전달하세요.
> 모든 개발 세션의 컨텍스트 기반 문서입니다.

---

## 프로젝트 한 줄 정의
**YuSay**: 타이핑 없이 음성만으로 스케줄을 생성·수정·삭제하는 Voice-First 캘린더 앱.
슬로건: "Yu say. It's done."

## 기술 스택 요약
- React Native + Expo SDK 52+
- Supabase (백엔드 전체)
- Claude Sonnet API (LLM 인텐트 분류)
- RevenueCat (인앱 결제)
- NativeWind (UI)
- Zustand (상태관리)

## 브랜드 컬러
```
Primary:  #534AB7  (Voice Purple)
Success:  #1D9E75  (Done Green)
Warning:  #EF9F27
Danger:   #D85A30
Dark BG:  #0E0C1F
```

## 개발 원칙
1. TypeScript strict mode 필수
2. 모든 기능에 FeatureGate 적용 (요금제 분기)
3. 음성 관련 코드는 반드시 오프라인 graceful 처리
4. RLS(Row Level Security) 모든 테이블 적용
5. 개인정보: 음성 녹음 파일 처리 후 즉시 삭제

## 프롬프트 파일 실행 순서
```
01 → 프로젝트 초기 설정 (먼저 실행)
02 → DB 스키마 (01 완료 후)
03 → 음성 엔진 (02 완료 후)
04 → 한국어 NLP (03과 병행 가능)
05~08 → 기능별 (순서 무관)
09~11 → UI 화면들 (순서 무관)
12~14 → 위젯·팀·결제 (마지막)
```

## 주요 파일 목록
```
YUSAY_MASTER.md              ← 전체 프로덕트 스펙
prompts/PROMPT_01_PROJECT_SETUP.md
prompts/PROMPT_02_DATABASE_SCHEMA.md
prompts/PROMPT_03_VOICE_ENGINE.md
prompts/PROMPT_04_KOREAN_NLP.md
prompts/PROMPT_05_to_08.md   ← 이벤트 매칭·소음·게이트·홈화면
prompts/PROMPT_09_to_11.md   ← 캘린더·다가올·설정·온보딩
prompts/PROMPT_12_to_14.md   ← 위젯·팀·결제
```

## 요금제 요약
| 플랜 | 가격 | 핵심 제한 |
|------|------|-----------|
| Free | 무료 | 음성 월 50회, 한국어만 |
| Pro  | ₩3,900/월 | 무제한, 4개 언어, 캘린더 연동 |
| Team | ₩9,900/인/월 | 팀 기능, 전체 언어, On-Device |

---
이 파일을 읽은 후 각 PROMPT 파일을 순서대로 실행해주세요.
