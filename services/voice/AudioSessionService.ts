import { Audio } from 'expo-av';
import { MAX_DURATION_MS } from '../../constants/voiceRecording';

const NOISE_CACHE_TTL_MS = 60_000;

interface NoiseCache {
  snr: number;
  recommendation: 'voice' | 'hybrid' | 'text';
  measuredAt: number;
}

export type MicOwner = 'voice' | 'noise-measure';

class AudioSessionService {
  private _permissionGranted = false;
  private _preinitDone = false;
  private _noiseCache: NoiseCache | null = null;

  // ── 마이크 단일 소유권 게이트 ────────────────────────────────
  // Audio.Recording은 동시에 하나만 준비할 수 있다('Only one Recording object').
  // 녹음을 만드는 모든 지점(useVoiceRecorder, NoiseDetectorService)은 이 게이트를 경유해
  // 소유권을 획득/반납한다. 소유자가 있을 때의 정책은 acquireMic 참조.
  private _micOwner: MicOwner | null = null;
  private _ownerAbort: (() => Promise<void>) | null = null;
  private _ownerSince = 0; // 소유권 획득 시각 — stale lock 회수 판정용

  // release 누락 등으로 락이 영구히 잠기는 것을 막는 안전 임계값(마지막 안전망).
  // **녹음 최대 길이(MAX_DURATION_MS)보다 반드시 커야 한다**: 정상 녹음은 max에서
  // 자동 종료·반납되므로, 이보다 긴 시간 잡혀 있으면 그 락은 '라이브 녹음이 아니라
  // 누수'로 확정된다 → stale 회수가 라이브 녹음을 건드릴 일이 원천적으로 없다.
  private static readonly STALE_LOCK_MS = MAX_DURATION_MS + 10_000; // 현재 40초

  get micOwner(): MicOwner | null { return this._micOwner; }

  // 소유권 획득. 반환값이 false면 요청자는 녹음을 만들면 안 된다.
  // 평가 순서(고정):
  //   (0) 소유권 보유 시간이 STALE_LOCK_MS 초과면 그 락은 '누수'로 무효 처리 → onAbort로
  //       고아 리소스 정리·await 후 소유자 해제 → 이후 '소유자 없음'으로 정상 평가.
  //       STALE_LOCK_MS > MAX_DURATION_MS 라 stale 락이 '라이브 녹음'일 가능성은 없다
  //       (정상 녹음은 max에서 자동 종료·반납되므로 그 시간을 넘겨 잡혀 있으면 누수 확정).
  //   (1) 이후 fresh 락에 대해서만: 같은 소유자 재진입 → 거부.
  //   (2) 이후 fresh 락에 대해서만: 소유권 정책('voice'가 'noise-measure' 선점 /
  //       'noise-measure'는 'voice'에 양보=거부).
  // (0)을 최상위에 두어 'voice 락 누수 후 voice 재요청'이 (1) 재진입 거부에 끊기지 않고
  // stale 회수 경로에 도달하게 한다(이 경로가 stale 회수를 만든 본래 목적).
  async acquireMic(owner: MicOwner, onAbort?: () => Promise<void>): Promise<boolean> {
    // (0) stale 먼저 — 누수 락 무효화 후 소유자 해제.
    if (this._micOwner !== null && Date.now() - this._ownerSince >= AudioSessionService.STALE_LOCK_MS) {
      const cur = this._micOwner;
      const heldMs = Date.now() - this._ownerSince;
      let cleanup: 'ok' | 'failed' | 'none' = 'none';
      const abort = this._ownerAbort;
      this._ownerAbort = null;
      if (abort) {
        try { await abort(); cleanup = 'ok'; }
        catch (e) { cleanup = 'failed'; console.log('[Mic] stale abort 예외 — 회수 계속:', (e as Error)?.message); }
      }
      console.log(`[Mic] stale lock reclaimed owner='${cur}' heldMs=${heldMs} cleanup=${cleanup}`);
      this._micOwner = null;
      this._ownerSince = 0;
    }

    // 소유자 있음(= fresh, stale는 위에서 이미 해제됨) → (1)(2) 판정.
    if (this._micOwner !== null) {
      const cur = this._micOwner;
      // (1) 같은 소유자 재진입 → 거부
      if (cur === owner) {
        console.log(`[Mic] acquire → denied owner='${owner}' (재진입: 이미 소유)`);
        return false;
      }
      // (2) 소유권 정책
      if (owner === 'voice' && cur === 'noise-measure') {
        console.log("[Mic] acquire → 'voice' preempts 'noise-measure' (abort 완료 대기)");
        const abort = this._ownerAbort;
        this._ownerAbort = null;
        try { await abort?.(); } catch { /* abort 실패는 무시 — 이전 강행 */ }
        this._micOwner = 'voice';
        this._ownerAbort = onAbort ?? null;
        this._ownerSince = Date.now();
        console.log("[Mic] acquire → granted owner='voice' (선점 완료)");
        return true;
      }
      // 'noise-measure' & 소유자 'voice' (또는 그 외 fresh 조합) → 거부
      console.log(`[Mic] acquire → denied owner='${owner}' (current='${cur}')`);
      return false;
    }

    // 소유자 없음(또는 stale 회수됨) → 부여.
    this._micOwner = owner;
    this._ownerAbort = onAbort ?? null;
    this._ownerSince = Date.now();
    console.log(`[Mic] acquire → granted owner='${owner}'`);
    return true;
  }

  // 소유권 반납. 소유자가 아니어도 예외 없이 안전한 no-op.
  releaseMic(owner: MicOwner): void {
    if (this._micOwner === owner) {
      this._micOwner = null;
      this._ownerAbort = null;
      this._ownerSince = 0;
      console.log(`[Mic] release → done owner='${owner}'`);
    } else {
      console.log(`[Mic] release → no-op owner='${owner}' (current='${this._micOwner ?? 'none'}')`);
    }
  }

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
