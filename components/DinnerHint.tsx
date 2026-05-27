import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { timeToY } from '../utils/dayViewLayout';

const TOP    = timeToY(17, 30);
const HEIGHT = timeToY(22, 0) - TOP; // 17:30 – 22:00

interface Props { colors: AppTheme }

export default function DinnerHint({ colors }: Props) {
  return (
    <View
      style={[styles.hint, { top: TOP, height: HEIGHT, backgroundColor: colors.dinnerHint }]}
      pointerEvents="none"
    >
      <Text style={[styles.label, { color: colors.textTertiary }]}>회식</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    left:     0,
    right:    0,
  },
  label: {
    fontSize:      9,
    fontFamily:    'Pretendard-Regular',
    letterSpacing: 0.2,
    opacity:       0.5,
    marginTop:     4,
    marginLeft:    8,
  },
});
