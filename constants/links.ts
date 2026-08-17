import * as Application from 'expo-application';
import { Platform } from 'react-native';

// 외부 링크 단일 소스. 도메인이나 경로가 바뀌면 여기만 고친다.
//
// 문서는 wokytoky-legal 저장소(GitHub Pages)에서 서빙된다. 같은 저장소에 WokyToky·
// WokyToky Casual·Ksori 문서도 함께 있으며, UsayO는 `usayo.html` 하나에 개인정보처리방침과
// 이용약관이 탭으로 들어 있다. 약관은 `#terms` 해시로 바로 열린다.
//
// ⚠️ 이 URL은 Play Console의 '개인정보처리방침' 항목에도 동일하게 등록돼 있다.
//    바꿀 때는 스토어 콘솔도 함께 갱신해야 한다(불일치 시 심사에서 반려된다).
const LEGAL_BASE = 'https://choikyujun.github.io/wokytoky-legal';

// 패키지명(=Android applicationId / iOS bundleId)은 **런타임 값에서 읽는다.**
// 상수에 박아두면 패키지명이 바뀔 때 조용히 어긋난다 — com.yusay.app → com.usayo.app 전환에서
// 실제로 위젯 prefs·딥링크가 어긋나 한참 헤맸다. Application.applicationId는 설치된 앱의
// 실제 식별자라 app.json과 desync될 수 없다.
// 폴백은 조회 실패(예: 일부 테스트 환경) 시에도 링크 자체는 열리게 하기 위한 것이다.
const APP_PACKAGE = Application.applicationId ?? 'com.usayo.app';

export const LINKS = {
  privacyPolicy: `${LEGAL_BASE}/usayo.html`,
  termsOfService: `${LEGAL_BASE}/usayo.html#terms`,
  /**
   * 계정 삭제 요청 안내(앱을 지운 뒤 요청하는 경로). 앱 내 삭제는 설정 > 프라이버시에서 직접 가능.
   * 앱에서 링크하지는 않지만 **Play Console 데이터 안전 섹션에 등록된 URL**이라 여기서 함께 관리한다.
   */
  accountDeletion: `${LEGAL_BASE}/usayo-delete.html`,

  /**
   * 스토어의 구독 관리 화면. 구독 해지·결제수단 변경은 스토어에서만 가능하고 앱이 대신 할 수 없다.
   *
   * 플랫폼을 여기서 이미 반영하므로 호출부는 분기하지 않는다.
   * Android는 `?package=`로 **이 앱의 구독**으로 바로 이동한다(파라미터가 없으면 전체 구독 목록이
   * 열려 사용자가 우리 앱 항목을 직접 찾아야 한다).
   */
  manageSubscription: Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : `https://play.google.com/store/account/subscriptions?package=${APP_PACKAGE}`,
} as const;
