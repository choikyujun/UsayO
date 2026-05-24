import { Audio } from 'expo-av';
import { NoiseAnalysis } from '../../types';

const SAMPLE_INTERVAL_MS = 100;
const SAMPLE_COUNT = 10; // 100ms × 10 = 1초 측정

// dBFS 기준 배경 소음 임계값
const QUIET_THRESHOLD = -40;  // < -40 dBFS
const LOUD_THRESHOLD = -25;   // > -25 dBFS

// SNR 권장 모드 임계값
const SNR_HYBRID_AUTO = 10;     // < 10dB → 하이브리드 자동 전환
const SNR_HYBRID_WARN = 20;     // < 20dB → 경고 후 음성 모드

export class NoiseDetectorService {
  async measureBackgroundNoise(): Promise<NoiseAnalysis> {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      return this.buildResult(-60);
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    try {
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();

      const samples: number[] = [];
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        await new Promise<void>(r => setTimeout(r, SAMPLE_INTERVAL_MS));
        const status = await recording.getStatusAsync();
        // expo-av RecordingStatus에 metering가 있음 (타입은 any cast 필요)
        const metering = (status as Record<string, unknown>).metering;
        if (status.isRecording && typeof metering === 'number') {
          samples.push(metering);
        }
      }

      await recording.stopAndUnloadAsync();

      const backgroundLevel = samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : -60;

      return this.buildResult(backgroundLevel);
    } catch {
      try { await recording.stopAndUnloadAsync(); } catch { /* cleanup */ }
      return this.buildResult(-60);
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
