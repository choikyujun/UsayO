import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceRecorder } from './useVoiceRecorder';
import { speechService } from '../services/voice/SpeechRecognitionService';
import { ttsService } from '../services/voice/TTSService';
import { evaluateConfirmSTT } from '../utils/voiceResponseMatcher';

// 확인 카드(단일 InlineConfirmCard / 복수 MultiConfirmCard)의 음성 확인 루프 공용 훅.
//
// 이 훅이 소유하는 것:
//   확인 TTS 종료 대기 → 마이크 오픈 → (침묵 카운트다운 ∥ 발화 폴링) → 단일 확정점(decide)
//   → 저장/취소/재질문/버튼 대기.
// 카드는 이 훅이 돌려주는 status/countdown을 '그리기만' 한다.
//
// 왜 훅인가(층 선택 근거): 렌더는 VoiceConfirmLayer로 공용화돼 있지만, 카운트다운을 그 층에 두면
// 음성 루프가 필요 없는 하이브리드(텍스트) ConfirmCard 경로에서도 훅이 무조건 실행된다
// (훅은 조건부 호출 불가 → 마이크가 열림). 그래서 로직은 훅, 렌더 분기는 레이어가 소유한다.
//
// ── 안전 규칙(회귀 방지의 핵심) ────────────────────────────────────────────────
// 자동 저장을 확정하는 조건은 **단 하나**: 레코더가 "2초 연속 무음"을 실측해 스스로 녹음을
// 끝냈을 때(onAutoStop)뿐이다. 벽시계 타이머는 어떤 경우에도 저장을 확정하지 않는다.
//
// 이전 구조는 확정 지점이 둘(3초 카운트다운 / 3.5초 STT)이었고, 앞선 카운트다운이 300~600ms
// 지연되는 hadSpeech를 근거로 단독 확정했다. 그래서 t≈2.7초 이후에 "취소"를 말하면 감지 전에
// 저장이 확정되고 녹음이 폐기됐다(취소가 저장으로 뒤집히는 회귀). 확정 지점을 decide() 하나로
// 모으고, 그 근거를 벽시계가 아니라 레코더의 무음 실측으로 바꿔 레이스를 구조적으로 제거한다.
//
// 카운트다운은 이제 '저장 예고 표시'일 뿐 아무것도 확정하지 않는다. 판정이 애매하면
// (무음을 확인 못 한 소음 환경 등) 저장하지 않고 재질문한다 — 잘못 저장하는 것보다 안전하다.

export const AUTO_SAVE_COUNTDOWN_S = 3;  // 침묵 시 자동 저장까지의 예고 표시(초). 확정 근거 아님.
const SPEECH_POLL_MS         = 100;      // 발화 감지 폴링 주기 — 감지 지연 최대 1초 → ~100ms
const NO_SPEECH_DEADLINE_MS  = 4_000;    // 발화 미감지 상태의 백스톱(소음으로 무음 판정 불가)
const SPEECH_DEADLINE_MS     = 8_000;    // 발화 감지 후 백스톱(말이 안 끝나는 경우)
const MAX_REASK              = 2;        // 발화 미인식 시 재질문 최대 횟수

const REASK_TTS       = '저장할까요? 저장 또는 취소라고 말씀해주세요.';
const BUTTON_WAIT_TTS = '잘 못 들었어요. 화면의 저장 또는 취소 버튼을 눌러주세요.';
const MIC_FAIL_TTS    = '마이크를 사용할 수 없어요. 화면의 저장 또는 취소 버튼을 눌러주세요.';

// 확인 응답용 레코더 파라미터(일반 발화 파라미터는 불변).
//  · silenceMs 2000     — 2초 연속 무음이면 레코더가 스스로 종료. 이것이 유일한 자동 저장 근거.
//  · speechWarmupMs 300 — 마이크 오픈 직후 트랜지언트/TTS 잔향을 hadSpeech 집계에서 제외.
//  · minSpeechMs 300    — 300ms 누적 발화가 있어야 hadSpeech=true(블립 오탐 방지).
// warmupMs는 기본값(1000ms) 유지 — 무음 타이머는 t=1.0s부터 → 침묵 시 auto-stop ≈ t=3.0s로
// 카운트다운(3초) 표시와 자연히 맞는다.
const CONFIRM_RECORDER_OPTS = { silenceMs: 2000, speechWarmupMs: 300, minSpeechMs: 300 };

// decide()를 부른 주체. 'silence'만 자동 저장 자격이 있다.
type DecideTrigger = 'silence' | 'deadline';

// 카드 하단에 표시할 상태. 사용자가 자기 발화가 인식됐는지 화면만 보고 알 수 있어야 한다.
export type ConfirmStatus =
  | 'countdown'        // N초 후 저장 (침묵 유지 중)
  | 'listening'        // 발화 감지 → 카운트다운 중단, 듣는 중
  | 'checking'         // 녹음 종료 → STT 판정 중
  | 'waiting'          // 자동 저장 정지(탭/재질문 초과/소음) → 버튼·음성 대기
  | 'mic-unavailable'; // 마이크 시작 실패 → 버튼만

export interface UseConfirmVoiceLoopOptions {
  onConfirm: () => void;
  onCancel: () => void;
  logTag?: string; // 로그 접두사('[Confirm]' / '[MultiConfirm]')
}

export interface ConfirmVoiceLoop {
  status: ConfirmStatus;
  countdown: number | null;   // status==='countdown'일 때 남은 초
  micActive: boolean;         // 녹음 중(파형 표시용)
  resolve: (result: 'confirm' | 'cancel') => void; // 버튼/배경 탭용(1회만 실행)
  pauseCountdown: () => void; // 카드 본문 탭 → 자동 저장 정지(재시작 없음)
}

export function useConfirmVoiceLoop({
  onConfirm,
  onCancel,
  logTag = '[Confirm]',
}: UseConfirmVoiceLoopOptions): ConfirmVoiceLoop {
  const [status, setStatus]       = useState<ConfirmStatus>('countdown');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [micActive, setMicActive] = useState(false);

  const confirmedRef  = useRef(false);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef     = useRef(false);
  const decidingRef   = useRef(false); // decide 재진입 방지(무음 auto-stop과 백스톱 동시 도착)
  const speechSeenRef = useRef(false); // 이번 사이클에서 발화가 감지됐는가
  const micOpenAtRef  = useRef(0);
  const reAskCountRef = useRef(0);
  const isActiveRef   = useRef(true);

  // 콜백은 최신 참조로 호출한다 — 루프 effect는 마운트 1회([])라 콜백을 직접 캡처하면
  // 부모의 최신 상태(voice.classifiedIntent 등)를 못 보는 stale closure가 된다.
  const onConfirmRef = useRef(onConfirm); onConfirmRef.current = onConfirm;
  const onCancelRef  = useRef(onCancel);  onCancelRef.current  = onCancel;

  // 레코더의 무음 auto-stop을 decide로 연결한다. 이 배선이 없으면 레코더가 t≈3초에 마이크를
  // 닫아도 아무도 모른 채 남은 시간 동안 '녹음되지 않는 발화'를 기다리게 된다(회귀의 공범).
  const decideRef = useRef<(t: DecideTrigger, uri?: string | null) => void>(() => {});
  const recorder  = useVoiceRecorder({
    ...CONFIRM_RECORDER_OPTS,
    onAutoStop: (uri) => decideRef.current('silence', uri),
  });

  const elapsed = () => (micOpenAtRef.current ? Date.now() - micOpenAtRef.current : -1);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(null);
  }, []);

  const clearTimers = useCallback(() => {
    clearCountdown();
    if (pollRef.current)     { clearInterval(pollRef.current); pollRef.current = null; }
    if (deadlineRef.current) { clearTimeout(deadlineRef.current); deadlineRef.current = null; }
  }, [clearCountdown]);

  // ── Guard: 한 번만 실행 ──────────────────────────────────────
  const resolve = useCallback((result: 'confirm' | 'cancel') => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    clearTimers();
    recorder.cancelRecording();
    result === 'confirm' ? onConfirmRef.current() : onCancelRef.current();
  }, [recorder, clearTimers]);

  // 카드 탭 → 자동 저장 정지(취소/저장이 아님 — 사용자가 읽고 결정 중이라는 신호).
  // 이후엔 음성("저장"/"취소") 또는 버튼으로만 진행. 자동 재시작하지 않는다.
  const pauseCountdown = useCallback(() => {
    if (confirmedRef.current || countdownRef.current == null) return;
    pausedRef.current = true;
    clearCountdown();
    setStatus('waiting');
    console.log(`${logTag} countdown paused(tap) @${elapsed()}ms`);
  }, [clearCountdown, logTag]);

  useEffect(() => {
    isActiveRef.current = true;

    const stopAuto = (reason: string, next: ConfirmStatus = 'waiting') => {
      clearTimers();
      pausedRef.current = true;
      setStatus(next);
      console.log(`${logTag} auto-save 정지(${reason}) @${elapsed()}ms`);
    };

    const buttonWait = async (reason: string) => {
      stopAuto(reason);
      setMicActive(false);
      await ttsService.speak(BUTTON_WAIT_TTS, undefined, undefined, true).catch(() => {});
    };

    // 마이크 시작 실패 → 음성 루프 종료 + 안내. 저장/취소 버튼은 항상 노출되므로 갇힘 없음.
    const tryStart = async (): Promise<boolean> => {
      const ok = await recorder.startRecording();
      if (!ok) {
        isActiveRef.current = false;
        stopAuto('mic-unavailable', 'mic-unavailable');
        setMicActive(false);
        await ttsService.speak(MIC_FAIL_TTS, undefined, undefined, true).catch(() => {});
      }
      return ok;
    };

    // ── 단일 확정점 ────────────────────────────────────────────────
    // 저장/취소/재질문을 결정하는 곳은 여기 하나뿐이다.
    //  · trigger='silence'  — 레코더가 2초 연속 무음을 실측하고 스스로 종료. **자동 저장의 유일한 근거.**
    //  · trigger='deadline' — 벽시계 백스톱. 저장 자격 없음 → 재질문/버튼 대기(안전한 쪽).
    const decide = async (trigger: DecideTrigger, autoStopUri?: string | null) => {
      if (decidingRef.current || confirmedRef.current || !isActiveRef.current) return;
      decidingRef.current = true;
      clearTimers();
      setMicActive(false);

      // auto-stop 경로는 레코더가 이미 종료·URI 확보. deadline 경로만 직접 종료한다.
      const uri = autoStopUri !== undefined ? autoStopUri : await recorder.stopRecording();
      if (confirmedRef.current || !isActiveRef.current) return;

      const spoke = recorder.hadSpeech(); // 누적 유효 발화 ≥ minSpeechMs
      console.log(`${logTag} decide trigger=${trigger} hadSpeech=${spoke} speechSeen=${speechSeenRef.current} reask=${reAskCountRef.current} @${elapsed()}ms`);

      if (!spoke) {
        // 발화 없음. 저장은 '레코더가 무음을 실측한 경우'에만, 그리고 첫 사이클에만 허용한다.
        if (trigger === 'silence' && reAskCountRef.current === 0 && !pausedRef.current) {
          console.log(`${logTag} 침묵 확정(무음 2초 실측) → 자동 저장`);
          setStatus('checking');
          resolve('confirm');
          return;
        }
        if (pausedRef.current) {
          // 탭으로 이미 정지된 상태 → 조용히 버튼 대기(재질문 TTS 없음)
          console.log(`${logTag} 정지 상태에서 무응답 → 버튼 대기`);
          stopAuto('paused-no-speech');
          return;
        }
        // 무음을 확인하지 못했거나(소음) 재질문 이후의 무응답 → 저장 금지.
        console.log(`${logTag} 무음 미확정(trigger=${trigger}) → 저장 보류, 버튼 대기`);
        await buttonWait(`no-speech(${trigger})`);
        return;
      }

      // 발화 감지 → STT 판정만 신뢰한다(자동 저장 없음).
      setStatus('checking');
      let action: 'confirm' | 'cancel' | 'unknown' = 'unknown';
      if (uri) {
        try {
          const stt = await speechService.transcribe(uri, 'ko', { mode: 'confirm' });
          const evaluated = evaluateConfirmSTT(stt); // 환각 방어(길이/신호/무음/신뢰) 후 키워드 판정
          action = evaluated.action;
          console.log(`${logTag} STT 판정 → ${action} | raw=${JSON.stringify(stt.transcript)} reason=${evaluated.reason ?? '-'} conf=${stt.confidence}`);
        } catch { action = 'unknown'; }
      } else {
        console.log(`${logTag} STT 생략 — 녹음 URI 없음`);
      }
      if (confirmedRef.current || !isActiveRef.current) return;

      if (action === 'confirm') { resolve('confirm'); return; }
      if (action === 'cancel')  { resolve('cancel');  return; }

      // 발화했으나 미인식 → 절대 자동확정하지 않고 재질문(초과 시 버튼 대기)
      if (reAskCountRef.current >= MAX_REASK) { await buttonWait('reask-exhausted'); return; }
      reAskCountRef.current += 1;
      console.log(`${logTag} 발화 미인식 — 재질문 ${reAskCountRef.current}`);
      await ttsService.speak(REASK_TTS, undefined, undefined, true).catch(() => {});
      if (!isActiveRef.current || confirmedRef.current) return;
      if (!(await tryStart())) return;
      if (!isActiveRef.current || confirmedRef.current) { recorder.cancelRecording(); return; }
      // 재질문 사이클: 카운트다운 없음(이미 한 번 말한 사용자에게 자동 저장 예고는 부적절).
      startCycle({ withCountdown: false });
    };
    decideRef.current = (t, uri) => { decide(t, uri).catch(() => {}); };

    // 발화 감지 → 카운트다운을 확실히 무력화하고 '듣는 중'으로 전환. 이후 판정은 STT만 신뢰.
    const onSpeechDetected = () => {
      if (speechSeenRef.current) return;
      speechSeenRef.current = true;
      const at = elapsed();
      clearCountdown();
      if (!pausedRef.current) setStatus('listening');
      console.log(`${logTag} 발화 감지 @${at}ms → 카운트다운 중단, STT 판정만 신뢰`);
      // 말이 끝날 때까지 여유를 준다. 보통은 레코더의 무음 auto-stop이 먼저 끝낸다.
      if (deadlineRef.current) clearTimeout(deadlineRef.current);
      deadlineRef.current = setTimeout(
        () => decideRef.current('deadline'),
        Math.max(SPEECH_DEADLINE_MS - at, 1_000),
      );
    };

    // 카운트다운은 '침묵이 이어지는 중'이라는 예고 표시일 뿐 — 만료해도 아무것도 확정하지 않는다.
    const startCountdown = () => {
      if (pausedRef.current || confirmedRef.current || !isActiveRef.current) return;
      let remaining = AUTO_SAVE_COUNTDOWN_S;
      setCountdown(remaining);
      setStatus('countdown');
      console.log(`${logTag} countdown start`);
      countdownRef.current = setInterval(() => {
        if (confirmedRef.current || !isActiveRef.current) { clearCountdown(); return; }
        remaining -= 1;
        if (remaining > 0) {
          setCountdown(remaining);
          console.log(`${logTag} countdown tick ${remaining}`);
          return;
        }
        // 만료: 저장하지 않는다. 레코더의 무음 실측(auto-stop)을 기다린다.
        clearCountdown();
        if (!pausedRef.current && !speechSeenRef.current) setStatus('checking');
        console.log(`${logTag} countdown 만료 — 확정 아님, 무음 실측 대기 @${elapsed()}ms`);
      }, 1000);
    };

    // 100ms 폴링: hadSpeech가 true로 뒤집히는 즉시 카운트다운 무력화.
    const startPoll = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (confirmedRef.current || !isActiveRef.current) return;
        if (!speechSeenRef.current && recorder.hadSpeech()) onSpeechDetected();
      }, SPEECH_POLL_MS);
    };

    // 한 녹음 사이클 시작(최초 1회 + 재질문마다).
    const startCycle = ({ withCountdown }: { withCountdown: boolean }) => {
      speechSeenRef.current = false;
      decidingRef.current   = false;
      micOpenAtRef.current  = Date.now();
      setMicActive(true);
      if (withCountdown) startCountdown();
      else setStatus('listening');
      startPoll();
      // 발화 미감지 상태의 백스톱. 소음으로 무음 auto-stop이 안 뜨는 환경에서 무한 대기를 막는다.
      // 저장 자격은 없다 — 여기로 만료되면 재질문/버튼 대기로 간다.
      deadlineRef.current = setTimeout(() => decideRef.current('deadline'), NO_SPEECH_DEADLINE_MS);
    };

    const run = async () => {
      // 확인 질문(useVoiceFlow가 발화)이 "시작→완전 종료"될 때까지 대기(폴백 포함).
      // 실제 발화에 바인딩되므로 안내 문구 길이("2개 일정 저장할까요?"처럼 짧아도)와 무관하게
      // 종료 시점에 resolve → 카운트다운 기준점은 단일/복수가 동일하다.
      await ttsService.waitForNextSpeechToFinish(1500, 8000);
      if (!isActiveRef.current || confirmedRef.current) return;

      if (!(await tryStart())) return;
      if (!isActiveRef.current || confirmedRef.current) { recorder.cancelRecording(); return; }
      startCycle({ withCountdown: true });
    };

    run();
    return () => {
      isActiveRef.current = false;
      clearTimers();
      recorder.cancelRecording();
    };
  }, []);

  return { status, countdown, micActive, resolve, pauseCountdown };
}
