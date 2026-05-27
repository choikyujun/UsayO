import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTheme, useColors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import UpcomingScreen from '../../screens/UpcomingScreen';

export default function UpcomingTab() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>다가올</Text>
      </View>
      <UpcomingScreen />
    </SafeAreaView>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.bg },
    header: {
      paddingHorizontal: Spacing.base,
      paddingTop:        Spacing.xs,
      paddingBottom:     Spacing.sm,
      borderBottomWidth: 0.5,
      borderColor:       c.border,
    },
    title: { fontSize: 22, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: c.textPrimary, letterSpacing: -0.5 },
  });
}
