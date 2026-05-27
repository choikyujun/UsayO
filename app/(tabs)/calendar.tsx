import { SafeAreaView } from 'react-native-safe-area-context';
import CalendarScreen from '../../screens/CalendarScreen';
import { useColors } from '../../constants/colors';

export default function CalendarTab() {
  const colors = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <CalendarScreen />
    </SafeAreaView>
  );
}
