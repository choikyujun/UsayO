import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';

interface Props {
  isToday?: boolean;
}

export default function EmptyTodayState({ isToday = true }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.main}>{isToday ? '오늘은 비어있어요' : '이 날은 비어있어요'}</Text>
      <Text style={styles.hint}>{isToday ? '마이크로 새 일정을 더해보세요' : '음성으로 일정을 등록해보세요'}</Text>
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    wrap: { paddingVertical: 40, alignItems: 'center', gap: 6 },
    main: { fontSize: 15, color: c.textMuted, fontWeight: '500' },
    hint: { fontSize: 12, color: c.accent },
  });
}
