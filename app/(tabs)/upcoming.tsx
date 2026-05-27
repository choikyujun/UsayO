import { SafeAreaView } from 'react-native-safe-area-context';
import UpcomingScreen from '../../screens/UpcomingScreen';
import { Colors } from '../../constants/colors';
import { StyleSheet, Text, View } from 'react-native';
import { Spacing } from '../../constants/spacing';

export default function UpcomingTab() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>다가올</Text>
      </View>
      <UpcomingScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 0.5,
    borderColor: Colors.darkBorder,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
});
