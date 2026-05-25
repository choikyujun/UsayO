import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { HOUR_HEIGHT, TIME_LABEL_W } from '../utils/dayViewLayout';

interface Props {
  colors: AppTheme;
}

export default function HourGrid({ colors }: Props) {
  return (
    <>
      {Array.from({ length: 24 }, (_, h) => (
        <View key={h} style={{ height: HOUR_HEIGHT }}>
          {/* Main hour line + label */}
          <View style={styles.hourRow}>
            <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{h}</Text>
            <View style={[styles.mainLine, { backgroundColor: colors.border }]} />
          </View>

          {/* 30-min sub-line (no label) */}
          <View style={styles.halfRow}>
            <View style={{ width: TIME_LABEL_W }} />
            <View style={[styles.halfLine, { backgroundColor: colors.border + '55' }]} />
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  hourRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    height:        1,
    position:      'absolute',
    top:           0,
    left:          0,
    right:         0,
  },
  timeLabel: {
    width:       TIME_LABEL_W,
    fontSize:    11,
    fontWeight:  '400',
    textAlign:   'right',
    paddingRight: 8,
    marginTop:   -7, // vertically center the label on the line
  },
  mainLine: {
    flex:   1,
    height: StyleSheet.hairlineWidth,
    marginTop: 0,
  },
  halfRow: {
    flexDirection: 'row',
    alignItems:    'center',
    position:      'absolute',
    top:           HOUR_HEIGHT / 2,
    left:          0,
    right:         0,
  },
  halfLine: {
    flex:   1,
    height: StyleSheet.hairlineWidth,
  },
});
