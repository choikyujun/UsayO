import { StyleSheet, Text, View } from 'react-native';
import { TIME_LABEL_W, getNowY } from '../utils/dayViewLayout';

const NOW_RED = '#E63946';

interface Props {
  tick: number; // changes every minute to trigger re-render
}

export default function DayNowMarker({ tick: _ }: Props) {
  const y = getNowY();

  return (
    <View style={[styles.row, { top: y }]} pointerEvents="none">
      {/* "NOW" pill */}
      <View style={styles.pill}>
        <Text style={styles.pillText}>NOW</Text>
      </View>

      {/* Start dot */}
      <View style={styles.dot} />

      {/* Horizontal line */}
      <View style={styles.line} />
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
    backgroundColor: NOW_RED,
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
    fontWeight:  '700',
    letterSpacing: 0.5,
  },
  dot: {
    width:           7,
    height:          7,
    borderRadius:    3.5,
    backgroundColor: NOW_RED,
    marginLeft:      2,
  },
  line: {
    flex:            1,
    height:          1.5,
    backgroundColor: NOW_RED,
    opacity:         0.7,
  },
});
