import * as Speech from 'expo-speech';

/** Speak a short prefill label in Korean (e.g. "오후 3시", "수요일 오후 2시"). */
export function speakPrefillLabel(label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Speech.speak(label, {
      language: 'ko-KR',
      rate:     0.95,
      onDone:   resolve,
      onError:  (e) => reject(new Error(String(e))),
    });
  });
}

export function stopPrefillTTS(): void {
  Speech.stop();
}
