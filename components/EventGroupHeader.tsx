import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

interface Props { label: string; }

export default function EventGroupHeader({ label }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    wrap:  { paddingTop: 18, paddingBottom: Spacing.xs, paddingHorizontal: 20 },
    label: { fontSize: 11, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: c.textMuted, letterSpacing: 0.8 },
  });
}
