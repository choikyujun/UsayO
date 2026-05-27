import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../constants/colors';
import { TIME_LABEL_W, getNowY } from '../utils/dayViewLayout';

interface Props {
  tick: number; // changes every minute to trigger re-render
}

export default function DayNowMarker({ tick: _ }: Props) {
  const colors = useColors();
  const y      = getNowY();
  const red    = colors.error;

  return (
    <View style={[styles.row, { top: y }]} pointerEvents="none">
      {/* "NOW" pill */}
      <View style={[styles.pill, { backgroundColor: red }]}>
        <Text style={styles.pillText}>NOW</Text>
      </View>

      {/* Start dot */}
      <View style={[styles.dot, { backgroundColor: red }]} />

      {/* Horizontal line */}
      <View style={[styles.line, { backgroundColor: red }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position:      'absolute',
    left:          0,
    right:         0,
    flexDirection: 'row',
    alignItems:    'center',
    zIndex:        10,
  },
  pill: {
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical:   1,
    marginLeft:      4,
    width:           TIME_LABEL_W - 8,
    alignItems:      'center',
  },
  pillText: {
    color:       '#fff',
    fontSize:    8,
    fontFamily: 'Pretendard-Bold',
    fontWeight:  '700',
    letterSpacing: 0.5,
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: 3.5,
    marginLeft:   2,
  },
  line: {
    flex:    1,
    height:  1.5,
    opacity: 0.7,
  },
});
