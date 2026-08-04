import { Audio } from 'expo-av';
import { NoiseAnalysis } from '../../types';
import { audioSessionService } from './AudioSessionService';

const SAMPLE_INTERVAL_MS = 100;
const SAMPLE_COUNT = 10; // 100ms × 10 = 1초 측정
// 측정을 건너뛰거나 중단했을 때의 기본 배경 레벨(조용 → voice 모드). 측정값 없을 때 사용.
const DEFAULT_BG_LEVEL = -60;

// dBFS 기준 배경 소음 임계값
const QUIET_THRESHOLD = -40;  // < -40 dBFS
const LOUD_THRESHOLD = -25;   // > -25 dBFS

// SNR 권장 모드 임계값
const SNR_HYBRID_AUTO = 10;     // < 10dB → 하이브리드 자동 전환
const SNR_HYBRID_WARN = 20;     // < 20dB → 경고 후 음성 모드

export class NoiseDetectorService {
  private _recording: Audio.Recording | null = null;
  private _aborted = false;

  // 정상 종료·abort·예외가 모두 거치는 단일 멱등 정리. _recording을 먼저 비워 재진입/중복
  // 호출에도 stopAndUnloadAsync가 정확히 1회만 실행되게 한다.
  private async _cleanup(): Promise<void> {
    const rec = this._recording;
    this._recording = null;
    if (rec) {
      try { await rec.stopAndUnloadAsync(); } catch { /* 이미 정리됨 무시 */ }
    }
  }

  // voice가 마이크를 선점할 때 게이트가 호출: 측정 중단 + unload 완료까지 await.
  // 소유권 반납은 하지 않는다 — acquireMic 호출자가 소유권을 이전하는 중이므로.
  async abort(): Promise<void> {
    this._aborted = true;
    await this._cleanup();
    console.log("[Mic] abort → done owner='noise-measure' (측정 중단·unload 완료)");
  }

  async measureBackgroundNoise(): Promise<NoiseAnalysis> {
    const granted = await audioSessionService.ensureMicPermission('noise-measure');
    if (!granted) {
      return this.buildResult(DEFAULT_BG_LEVEL);
    }

    // 마이크 소유권 획득 — voice가 이미 쓰고 있으면 측정을 건너뛰고 기본 임계값 사용.
    const ok = await audioSessionService.acquireMic('noise-measure', () => this.abort());
    if (!ok) {
      console.log('[NoiseDetector] 측정 건너뜀 — 마이크 사용 중, 기본 임계값 사용');
      return this.buildResult(DEFAULT_BG_LEVEL);
    }

    this._aborted = false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    this._recording = recording;
    try {
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();

      const samples: number[] = [];
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        // 각 await 구간마다 _aborted 확인 → 선점 시 즉시 이탈(abort가 이미 unload 수행).
        if (this._aborted) return this.buildResult(DEFAULT_BG_LEVEL);
        await new Promise<void>(r => setTimeout(r, SAMPLE_INTERVAL_MS));
        if (this._aborted) return this.buildResult(DEFAULT_BG_LEVEL);
        const status = await recording.getStatusAsync();
        if (this._aborted) return this.buildResult(DEFAULT_BG_LEVEL);
        // expo-av RecordingStatus에 metering가 있음 (타입은 any cast 필요)
        const metering = (status as Record<string, unknown>).metering;
        if (status.isRecording && typeof metering === 'number') {
          samples.push(metering);
        }
      }

      if (this._aborted) return this.buildResult(DEFAULT_BG_LEVEL);
      await this._cleanup(); // 정상 종료도 단일 멱등 정리 경유

      const backgroundLevel = samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : DEFAULT_BG_LEVEL;

      return this.buildResult(backgroundLevel);
    } catch {
      await this._cleanup();
      return this.buildResult(DEFAULT_BG_LEVEL);
    } finally {
      // 선점으로 owner가 voice로 이전됐으면 releaseMic는 no-op(소유자 불일치). unload 완료까지 await.
      await audioSessionService.releaseMic('noise-measure');
    }
  }

  // audioLevel, backgroundLevel 모두 dBFS(음수). 차이 = SNR 추정값.
  estimateSNR(audioLevel: number, backgroundLevel: number): number {
    return audioLevel - backgroundLevel;
  }

  private buildResult(backgroundLevel: number): NoiseAnalysis {
    let level: NoiseAnalysis['level'];
    if (backgroundLevel < QUIET_THRESHOLD) level = 'quiet';
    else if (backgroundLevel < LOUD_THRESHOLD) level = 'moderate';
    else level = 'loud';

    // 배경 측정 단계에서는 신호가 없으므로 SNR = 0 - background
    const snr = this.estimateSNR(0, backgroundLevel);

    let recommendation: NoiseAnalysis['recommendation'];
    let warningMessage: string | undefined;

    if (snr < SNR_HYBRID_AUTO) {
      recommendation = 'hybrid';
      warningMessage = '주변이 너무 시끄러워요. 텍스트로 입력해주세요.';
    } else if (snr < SNR_HYBRID_WARN) {
      recommendation = 'hybrid';
      warningMessage = '주변 소음이 있어요. 음성 인식이 부정확할 수 있어요.';
    } else {
      recommendation = 'voice';
    }

    return { level, snr, recommendation, warningMessage };
  }
}

export const noiseDetector = new NoiseDetectorService();
