import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../constants/colors';

interface Props {
  // 개발 빌드에서만 전달되는 원인 문자열. 프로덕션에서는 'config_missing' 같은 비노출 값.
  detail: string;
}

// Supabase 등 필수 환경설정 부재로 앱을 정상 기동할 수 없을 때 크래시 대신 보여주는 안내 화면.
// createClient throw로 화면 자체가 안 뜨는 상황을 막는 최후 방어선.
export default function ConfigErrorScreen({ detail }: Props) {
  const c = useColors();
  const showDetail = __DEV__ && detail !== 'config_missing';

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.inner}>
        <Text style={[styles.title, { color: c.textPrimary }]}>앱을 시작할 수 없어요</Text>
        <Text style={[styles.body, { color: c.textTertiary }]}>
          설정에 문제가 있어 앱을 열 수 없습니다.{'\n'}잠시 후 다시 시도해 주세요.
        </Text>
        {showDetail ? (
          <Text style={[styles.detail, { color: c.textMuted, borderColor: c.border }]}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  inner: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Pretendard-Regular',
    textAlign: 'center',
  },
  detail: {
    marginTop: 20,
    fontSize: 12,
    fontFamily: 'Pretendard-Regular',
    textAlign: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
