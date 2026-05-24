import { SafeAreaView } from 'react-native-safe-area-context';
import LanguageSettingsScreen from '../../screens/settings/LanguageSettingsScreen';
import { Colors } from '../../constants/colors';
import { StyleSheet } from 'react-native';

export default function LanguageRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <LanguageSettingsScreen />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: Colors.darkBg } });
