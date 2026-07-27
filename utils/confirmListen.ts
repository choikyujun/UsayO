import { STTResult } from '../types';

// 확인성 음성 응답 공통 수신 루프.
// TTS 질문은 호출부가 await ttsService.speak(...)로 완료를 보장한 뒤 이 함수를 호출한다.
// (녹음 → hadSpeech로 발화/침묵 구분 → confirm 모드 STT → 환각 방어 분류 → 재질문/취소 사이클)
// 판정 결과(A)는 확장 가능: 카드=confirm/cancel, AM/PM=am/pm/cancel.

export interface ConfirmRecorder {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  hadSpeech: () => boolean;
}

export type ListenResult<A extends string> =
  | { kind: A }          // 인식된 응답(am/pm/cancel/confirm 등)
  | { kind: 'silence' }  // 무응답(침묵) — 호출부가 정책 결정(onSilence='return'일 때만)
  | { kind: 'giveup' };  // 재질문 한도 초과 또는 취소/언마운트

export interface ConfirmListenOptions<A extends string> {
  recorder: ConfirmRecorder;
  transcribe: (uri: string) => Promise<STTResult>;   // confirm/ampm 모드 STT 주입
  classify: (stt: STTResult) => A | 'unknown';       // 환각 방어 포함 분류
  reAsk: () => Promise<void>;                         // 재질문 발화(완료까지 await)
  isActive: () => boolean;                            // 취소/언마운트 감지
  recordMs?: number;                                 // 녹음 창 길이
  maxReAsk?: number;                                 // 재질문 최대 횟수
  onSilence?: 'reask' | 'return';                    // 침묵 처리: 재질문 / 호출부 반환
}

export async function listenForConfirmResponse<A extends string>(
  opts: ConfirmListenOptions<A>,
): Promise<ListenResult<A>> {
  const { recorder, transcribe, classify, reAsk, isActive } = opts;
  const recordMs = opts.recordMs ?? 3500;
  const maxReAsk = opts.maxReAsk ?? 2;
  const onSilence = opts.onSilence ?? 'reask';
  let reAskCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!isActive()) return { kind: 'giveup' };
    await recorder.startRecording();
    if (!isActive()) { recorder.cancelRecording(); return { kind: 'giveup' }; }

    await new Promise<void>((r) => setTimeout(r, recordMs));
    if (!isActive()) return { kind: 'giveup' };

    const uri = await recorder.stopRecording();
    const spoke = recorder.hadSpeech();

    let action: A | 'unknown' = 'unknown';
    if (spoke && uri) {
      try {
        action = classify(await transcribe(uri));
      } catch {
        action = 'unknown';
      }
    }
    if (!isActive()) return { kind: 'giveup' };

    // 발화 감지 + 인식 성공 → 그대로 반환
    if (spoke && action !== 'unknown') return { kind: action };

    // 침묵: 정책에 따라 반환하거나 재질문
    if (!spoke && onSilence === 'return') return { kind: 'silence' };

    // 침묵(reask) 또는 발화-미인식 → 재질문(한도 내), 초과 시 포기
    if (reAskCount >= maxReAsk) return { kind: 'giveup' };
    reAskCount += 1;
    console.log('[ConfirmListen] 재질문', reAskCount, spoke ? '(발화 미인식)' : '(무응답)');
    await reAsk();
  }
}
