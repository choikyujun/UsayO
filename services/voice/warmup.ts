import { audioSessionService } from './AudioSessionService';

let warmedUp = false;

// Called once at app startup after noise measurement completes.
// Primes the iOS AVAudioSession mode switch so the first mic tap has no cold-start delay.
export async function warmupVoiceServices(): Promise<void> {
  if (warmedUp) return;
  warmedUp = true;
  try {
    // iOS audio mode switch warmup: allowsRecordingIOS false→true→false
    // NoiseDetector already did true→false; doing it once more removes first-tap latency.
    if (audioSessionService.permissionGranted) {
      await audioSessionService.prepareForRecording();
      await audioSessionService.cleanup();
      console.log('[Warmup] audio mode primed');
    }

    // Force-evaluate intent classifier module (avoids lazy-parse on first tap)
    await import('./IntentClassifierService');

    // Prime expo-speech TTS native module
    const Speech = await import('expo-speech');
    Speech.speak('', { volume: 0, rate: 4 });

    console.log('[Warmup] 음성 모듈 사전 초기화 완료');
  } catch (e) {
    console.log('[Warmup] 일부 실패:', (e as Error).message);
  }
}
