import { StyleSheet, View } from 'react-native';
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
    />
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    left:     0,
    right:    0,
  },
});
