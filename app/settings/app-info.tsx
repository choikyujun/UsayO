import { Mic } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

export default function AppInfoRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Mic size={32} color="#fff" />
          </View>
          <Text style={styles.appName}>YuSay</Text>
          <Text style={styles.tagline}>Yu say. It's done.</Text>
        </View>

        <View style={styles.card}>
          {[
            ['버전', '1.0.0'],
            ['빌드', '2026.05'],
            ['플랫폼', 'iOS / Android'],
            ['개발사', 'YuSay Inc.'],
          ].map(([label, value], i) => (
            <View key={label} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.copyright}>
          © 2026 YuSay Inc. All rights reserved.{'\n'}
          음성 인식 기술 powered by Whisper &amp; Claude.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.darkBg },
  scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing['2xl'], gap: 20 },
  logoWrap: { alignItems: 'center', gap: Spacing.sm, marginBottom: 8 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.darkCard,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.darkBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: 13,
  },
  rowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.darkBorder },
  rowLabel: { fontSize: 14, color: Colors.textMuted },
  rowValue: { fontSize: 14, color: Colors.textPrimary, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
  copyright: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 18,
    opacity: 0.5,
  },
});
