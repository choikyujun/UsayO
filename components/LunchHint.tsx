import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { HOUR_HEIGHT, timeToY } from '../utils/dayViewLayout';

const TOP    = timeToY(12, 0);
const HEIGHT = HOUR_HEIGHT; // 12:00 – 13:00

interface Props { colors: AppTheme }

export default function LunchHint({ colors }: Props) {
  return (
    <View
      style={[styles.hint, { top: TOP, height: HEIGHT, backgroundColor: colors.lunchHint }]}
      pointerEvents="none"
    >
      <Text style={[styles.label, { color: colors.textTertiary }]}>점심</Text>
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
