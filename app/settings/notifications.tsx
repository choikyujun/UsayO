import { SafeAreaView } from 'react-native-safe-area-context';
import NotificationSettingsScreen from '../../screens/settings/NotificationSettingsScreen';
import { Colors } from '../../constants/colors';
import { StyleSheet } from 'react-native';

export default function NotificationsRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NotificationSettingsScreen />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: Colors.darkBg } });
