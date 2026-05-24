# PROMPT 03 — 음성 엔진 (STT + LLM 인텐트 분류 + TTS)
> Claude Code에게 전달하는 YuSay 핵심 음성 처리 프롬프트

---

당신은 React Native에서 음성 기반 스케줄 CRUD 시스템을 구현하는 시니어 개발자입니다.
YuSay 앱의 음성 처리 파이프라인 전체를 구현해주세요.

## 파이프라인 개요
```
마이크 입력 → 소음 감지 → STT 변환 → LLM 인텐트 분류
→ 날짜·시간 파싱 → 일정 처리 → TTS 재확인
→ 사용자 확정 → DB 저장
```

## 1. 마이크 녹음 (useVoiceRecorder hook)

```typescript
// hooks/useVoiceRecorder.ts
// expo-av를 사용한 음성 녹음 훅

interface VoiceRecorderState {
  isRecording: boolean;
  audioLevel: number;  // 0~1, 실시간 볼륨
  duration: number;    // ms
  transcript: string | null;
  error: string | null;
}

interface UseVoiceRecorderReturn extends VoiceRecorderState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>; // base64 audio 반환
  cancelRecording: () => void;
}
```

요구사항:
- expo-av Audio.Recording 사용
- 실시간 오디오 레벨 측정 (100ms 인터벌)
- 최대 녹음 시간: 30초 자동 정지
- 무음 감지: 2초 이상 무음 시 자동 정지
- 녹음 완료 후 base64 인코딩 반환
- 오류 처리: 권한 없음, 장치 없음, 저장 실패

## 2. STT 변환 서비스

```typescript
// services/voice/SpeechRecognitionService.ts

interface STTResult {
  transcript: string;
  confidence: number;  // 0~1
  language: string;
  alternatives?: Array<{ transcript: string; confidence: number }>;
}

class SpeechRecognitionService {
  // Whisper API 호출 (기본)
  async transcribeWithWhisper(audioBase64: string, language: string): Promise<STTResult>
  
  // Google STT 호출 (대안, 더 빠름)
  async transcribeWithGoogle(audioBase64: string, language: string): Promise<STTResult>
  
  // 신뢰도 기반 자동 선택
  async transcribe(audioBase64: string, language: string): Promise<STTResult>
}
```

요구사항:
- Whisper API: `https://api.openai.com/v1/audio/transcriptions`
- 지원 언어: ko, en, ja, th, id, vi
- confidence < 0.6이면 FAIL 처리
- 오프라인 시 에러 반환 (graceful)

## 3. LLM 인텐트 분류 (핵심)

```typescript
// services/voice/IntentClassifierService.ts

type IntentType = 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY' | 'UNKNOWN';

interface ParsedDateTime {
  date: string;          // ISO8601
  isRecurring: boolean;
  recurrenceRule?: string;  // iCal RRULE
  confidence: number;
  originalText: string;   // "내일 오후 3시"
}

interface ClassifiedIntent {
  intent: IntentType;
  confidence: number;
  // CREATE 전용
  title?: string;
  startDateTime?: ParsedDateTime;
  endDateTime?: ParsedDateTime;
  location?: string;
  // UPDATE 전용
  targetEventQuery?: string;  // "팀 회의"
  updateFields?: {
    startDateTime?: ParsedDateTime;
    title?: string;
    location?: string;
  };
  // DELETE 전용
  deleteTargetQuery?: string;
  // QUERY 전용
  queryRange?: { start: string; end: string };
  queryType?: 'list' | 'free_slots' | 'specific';
}

class IntentClassifierService {
  async classify(transcript: string, language: string, userTimezone: string): Promise<ClassifiedIntent>
}
```

LLM 프롬프트 (Claude Sonnet API 사용):
```
시스템 프롬프트:
당신은 음성 캘린더 앱의 자연어 처리 엔진입니다.
사용자의 발화를 분석하여 정확한 JSON을 반환하세요.
현재 시각: {currentDateTime}
사용자 타임존: {timezone}

규칙:
- 날짜/시간이 불명확하면 confidence를 0.5 이하로 설정
- "오후"는 PM, "오전"은 AM
- "내일", "모레", "다음 주" 등 상대 표현을 절대 날짜로 변환
- "퇴근 후"는 18:00, "점심"은 12:00, "저녁"은 18:00으로 기본값
- 반드시 JSON만 반환, 다른 텍스트 금지

반환 형식: ClassifiedIntent JSON
```

## 4. TTS 음성 피드백

```typescript
// services/voice/TTSService.ts

class TTSService {
  // 확인 메시지 읽기
  async speak(text: string, language: string): Promise<void>
  
  // 미리 정의된 확인 메시지 생성
  generateConfirmMessage(intent: ClassifiedIntent, language: string): string
  
  // 예시:
  // CREATE: "내일 오후 3시에 팀 회의 잡았어요. 맞나요?"
  // UPDATE: "팀 회의를 4시로 바꿀까요?"
  // DELETE: "내일 팀 저녁을 삭제할까요?"
  // QUERY: "이번 주 일정 8개입니다. 월요일부터 말씀드릴게요..."
  
  stop(): void
}
```

## 5. 전체 음성 플로우 오케스트레이터

```typescript
// services/voice/VoiceFlowOrchestrator.ts

class VoiceFlowOrchestrator {
  async startVoiceFlow(): Promise<VoiceFlowResult>
  // 1. 소음 감지 (NoiseDetectorService)
  // 2. 녹음 시작
  // 3. STT 변환
  // 4. confidence 체크 → 실패 시 FAIL 플로우
  // 5. LLM 인텐트 분류
  // 6. TTS 재확인 메시지
  // 7. 사용자 응답 대기 (음성 또는 탭)
  // 8. 확정 시 EventService에 위임
  // 9. 완료 TTS + UI 업데이트
}
```

## 6. 상태 관리

```typescript
// stores/useVoiceStore.ts (Zustand)
interface VoiceStore {
  phase: 'idle' | 'listening' | 'processing' | 'confirming' | 'success' | 'fail';
  transcript: string | null;
  classifiedIntent: ClassifiedIntent | null;
  audioLevel: number;
  startVoice: () => Promise<void>;
  confirmAction: () => Promise<void>;
  cancelAction: () => void;
  retryVoice: () => Promise<void>;
  switchToHybrid: () => void;
}
```

모든 코드는 TypeScript strict mode, 에러 핸들링 완비, 단위 테스트 포함.
API 키는 반드시 환경변수에서 읽도록 구현해주세요.
