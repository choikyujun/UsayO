import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { MONO } from '../utils/timeHelpers';

interface Props { timeStr: string; }

export default function NowIndicator({ timeStr }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={[styles.label, { fontFamily: MONO }]}>지금 {timeStr}</Text>
      <View style={styles.line} />
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    row:   { flexDirection: 'row', alignItems: 'center', marginVertical: 6, paddingHorizontal: 20 },
    line:  { flex: 1, height: 1, backgroundColor: c.primary + '45' },
    label: { fontSize: 11, color: c.accent, fontFamily: 'Pretendard-Medium', fontWeight: '500', marginHorizontal: 10, letterSpacing: 0.2 },
  });
}
