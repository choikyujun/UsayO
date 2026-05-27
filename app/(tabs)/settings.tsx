import { SafeAreaView } from 'react-native-safe-area-context';
import SettingsScreen from '../../screens/SettingsScreen';
import { Colors } from '../../constants/colors';
import { StyleSheet, Text, View } from 'react-native';
import { Spacing } from '../../constants/spacing';

export default function SettingsTab() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>설정</Text>
      </View>
      <SettingsScreen />
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
