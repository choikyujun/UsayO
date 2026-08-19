import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import { audioSessionService } from './voice/AudioSessionService';
import { noiseDetector } from './voice/NoiseDetectorService';
import { requestNotificationPermission } from './notifications';

// 권한 다이얼로그를 띄우는 시작 작업 모음. app/_layout에서 떼어낸 이유가 핵심이다.
//
// iOS는 마이크 권한을 **앱 생애 딱 한 번만** 묻는다. 부팅 시점에 물어버리면
//   · 온보딩의 설명 화면(app/onboarding/permission-mic)이 무력화된다 — 사용자가 그 화면에서
//     "마이크 허용하기"를 눌러도 시스템 다이얼로그가 뜨지 않고 저장된 답이 그대로 반환된다.
//   · 부팅 때 거부한 사용자에게 남는 회복 경로가 "설정 앱으로 가라"뿐이 된다.
//   · 스플래시 위에서 마이크·알림을 연달아 묻는 패턴은 애플 심사에서 지적받는다
//     (5.1.1 — 권한은 맥락 안에서 요청할 것).
// 그래서 이 작업들은 **온보딩을 마친 뒤에만** 돈다.
//   · 온보딩 중    → 호출하지 않는다. 권한은 permission-mic 화면이 설명과 함께 요청한다.
//   · 온보딩 직후  → ready 화면이 완료를 기록한 직후 직접 호출한다(앱 재시작 없이 워밍업).
//   · 이후 매 부팅 → app/_layout이 onboarding_complete를 확인하고 호출한다.
//
// Android는 권한 재요청이 가능해 기존 흐름에 문제가 없었다. 이 분리로 Android에서 달라지는
// 것은 "부팅 시 한 번 더 묻던 것"이 사라지는 것뿐이고, 권한 자체는 온보딩 화면이 그대로
// 받는다(알림 권한은 온보딩 완료 직후로 이동).
//
// 트레이드오프: 온보딩 직후 첫 실행에서 오디오 워밍업이 부팅보다 늦어져 첫 음성 진입이
// 느려질 수 있다. 권한 흐름이 망가지는 것보다 낫다고 판단해 감수한다.

let ran = false;

/** 세션당 1회. 온보딩이 끝났다는 것이 확인된 뒤에만 호출할 것. */
export async function runPermissionGatedStartup(caller: string): Promise<void> {
  if (ran) return;
  ran = true;
  console.log(`[Startup] 권한 필요 시작 작업 실행 (caller=${caller})`);

  // 알림 권한 — 실패해도 나머지 진행(알림만 못 받고 앱은 정상 동작).
  requestNotificationPermission().catch(() => {});

  try {
    // request:false — 워밍업은 권한을 **묻지 않는다**. 온보딩에서 "나중에"를 누른 사용자에게
    // 온보딩 직후 맥락 없이 다이얼로그가 뜨는 것을 막는다. 실제 요청은 사용자가 마이크를
    // 누르는 순간 prepareForRecording이 한다(그 자리가 맥락이다).
    await audioSessionService.preinit({ request: false });

    // 소음 측정은 **실제 녹음**이다. 권한이 없으면 아예 시도하지 않는다
    // (measureBackgroundNoise 내부에도 가드가 있지만, 그쪽은 권한을 '요청'하러 들어간다).
    if (!audioSessionService.permissionGranted) {
      console.log('[Startup] 마이크 미허용 — 소음 측정·오디오 워밍업 생략(마이크 탭 시 요청됨)');
    } else {
      // 딥링크(usayo://voice)로 실행된 경우 부트스트랩 소음 측정을 생략한다.
      // 측정이 마이크를 점유(가변 ~1.4초+)하면 voice 선점(abort 대기)이 길어져 간헐적으로
      // "마이크를 사용할 수 없어요"로 실패했다. 선점/abort로 처리하는 대신 애초에 경합을
      // 만들지 않는다(측정 생략 시 기본 임계값=voice 모드, 이미 구현된 경로).
      let isVoiceDeeplink = false;
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          const p = Linking.parse(initialUrl);
          isVoiceDeeplink = p.path === 'voice/start' || p.hostname === 'voice';
        }
      } catch { /* 초기 URL 조회 실패 → 일반 실행으로 간주 */ }

      if (isVoiceDeeplink) {
        console.log('[Mic] 딥링크 진입 — 소음 측정 생략');
      } else {
        const noise = await noiseDetector.measureBackgroundNoise();
        audioSessionService.setCachedNoise(noise.snr, noise.recommendation);
        await audioSessionService.cleanup();
      }
    }

    await import('./voice/warmup').then(m => m.warmupVoiceServices());
  } catch (e) {
    console.log('[Startup] 일부 실패:', (e as Error)?.message);
  }
}

/**
 * 부팅 경로용 — 온보딩을 마쳤을 때만 실행한다.
 * 미완료면 아무것도 하지 않으므로 권한 다이얼로그가 뜨지 않는다(ran도 소비하지 않는다).
 */
export async function runPermissionGatedStartupIfOnboarded(): Promise<void> {
  let done: string | null = null;
  try {
    done = await AsyncStorage.getItem('onboarding_complete');
  } catch { /* 저장소 오류 → 미완료로 간주(권한을 함부로 묻지 않는 쪽이 안전) */ }
  if (!done) {
    console.log('[Startup] 온보딩 미완료 — 권한 요청 보류(permission-mic 화면이 담당)');
    return;
  }
  await runPermissionGatedStartup('boot');
}
