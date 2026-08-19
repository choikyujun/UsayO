import { Audio } from 'expo-av';
import { MAX_DURATION_MS } from '../../constants/voiceRecording';

const NOISE_CACHE_TTL_MS = 60_000;

interface NoiseCache {
  snr: number;
  recommendation: 'voice' | 'hybrid' | 'text';
  measuredAt: number;
}

export type MicOwner = 'voice' | 'noise-measure';

const PERM_REQUEST_TIMEOUT_MS = 5000; // Android 콜백 유실 대비 — 초과 시 false 확정(무한 대기 방지)

class AudioSessionService {
  private _permissionGranted = false;
  private _preinitDone = false;
  private _noiseCache: NoiseCache | null = null;
  private _permReqInFlight: Promise<boolean> | null = null; // 진행 중 권한 요청(중복 요청 차단)

  // ── 마이크 권한 단일 게이트 ──────────────────────────────────
  // 모든 권한 확인/요청의 유일한 진입점. Audio.requestPermissionsAsync를 직접 부르는 곳이
  // 여럿이면 콜드 딥링크에서 동시 요청 경합으로 콜백이 유실돼 멈춘다 → 이 게이트로 일원화.
  //  (a) 캐시 granted면 즉시 true.  (b) getPermissionsAsync로 확인 → granted면 요청 없이 true.
  //  (c) 미허용이면 requestPermissionsAsync — 이미 in-flight면 그 Promise를 공유(두 번 요청 안 함).
  //  타임아웃(5초) 초과 시 false 확정(요청 자체는 백그라운드로 계속, in-flight 유지).
  /**
   * **다이얼로그 없이** 현재 권한 상태만 확인한다.
   * 부팅 워밍업처럼 '사용자가 마이크를 쓰겠다고 한 적 없는 시점'에서 쓴다 — 그런 자리에서
   * 요청을 띄우면 iOS는 생애 단 한 번의 기회를 맥락 없이 소진해버린다.
   */
  async hasMicPermission(): Promise<boolean> {
    if (this._permissionGranted) return true;
    try {
      const { granted } = await Audio.getPermissionsAsync();
      if (granted) this._permissionGranted = true;
      return granted;
    } catch {
      return false;
    }
  }

  async ensureMicPermission(caller: string): Promise<boolean> {
    if (this._permissionGranted) return true;

    // (b) 상태 확인 — 요청(다이얼로그) 없이. 콜백 유실로 요청이 매달려도 실제 granted면 여기서 회복.
    try {
      const { status, granted } = await Audio.getPermissionsAsync();
      console.log(`[Perm] check → ${granted ? 'granted' : status} (caller=${caller})`);
      if (granted) { this._permissionGranted = true; return true; }
    } catch (e) {
      console.log('[Perm] check 오류:', (e as Error)?.message);
    }

    // (c) 진행 중 요청이 있으면 공유(중복 요청 금지)
    if (this._permReqInFlight) {
      console.log(`[Perm] request → 대기 중인 in-flight에 합류 (caller=${caller})`);
      return this._raceTimeout(this._permReqInFlight, caller);
    }

    // 새 요청 — in-flight는 요청이 '실제로 끝날 때'만 해제(타임아웃으로 해제하지 않아 재요청 경합 방지)
    const req = this._requestOnce(caller);
    this._permReqInFlight = req;
    req.finally(() => { if (this._permReqInFlight === req) this._permReqInFlight = null; });
    return this._raceTimeout(req, caller);
  }

  private async _requestOnce(caller: string): Promise<boolean> {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      this._permissionGranted = granted;
      console.log(`[Perm] request → ${granted ? 'granted' : 'denied'} (caller=${caller})`);
      return granted;
    } catch (e) {
      console.log(`[Perm] request → error (caller=${caller}):`, (e as Error)?.message);
      return false;
    }
  }

  private _raceTimeout(p: Promise<boolean>, caller: string): Promise<boolean> {
    return Promise.race([
      p,
      new Promise<boolean>(res => setTimeout(() => {
        console.log(`[Perm] request → timeout (caller=${caller})`);
        res(false);
      }, PERM_REQUEST_TIMEOUT_MS)),
    ]);
  }

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
  private static readonly STALE_LOCK_MS = MAX_DURATION_MS + 10_000; // 현재 25초(MAX 15s + 10s)

  // 모든 소유권 연산(acquire/release)을 한 줄로 세우는 직렬화 뮤텍스.
  // 소유권 상태 평가와 실제 리소스 정리(unload)가 '원자적'으로 끝나게 해, 전이(선점) 도중
  // 다른 acquire/release가 상태를 끼어들어 평가/변경하지 못하게 한다.
  private _opChain: Promise<unknown> = Promise.resolve();
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this._opChain.then(fn, fn);
    this._opChain = run.then(() => {}, () => {}); // 체인은 항상 성공으로 이어감(성패 무관 다음 실행)
    return run;
  }

  get micOwner(): MicOwner | null { return this._micOwner; }

  // 소유권 획득. 반환 false면 요청자는 녹음을 만들면 안 된다. 전 과정 직렬화(원자적).
  // 평가 순서(고정):
  //   (0) 보유 시간이 STALE_LOCK_MS 초과 → '누수' 무효 처리(onAbort 정리·await 후 해제).
  //       STALE_LOCK_MS > MAX_DURATION_MS 라 라이브 녹음은 절대 stale가 될 수 없음.
  //   (1) fresh 락: 같은 소유자 재진입 → 거부.
  //   (2) fresh 락: 'voice'가 'noise-measure' 선점(정리 완료까지 owner 유지한 채 대기 →
  //       완료 후 'voice'로 이전) / 'noise-measure'는 'voice'에 양보=거부.
  // 선점 대기 중에는 owner가 'noise-measure'로 유지되어(널 미노출), 그 사이 어떤 release도
  // 직렬화 큐에 걸려 락을 비우지 못한다 → '하드웨어 물린 채 다른 호출이 획득' 경합 제거.
  acquireMic(owner: MicOwner, onAbort?: () => Promise<void>): Promise<boolean> {
    return this.serialize(() => this._acquireMicInner(owner, onAbort));
  }

  private async _acquireMicInner(owner: MicOwner, onAbort?: () => Promise<void>): Promise<boolean> {
    // (0) stale 먼저 — 누수 락 무효화(정리 완료까지 owner 유지 후 해제).
    if (this._micOwner !== null && Date.now() - this._ownerSince >= AudioSessionService.STALE_LOCK_MS) {
      const cur = this._micOwner;
      const heldMs = Date.now() - this._ownerSince;
      const cleanup = await this._runOwnerCleanup();
      console.log(`[Mic] stale lock reclaimed owner='${cur}' heldMs=${heldMs} cleanup=${cleanup}`);
      this._micOwner = null;
      this._ownerSince = 0;
    }

    if (this._micOwner !== null) {
      const cur = this._micOwner;
      // (1) 같은 소유자 재진입 → 거부
      if (cur === owner) {
        console.log(`[Mic] acquire → denied owner='${owner}' (재진입: 이미 소유)`);
        return false;
      }
      // (2) 소유권 정책
      if (owner === 'voice' && cur === 'noise-measure') {
        console.log("[Mic] acquire → 'voice' preempts 'noise-measure' (정리 완료 대기, owner 유지)");
        const cleanup = await this._runOwnerCleanup(); // owner='noise-measure' 유지한 채 unload 완료까지
        this._micOwner = 'voice';
        this._ownerAbort = onAbort ?? null;
        this._ownerSince = Date.now();
        console.log(`[Mic] acquire → granted owner='voice' (선점 완료, cleanup=${cleanup})`);
        return true;
      }
      // 'noise-measure' & 소유자 'voice' (또는 그 외 fresh) → 거부
      console.log(`[Mic] acquire → denied owner='${owner}' (current='${cur}')`);
      return false;
    }

    // 소유자 없음(또는 위에서 회수됨) → 부여.
    this._micOwner = owner;
    this._ownerAbort = onAbort ?? null;
    this._ownerSince = Date.now();
    console.log(`[Mic] acquire → granted owner='${owner}'`);
    return true;
  }

  // 현재 소유자의 등록된 정리(onAbort)를 1회 호출·완료 await. 멱등(정리 함수 자체가 멱등).
  // 없거나 예외여도 로그만 남기고 진행(여기서 막히면 영구 마비).
  private async _runOwnerCleanup(): Promise<'ok' | 'failed' | 'none'> {
    const cleanup = this._ownerAbort;
    this._ownerAbort = null;
    if (!cleanup) return 'none';
    try { await cleanup(); return 'ok'; }
    catch (e) { console.log('[Mic] owner cleanup 예외 — 진행:', (e as Error)?.message); return 'failed'; }
  }

  // 소유권 반납. 직렬화 + 소유자 리소스 정리(unload) 완료 후 반환. 소유자 아니면 안전 no-op.
  releaseMic(owner: MicOwner, caller = 'unknown'): Promise<void> {
    console.log(`[Mic] release ← caller=${caller} owner='${owner}'`);
    return this.serialize(() => this._releaseMicInner(owner, caller));
  }

  private async _releaseMicInner(owner: MicOwner, caller: string): Promise<void> {
    if (this._micOwner !== owner) {
      console.log(`[Mic] release → no-op owner='${owner}' caller=${caller} (current='${this._micOwner ?? 'none'}')`);
      return;
    }
    // 소유권을 유지한 채 정리(unload)를 완료한 뒤 비운다 → 반납 시점과 unload 시점 일치.
    const cleanup = await this._runOwnerCleanup();
    this._micOwner = null;
    this._ownerSince = 0;
    console.log(`[Mic] release → done owner='${owner}' caller=${caller} cleanup=${cleanup}`);
  }

  // Called at app startup — caches permission + warms up audio session (no recording)
  //
  // opts.request=false면 **권한을 묻지 않고** 현재 상태만 본다. 부팅 워밍업이 이 모드를 쓴다:
  // 워밍업은 사용자가 요청한 적 없는 백그라운드 작업이라 권한 다이얼로그를 띄울 자리가 아니고,
  // 실제 요청은 마이크를 누르는 순간 prepareForRecording이 맥락과 함께 한다.
  async preinit(opts?: { request?: boolean }): Promise<void> {
    const t0 = Date.now();
    try {
      const granted = opts?.request === false
        ? await this.hasMicPermission()
        : await this.ensureMicPermission('preinit');
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
    const granted = await this.ensureMicPermission('prepareForRecording');
    if (!granted) return false;

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
