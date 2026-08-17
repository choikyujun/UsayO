// 외부 링크 단일 소스. 도메인이나 경로가 바뀌면 여기만 고친다.
//
// 문서는 wokytoky-legal 저장소(GitHub Pages)에서 서빙된다. 같은 저장소에 WokyToky·
// WokyToky Casual·Ksori 문서도 함께 있으며, UsayO는 `usayo.html` 하나에 개인정보처리방침과
// 이용약관이 탭으로 들어 있다. 약관은 `#terms` 해시로 바로 열린다.
//
// ⚠️ 이 URL은 Play Console의 '개인정보처리방침' 항목에도 동일하게 등록돼 있다.
//    바꿀 때는 스토어 콘솔도 함께 갱신해야 한다(불일치 시 심사에서 반려된다).
const LEGAL_BASE = 'https://choikyujun.github.io/wokytoky-legal';

export const LINKS = {
  privacyPolicy: `${LEGAL_BASE}/usayo.html`,
  termsOfService: `${LEGAL_BASE}/usayo.html#terms`,
  /**
   * 계정 삭제 요청 안내(앱을 지운 뒤 요청하는 경로). 앱 내 삭제는 설정 > 프라이버시에서 직접 가능.
   * 앱에서 링크하지는 않지만 **Play Console 데이터 안전 섹션에 등록된 URL**이라 여기서 함께 관리한다.
   */
  accountDeletion: `${LEGAL_BASE}/usayo-delete.html`,
} as const;

// 참고: 구글 플레이 구독 관리 URL은 이 파일에 두지 않았다. 이미
// components/DeleteAccountModal.tsx와 lib/iap.ts 두 곳에 각각 하드코딩돼 있어(형태도 서로 다름)
// 여기에 또 정의하면 '단일 소스'가 아니라 세 번째 사본이 된다. 통합은 별건으로 처리한다.
