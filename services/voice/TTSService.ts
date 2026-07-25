import * as Speech from 'expo-speech';
import { ClassifiedIntent } from '../../types';

export class TTSService {
  private _lastMsg = '';
  private _lastAt  = 0;
  private _speaking = false;                      // 실제 재생 중 여부(onDone/onStopped/onError로 해제)
  private _settleListeners: Array<() => void> = []; // 발화 종료(정착) 1회 알림 대기열

  // bypassDedup: 사용자 응답을 요구하는 확인 질문 등은 절대 skip되지 않아야 함
  async speak(text: string, language = 'ko-KR', rate = 0.95, bypassDedup = false): Promise<void> {
    const now = Date.now();
    if (!bypassDedup && text === this._lastMsg && now - this._lastAt < 1200) {
      console.log('[TTS] dedup skip:', text);
      return;
    }
    this._lastMsg = text;
    this._lastAt  = now;
    this._speaking = true;
    return new Promise((resolve, reject) => {
      const done = () => { this._settle(); resolve(); };
      Speech.speak(text, {
        language,
        rate,
        onDone: done,
        onStopped: done,
        onError: (e) => { this._settle(); reject(new Error(String(e) ?? 'TTS 오류')); },
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

  // 확인 카드가 마이크를 열기 전 사용: 확인 발화가 끝나면 resolve. 발화가 끝내 안 오면
  // timeoutMs 후 폴백 resolve → 교착 방지(버튼은 항상 사용 가능).
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

  generateErrorMessage(type: 'network' | 'lowConfidence' | 'noSpeech' | 'unknown'): string {
    switch (type) {
      case 'network': return '인터넷 연결을 확인해주세요.';
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
        const dateStr = intent.startDateTime
          ? this.formatDateTime(intent.startDateTime.date, intent.startDateTime.originalText)
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
