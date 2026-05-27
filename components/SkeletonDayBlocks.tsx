import { StyleSheet, View } from 'react-native';
import Skeleton from './Skeleton';
import { HOUR_HEIGHT, TIME_LABEL_W } from '../utils/dayViewLayout';

// Fake event placeholders at representative hours
const PLACEHOLDERS = [
  { hour: 9,  durationHr: 1.0, widthFrac: 0.7 },
  { hour: 11, durationHr: 0.5, widthFrac: 0.5 },
  { hour: 13, durationHr: 1.5, widthFrac: 0.85 },
  { hour: 15, durationHr: 0.75, widthFrac: 0.6 },
];

export default function SkeletonDayBlocks() {
  return (
    <>
      {PLACEHOLDERS.map((p, i) => (
        <View
          key={i}
          style={[
            styles.block,
            {
              top:   p.hour * HOUR_HEIGHT,
              left:  TIME_LABEL_W + 4,
              right: TIME_LABEL_W * (1 - p.widthFrac),
              height: Math.round(p.durationHr * HOUR_HEIGHT),
            },
          ]}
        >
          <Skeleton width="100%" height={Math.round(p.durationHr * HOUR_HEIGHT)} borderRadius={8} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
  },
});
