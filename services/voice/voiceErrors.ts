// 음성 서비스 계층 공용 에러 — '원인 타입'만 싣는다. 사용자 문구는 UI 계층에서 결정한다
// (서비스가 한국어 문구를 던지고 그걸 '연결' 키워드로 매칭하던 오분류 구조를 제거).

export type VoiceErrorCode =
  | 'network'  // fetch 자체 실패(오프라인 등 실제 네트워크 문제)
  | 'server'   // 프록시/서버 응답 오류(HTTP 4xx·5xx, 릴레이, 상류 non-2xx)
  | 'auth'     // 인증·세션 오류(401/403)
  | 'unknown'; // 파일 부재·파싱 등 그 외

export class VoiceServiceError extends Error {
  code: VoiceErrorCode;
  constructor(code: VoiceErrorCode, message: string) {
    super(message);
    this.name = 'VoiceServiceError';
    this.code = code;
  }
}

// supabase functions.invoke 오류를 '오류 종류'로 분류(문구 매칭 없이).
// supabase-js는 FunctionsFetchError/FunctionsHttpError/FunctionsRelayError로 name을 세팅한다.
export function classifyProxyError(err: unknown): VoiceErrorCode {
  const name = (err as { name?: string } | null | undefined)?.name ?? '';
  if (name === 'FunctionsFetchError') return 'network';
  if (name === 'FunctionsRelayError') return 'server';
  if (name === 'FunctionsHttpError') {
    const status = (err as { context?: { status?: number } })?.context?.status;
    if (status === 401 || status === 403) return 'auth';
    return 'server';
  }
  return 'server'; // 알 수 없는 프록시 오류는 서버 계열로(네트워크로 단정하지 않음)
}
