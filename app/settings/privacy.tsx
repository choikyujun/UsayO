import { SafeAreaView } from 'react-native-safe-area-context';
import PrivacySettingsScreen from '../../screens/settings/PrivacySettingsScreen';
import { Colors } from '../../constants/colors';
import { StyleSheet } from 'react-native';

export default function PrivacyRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <PrivacySettingsScreen />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: Colors.darkBg } });
