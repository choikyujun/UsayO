import { SafeAreaView } from 'react-native-safe-area-context';
import CalendarIntegrationScreen from '../../screens/settings/CalendarIntegrationScreen';
import { Colors } from '../../constants/colors';
import { StyleSheet } from 'react-native';

export default function CalendarIntegrationRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <CalendarIntegrationScreen />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: Colors.darkBg } });
