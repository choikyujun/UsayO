import * as Speech from 'expo-speech';
import { ClassifiedIntent } from '../../types';

export class TTSService {
  private _lastMsg = '';
  private _lastAt  = 0;

  async speak(text: string, language = 'ko-KR', rate = 0.95): Promise<void> {
    const now = Date.now();
    if (text === this._lastMsg && now - this._lastAt < 1200) {
      console.log('[TTS] dedup skip:', text);
      return;
    }
    this._lastMsg = text;
    this._lastAt  = now;
    return new Promise((resolve, reject) => {
      Speech.speak(text, {
        language,
        rate,
        onDone: resolve,
        onError: (e) => reject(new Error(String(e) ?? 'TTS 오류')),
      });
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

  generateSuccessMessage(intent: ClassifiedIntent): string {
    switch (intent.intent) {
      case 'CREATE': return `${intent.title ?? '일정'}이 추가됐어요!`;
      case 'UPDATE': return '일정이 수정됐어요!';
      case 'DELETE':
        if (intent.targetEventIds && intent.targetEventIds.length > 1) {
          return `${intent.targetEventIds.length}개 일정이 삭제됐어요.`;
        }
        return '일정이 삭제됐어요.';
      case 'COMPLETE': return '일정을 완료 처리했어요!';
      case 'QUERY': return '';
      default: return '완료됐어요!';
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
