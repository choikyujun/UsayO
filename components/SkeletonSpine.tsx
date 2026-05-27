import { StyleSheet, View } from 'react-native';
import Skeleton, { SkeletonRow } from './Skeleton';
import { useColors } from '../constants/colors';
import { TIME_LABEL_W } from '../utils/dayViewLayout';
import { Spacing } from '../constants/spacing';

const BLOCKS = [
  { top: 80,  height: 48 },
  { top: 180, height: 64 },
  { top: 310, height: 36 },
  { top: 420, height: 80 },
];

export default function SkeletonSpine() {
  const colors = useColors();

  return (
    <View style={styles.root}>
      {/* Hour label column + row placeholders */}
      {[8, 10, 12, 14, 16].map((h, i) => (
        <SkeletonRow key={h} style={{ marginBottom: 48 }}>
          <Skeleton width={TIME_LABEL_W - 8} height={10} borderRadius={4} style={{ marginRight: 8 }} />
          {i % 2 === 0 && (
            <View style={[styles.blockWrap, { height: BLOCKS[i % BLOCKS.length].height }]}>
              <Skeleton width="90%" height={BLOCKS[i % BLOCKS.length].height} borderRadius={8} />
            </View>
          )}
        </SkeletonRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:              1,
    paddingHorizontal: Spacing.base,
    paddingTop:        Spacing.base,
  },
  blockWrap: {
    flex:    1,
    alignItems: 'flex-start',
  },
});
