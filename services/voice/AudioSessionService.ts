import { Audio } from 'expo-av';

const NOISE_CACHE_TTL_MS = 60_000;

interface NoiseCache {
  snr: number;
  recommendation: 'voice' | 'hybrid' | 'text';
  measuredAt: number;
}

class AudioSessionService {
  private _permissionGranted = false;
  private _preinitDone = false;
  private _noiseCache: NoiseCache | null = null;

  // Called at app startup — caches permission + warms up audio session (no recording)
  async preinit(): Promise<void> {
    const t0 = Date.now();
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      this._permissionGranted = granted;
      if (granted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      }
      console.log('[AudioSession] preinit done in', Date.now() - t0, 'ms, granted:', granted);
    } catch (e) {
      console.log('[AudioSession] preinit error:', e);
    } finally {
      this._preinitDone = true;
    }
  }

  // Called just before createAsync — sets allowsRecordingIOS: true
  // Returns false if permission was not granted
  async prepareForRecording(): Promise<boolean> {
    const t0 = Date.now();
    if (!this._preinitDone) {
      const { granted } = await Audio.requestPermissionsAsync();
      this._permissionGranted = granted;
      this._preinitDone = true;
    }
    if (!this._permissionGranted) return false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    console.log('[AudioSession] prepareForRecording done in', Date.now() - t0, 'ms');
    return true;
  }

  async cleanup(): Promise<void> {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }

  // TTS 재생 후 녹음 진입 전에 호출: 재생 세션을 완전히 해제
  async releasePlaybackSession(): Promise<void> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    }).catch(() => {});
  }

  get permissionGranted(): boolean { return this._permissionGranted; }
  get initialized(): boolean { return this._preinitDone; }

  // Noise cache — avoids re-measuring on every tap within 60s
  getCachedNoise(): NoiseCache | null {
    if (!this._noiseCache) return null;
    if (Date.now() - this._noiseCache.measuredAt > NOISE_CACHE_TTL_MS) return null;
    return this._noiseCache;
  }

  setCachedNoise(snr: number, recommendation: 'voice' | 'hybrid' | 'text'): void {
    this._noiseCache = { snr, recommendation, measuredAt: Date.now() };
  }
}

export const audioSessionService = new AudioSessionService();
