import { SafeAreaView } from 'react-native-safe-area-context';
import CalendarScreen from '../../screens/CalendarScreen';
import { Colors } from '../../constants/colors';
import { StyleSheet } from 'react-native';

export default function CalendarTab() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <CalendarScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.darkBg },
});
