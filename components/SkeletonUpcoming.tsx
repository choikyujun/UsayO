import { StyleSheet, View } from 'react-native';
import Skeleton, { SkeletonRow } from './Skeleton';
import { Spacing } from '../constants/spacing';

const ROWS = [
  { timeW: 36, titleW: '55%' },
  { timeW: 36, titleW: '70%' },
  { timeW: 36, titleW: '45%' },
  { timeW: 36, titleW: '60%' },
];

export default function SkeletonUpcoming() {
  return (
    <View style={styles.root}>
      {/* Date group header */}
      <Skeleton width={80} height={11} borderRadius={4} style={{ marginBottom: Spacing.md }} />

      {/* Event rows */}
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={row.timeW} height={10} borderRadius={4} />
          <View style={styles.dot} />
          <Skeleton width={row.titleW} height={12} borderRadius={4} />
        </View>
      ))}

      {/* Second group header */}
      <Skeleton width={60} height={11} borderRadius={4} style={{ marginTop: Spacing.lg, marginBottom: Spacing.md }} />
      <View style={styles.row}>
        <Skeleton width={36} height={10} borderRadius={4} />
        <View style={styles.dot} />
        <Skeleton width="65%" height={12} borderRadius={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop:        Spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    marginBottom:  Spacing.md,
  },
  dot: {
    width:         5,
    height:        5,
    borderRadius:  2.5,
    backgroundColor: 'transparent',
  },
});
