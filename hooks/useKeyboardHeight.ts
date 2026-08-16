import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// 현재 소프트 키보드 높이(dp). 닫혀 있으면 0.
//
// 왜 KeyboardAvoidingView를 쓰지 않는가:
//   Expo SDK 54는 Android edge-to-edge가 기본(`edgeToEdgeEnabled=true`)이고 targetSdk가 35+다.
//   이 조합에서는 AndroidManifest의 `windowSoftInputMode="adjustResize"`가 **더 이상 창을
//   리사이즈하지 않는다** — 앱 창은 전체 높이를 유지하고 키보드가 그 위를 덮는다.
//   게다가 저장소의 기존 관례였던 `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`는
//   Android에서 KeyboardAvoidingView가 **아무 일도 하지 않게** 만든다(adjustResize가 처리해
//   주리라 기대한 코드였는데 그 전제가 깨졌다). 그래서 시트가 키보드에 가려졌다.
//
// 대신 키보드 높이를 직접 받아 컨테이너의 paddingBottom으로 쓴다. 새 네이티브 의존성이 없고
// (react-native-keyboard-controller 불필요) iOS·Android가 같은 경로를 탄다.
//
// 적용법 — 컨테이너의 justifyContent에 따라 의미가 자연히 맞는다:
//   · 바텀시트(`justifyContent: 'flex-end'`)  → paddingBottom: kb 만큼 그대로 올라간다.
//   · 가운데 모달(`justifyContent: 'center'`) → paddingBottom: kb 로 kb/2 만큼 올라가
//     '보이는 영역의 중앙'에 놓인다(원하는 동작).
//
// iOS는 will* 이벤트가 키보드 애니메이션과 동기라 더 매끄럽고, Android는 will*이 없어 did*를 쓴다.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
