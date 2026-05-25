import { StyleSheet, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import {
  GRID_TOTAL_H, HOUR_HEIGHT, TIME_LABEL_W, getNowY, timeToY,
} from '../utils/dayViewLayout';
import { COL_W } from '../utils/weekViewLayout';
import { todayDateStr } from '../utils/timeHelpers';
import HourGrid from './HourGrid';

const LUNCH_TOP    = timeToY(12, 0);
const DINNER_TOP   = timeToY(17, 30);
const DINNER_BOT   = timeToY(22, 0);

interface Props {
  days:    string[];
  colors:  AppTheme;
  tick:    number;   // minute tick so NOW marker re-renders
}

export default function WeekGrid({ days, colors, tick: _tick }: Props) {
  const today    = todayDateStr();
  const todayCol = days.indexOf(today); // -1 if today not in view
  const nowY     = getNowY();

  return (
    <View style={{ height: GRID_TOTAL_H, position: 'relative' }}>
      {/* ── Lunch hint ──────────────────────────────────────────────── */}
      <View
        style={[styles.hint, {
          top:             LUNCH_TOP,
          height:          HOUR_HEIGHT,
          left:            TIME_LABEL_W,
          backgroundColor: colors.lunchHint,
        }]}
        pointerEvents="none"
      />

      {/* ── Dinner hint ─────────────────────────────────────────────── */}
      <View
        style={[styles.hint, {
          top:             DINNER_TOP,
          height:          DINNER_BOT - DINNER_TOP,
          left:            TIME_LABEL_W,
          backgroundColor: colors.dinnerHint,
        }]}
        pointerEvents="none"
      />

      {/* ── Hour grid (time labels + horizontal lines) ───────────────── */}
      <HourGrid colors={colors} />

      {/* ── Vertical column dividers ─────────────────────────────────── */}
      {days.slice(1).map((_, i) => (
        <View
          key={i}
          style={[styles.colDivider, {
            left:            TIME_LABEL_W + (i + 1) * COL_W,
            backgroundColor: colors.border,
          }]}
          pointerEvents="none"
        />
      ))}

      {/* ── NOW marker on today's column ────────────────────────────── */}
      {todayCol >= 0 && (
        <View
          style={[styles.nowLine, {
            top:  nowY,
            left: TIME_LABEL_W + todayCol * COL_W,
            width: COL_W,
          }]}
          pointerEvents="none"
        >
          <View style={[styles.nowDot,   { backgroundColor: colors.primary }]} />
          <View style={[styles.nowTrail, { backgroundColor: colors.primary }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    right:    0,
  },
  colDivider: {
    position: 'absolute',
    top:      0,
    bottom:   0,
    width:    StyleSheet.hairlineWidth,
  },
  nowLine: {
    position:      'absolute',
    flexDirection: 'row',
    alignItems:    'center',
  },
  nowDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  nowTrail: {
    flex:   1,
    height: 2,
  },
});
