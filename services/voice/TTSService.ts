import * as Speech from 'expo-speech';
import { ClassifiedIntent } from '../../types';
import { formatRelativeDay } from '../../utils/dateHelpers';
import { formatTimeKo } from '../../utils/timeHelpers';

export class TTSService {
  private _lastMsg = '';
  private _lastAt  = 0;
  private _speaking = false;                      // 실제 재생 중 여부(onDone/onStopped/onError로 해제)
  private _speakSeq = 0;                           // 발화 시작 시퀀스(특정 발화 완료 바인딩용)
  private _settleListeners: Array<() => void> = []; // 발화 종료(정착) 1회 알림 대기열
  private _enabled = true;                          // 설정 "음성 확인(TTS)" 반영 — ThemeContext가 동기화
  private _rate = 0.95;                              // 설정 "TTS 속도"(yusay_tts_speed) 반영

  // 설정 토글 반영. OFF면 speak가 실제 발화 없이 즉시 정착(대기 로직 교착 방지).
  setEnabled(v: boolean): void { this._enabled = v; }
  // 저장된 TTS 속도 반영. speak 호출 시 rate 미지정이면 이 값을 사용.
  setRate(v: number): void { if (v > 0) this._rate = v; }

  // bypassDedup: 사용자 응답을 요구하는 확인 질문 등은 절대 skip되지 않아야 함
  // rate 미지정 시 설정값(_rate) 사용.
  async speak(text: string, language = 'ko-KR', rate?: number, bypassDedup = false): Promise<void> {
    const effectiveRate = rate ?? this._rate;
    if (!this._enabled) {
      // TTS OFF: 발화하지 않되, waitForNextSpeechToFinish가 새 발화로 인식하고 즉시 정착하도록 seq++/settle.
      this._speakSeq++;
      this._settle();
      return;
    }
    const now = Date.now();
    if (!bypassDedup && text === this._lastMsg && now - this._lastAt < 1200) {
      console.log('[TTS] dedup skip:', text);
      return;
    }
    this._lastMsg = text;
    this._lastAt  = now;
    this._speaking = true;
    this._speakSeq++;
    console.log('[TTS] speak start', Date.now(), JSON.stringify(text.slice(0, 16))); // [진단] 타임스탬프
    return new Promise((resolve, reject) => {
      const done = (via: string) => { console.log('[TTS] settled', Date.now(), 'via', via); this._settle(); resolve(); }; // [진단]
      Speech.speak(text, {
        language,
        rate: effectiveRate,
        onDone: () => done('onDone'),
        onStopped: () => done('onStopped'),
        onError: (e) => { console.log('[TTS] settled', Date.now(), 'via onError'); this._settle(); reject(new Error(String(e) ?? 'TTS 오류')); },
      });
    });
  }

  // 재생이 실제로 끝났음(onDone/onStopped/onError)을 신뢰 신호로 알린다 — isSpeakingAsync 폴링 대체.
  private _settle(): void {
    this._speaking = false;
    const listeners = this._settleListeners;
    this._settleListeners = [];
    listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });
  }

  get isSpeaking(): boolean {
    return this._speaking;
  }

  // 다음(또는 진행 중인) 발화가 끝나면 1회 호출. 반환값은 구독 해제 함수.
  onSpeechSettled(cb: () => void): () => void {
    this._settleListeners.push(cb);
    return () => { this._settleListeners = this._settleListeners.filter(f => f !== cb); };
  }

  // 확인 카드가 마이크를 열기 전 사용 (권장):
  // 카드 마운트 직후 호출 → "새로(다음) 시작되는 발화"가 시작될 때까지 기다린 뒤,
  // 그 발화가 완전히 끝나면 resolve. "아무 발화나 첫 settle"이 아니라 그 확인 발화에 바인딩.
  // - startWindowMs 내에 새 발화가 시작되지 않으면 폴백 resolve(TTS 실패 시 교착 방지, 버튼 사용 가능).
  // - 발화 시작 후엔 maxWaitMs 상한.
  async waitForNextSpeechToFinish(startWindowMs = 1500, maxWaitMs = 8000): Promise<void> {
    const seqAtCall = this._speakSeq;
    const t0 = Date.now();
    // 1) 새 발화 시작 대기 (부모 effect가 speak를 호출할 시간). _speakSeq는 speak 시작 시 증가.
    while (this._speakSeq === seqAtCall && Date.now() - t0 < startWindowMs) {
      await new Promise((r) => setTimeout(r, 30));
    }
    if (this._speakSeq === seqAtCall) return; // 새 발화 없음 → 폴백
    if (!this._speaking) return;              // 이미 끝남
    // 2) 그 발화가 끝날 때까지 대기 (settle 이벤트 + 상한)
    await new Promise<void>((resolve) => {
      const unsub = this.onSpeechSettled(() => { clearTimeout(timer); resolve(); });
      const timer = setTimeout(() => { unsub(); resolve(); }, maxWaitMs);
    });
  }

  // (레거시) 아무 발화나 첫 settle에 resolve — 조기 오픈 문제로 확인 카드에서는 사용하지 않음.
  awaitSpeechSettled(timeoutMs = 6000): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        unsub();
        clearTimeout(timer);
        resolve();
      };
      const unsub = this.onSpeechSettled(finish);
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  stop(): void {
    Speech.stop();
  }

  // TTS가 끝날 때까지 대기 (ConfirmCard 음성 응답 시작 전 호출)
  async waitForSpeech(maxWaitMs = 10000): Promise<void> {
    const start = Date.now();
    await new Promise<void>(r => setTimeout(r, 400)); // TTS 시작 대기
    return new Promise(resolve => {
      const check = async () => {
        if (Date.now() - start > maxWaitMs) { resolve(); return; }
        try {
          const speaking = await Speech.isSpeakingAsync();
          if (!speaking) { resolve(); return; }
        } catch { resolve(); return; }
        setTimeout(check, 200);
      };
      check();
    });
  }

  generateConfirmMessage(intent: ClassifiedIntent, language = 'ko'): string {
    if (language !== 'ko') return this.generateEnglishConfirm(intent);

    switch (intent.intent) {
      case 'CREATE': {
        if (intent.events?.length) {
          return `${intent.events.length}개 일정 저장할까요?`;
        }
        const title = intent.title ?? '일정';
        if (intent.ambiguous && intent.startDateTime) {
          const dt     = intent.startDateTime;
          const d      = new Date(dt.date);
          const h12    = d.getHours() % 12 || 12;
          const minStr = d.getMinutes() > 0 ? ` ${d.getMinutes()}분` : '';
          if (intent.suggestedMeridiem === 'PM') {
            return `오후 ${h12}시${minStr} 맞아요? 오전이면 말씀해주세요`;
          }
          return `오전 ${h12}시${minStr} 맞아요?`;
        }
        const dateStr = intent.startDateTime
          ? this.formatDateTime(intent.startDateTime.date, intent.startDateTime.originalText)
          : '';
        const recurStr = intent.startDateTime?.isRecurring ? ' (반복)' : '';
        return dateStr
          ? `${dateStr}에 ${title}을 잡았어요${recurStr}. 맞나요?`
          : `${title}을 추가할까요?`;
      }
      case 'UPDATE': {
        const target = intent.targetEventQuery ?? '일정';
        if (intent.updateFields?.startDateTime) {
          const newTime = this.formatDateTime(intent.updateFields.startDateTime.date);
          return `${target}을(를) ${newTime}으로 바꿀까요?`;
        }
        if (intent.updateFields?.title) {
          return `${target}의 제목을 "${intent.updateFields.title}"으로 바꿀까요?`;
        }
        return `${target}을(를) 수정할까요?`;
      }
      case 'DELETE': {
        if (intent.targetEventIds && intent.targetEventIds.length > 1) {
          return `${intent.targetEventIds.length}개 일정을 삭제할까요?`;
        }
        const target = intent.deleteTargetQuery ?? '이 일정';
        return `${target}을(를) 삭제할까요?`;
      }
      case 'COMPLETE': {
        const target = intent.completeTargetQuery ?? intent.targetEventQuery ?? '이 일정';
        return `${target}을(를) 완료 처리할까요?`;
      }
      case 'QUERY': {
        return '일정을 불러올게요.';
      }
      case 'NOTIFICATION_UPDATE': {
        const target = intent.targetEventQuery ?? '이 일정';
        const offset = intent.notificationOffsetMinutes;
        if (offset === null || offset === undefined) return `${target} 알림을 끌까요?`;
        if (offset === 0)     return `${target} 알림을 시작 시로 바꿀까요?`;
        if (offset < 60)     return `${target} 알림을 ${offset}분 전으로 바꿀까요?`;
        if (offset < 1440)   return `${target} 알림을 ${Math.round(offset / 60)}시간 전으로 바꿀까요?`;
        return `${target} 알림을 ${Math.round(offset / 1440)}일 전으로 바꿀까요?`;
      }
      default:
        return '다시 말씀해 주세요.';
    }
  }

  generateErrorMessage(type: 'network' | 'server' | 'lowConfidence' | 'noSpeech' | 'unknown'): string {
    switch (type) {
      case 'network': return '인터넷 연결을 확인해주세요.';
      case 'server': return '잠시 후 다시 시도해 주세요.';
      case 'lowConfidence': return '잘 못 들었어요. 다시 말씀해 주실래요?';
      case 'noSpeech': return '음성이 감지되지 않았어요. 다시 시도해주세요.';
      default: return '오류가 발생했어요. 다시 시도해주세요.';
    }
  }

  // 성공 문구는 실제 수행된 작업만 반영한다. intent별로 분리하며,
  // 범용 "완료됐어요" 공유 문구는 쓰지 않는다(거짓 성공 방지). QUERY/미지원은 빈 문자열.
  generateSuccessMessage(intent: ClassifiedIntent): string {
    switch (intent.intent) {
      case 'CREATE': {
        const title = intent.title ?? '일정';
        // [활동 시간대 규칙] 확정된 시각을 반드시 오전/오후로 읽어줌(originalText는 오전/오후 누락 →
        // 규칙/의도 불일치를 사용자가 귀로 잡을 수 있는 유일한 지점이라 생략·모호 금지).
        const dateStr = intent.startDateTime
          ? this.formatResultDateTime(intent.startDateTime.date)
          : '';
        const recurStr = intent.startDateTime?.isRecurring ? ' 반복 일정으로' : '';
        return dateStr ? `${dateStr}${recurStr} ${title} 등록했어요.` : `${title} 등록했어요.`;
      }
      case 'UPDATE': {
        const target = intent.targetEventQuery ?? '일정';
        if (intent.updateFields?.startDateTime?.date) {
          const newTime = this.formatDateTime(intent.updateFields.startDateTime.date);
          return `${target}을(를) ${newTime}으로 바꿨어요.`;
        }
        if (intent.updateFields?.title) {
          return `${target}의 제목을 "${intent.updateFields.title}"으로 바꿨어요.`;
        }
        return `${target}을(를) 수정했어요.`;
      }
      case 'DELETE': {
        if (intent.targetEventIds && intent.targetEventIds.length > 1) {
          return `${intent.targetEventIds.length}개 일정을 삭제했어요.`;
        }
        const target = intent.deleteTargetQuery ?? intent.targetEventQuery;
        return target ? `${target}을(를) 삭제했어요.` : '일정을 삭제했어요.';
      }
      case 'COMPLETE': {
        const target = intent.completeTargetQuery ?? intent.targetEventQuery;
        return target ? `${target}을(를) 완료 처리했어요.` : '일정을 완료 처리했어요.';
      }
      case 'QUERY': return ''; // QUERY 결과는 별도 조회 경로에서 직접 안내
      case 'NOTIFICATION_UPDATE': {
        const offset = intent.notificationOffsetMinutes;
        if (offset === null || offset === undefined) return '알림을 껐어요.';
        if (offset === 0) return '시작 시 알림으로 설정했어요.';
        if (offset < 60) return `${offset}분 전 알림으로 설정했어요.`;
        if (offset < 1440) return `${Math.round(offset / 60)}시간 전 알림으로 설정했어요.`;
        return `${Math.round(offset / 1440)}일 전 알림으로 설정했어요.`;
      }
      default: return ''; // 미지원 intent에 거짓 성공 문구를 발화하지 않음
    }
  }

  // 저장 결과 발화용: 상대 날짜(오늘/내일/모레/M월 D일) + 오전/오후 시각. 항상 오전/오후 명시.
  private formatResultDateTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
    const day = isToday ? '오늘' : formatRelativeDay(d, now);
    return `${day} ${formatTimeKo(d)}`;
  }

  private formatDateTime(iso: string, originalText?: string): string {
    if (originalText) return originalText;
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = d.getHours();
    const min = d.getMinutes();
    const ampm = hour < 12 ? '오전' : '오후';
    const h12 = hour % 12 || 12;
    const minStr = min > 0 ? ` ${min}분` : '';
    return `${month}월 ${day}일 ${ampm} ${h12}시${minStr}`;
  }

  private generateEnglishConfirm(intent: ClassifiedIntent): string {
    switch (intent.intent) {
      case 'CREATE': return `Create "${intent.title}"?`;
      case 'UPDATE': return `Update "${intent.targetEventQuery}"?`;
      case 'DELETE': return `Delete "${intent.deleteTargetQuery}"?`;
      case 'COMPLETE': return `Mark "${intent.completeTargetQuery ?? intent.targetEventQuery}" as done?`;
      default: return 'Confirm?';
    }
  }
}

export const ttsService = new TTSService();
