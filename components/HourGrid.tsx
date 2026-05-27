import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { HOUR_HEIGHT, TIME_LABEL_W } from '../utils/dayViewLayout';

const LABEL_FONT = 11;

interface Props {
  colors: AppTheme;
}

export default function HourGrid({ colors }: Props) {
  return (
    <>
      {Array.from({ length: 24 }, (_, h) => (
        <View key={h} style={styles.hourCell}>
          {/* Hour label — sits just below the main line, no overflow needed */}
          <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{h}</Text>

          {/* Main hour line */}
          <View style={[styles.mainLine, { backgroundColor: colors.border }]} />

          {/* 30-min sub-line (no label) */}
          <View style={[styles.halfLine, { backgroundColor: colors.border + '66' }]} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  hourCell: {
    height:   HOUR_HEIGHT,
    position: 'relative',
  },
  timeLabel: {
    position:  'absolute',
    top:       2,          // just below the hour line; no negative margin, no overflow
    left:      4,
    width:     TIME_LABEL_W - 4,
    fontSize:  LABEL_FONT,
    fontFamily: 'Pretendard-Regular',
    fontWeight:'400',
    textAlign: 'right',
    paddingRight: 6,
  },
  mainLine: {
    position: 'absolute',
    top:      0,
    left:     TIME_LABEL_W,
    right:    0,
    height:   StyleSheet.hairlineWidth,
  },
  halfLine: {
    position: 'absolute',
    top:      HOUR_HEIGHT / 2,
    left:     TIME_LABEL_W,
    right:    0,
    height:   StyleSheet.hairlineWidth,
  },
});
