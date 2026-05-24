import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Colors } from '../constants/colors';

type Props = {
  status: 'idle' | 'recording' | 'processing';
  onPress: () => void;
};

export default function VoiceMicButton({ status, onPress }: Props) {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'recording') {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulse1, { toValue: 1.5, duration: 700, useNativeDriver: true }),
            Animated.timing(pulse1, { toValue: 1, duration: 700, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(350),
            Animated.timing(pulse2, { toValue: 1.8, duration: 700, useNativeDriver: true }),
            Animated.timing(pulse2, { toValue: 1, duration: 700, useNativeDriver: true }),
          ]),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulse1.setValue(1);
      pulse2.setValue(1);
    }
  }, [status]);

  const isRecording = status === 'recording';
  const isProcessing = status === 'processing';

  return (
    <View style={styles.wrapper}>
      {isRecording && (
        <>
          <Animated.View
            style={[styles.ring, { transform: [{ scale: pulse2 }], opacity: 0.2 }]}
          />
          <Animated.View
            style={[styles.ring, { transform: [{ scale: pulse1 }], opacity: 0.35 }]}
          />
        </>
      )}
      <Pressable
        onPress={onPress}
        disabled={isProcessing}
        style={({ pressed }) => [
          styles.button,
          isRecording && styles.buttonRecording,
          isProcessing && styles.buttonProcessing,
          pressed && styles.buttonPressed,
        ]}
      >
        {isRecording ? (
          <View style={styles.stopIcon} />
        ) : (
          <MicIcon />
        )}
      </Pressable>
    </View>
  );
}

function MicIcon() {
  return (
    <View style={styles.micContainer}>
      <View style={styles.micBody} />
      <View style={styles.micBase} />
      <View style={styles.micStand} />
    </View>
  );
}

const BUTTON_SIZE = 80;
const RING_SIZE = BUTTON_SIZE + 40;

const styles = StyleSheet.create({
  wrapper: {
    width: RING_SIZE + 40,
    height: RING_SIZE + 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: Colors.primary,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.deep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  buttonRecording: {
    backgroundColor: '#E53935',
  },
  buttonProcessing: {
    backgroundColor: Colors.accent,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  stopIcon: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  micContainer: {
    alignItems: 'center',
  },
  micBody: {
    width: 18,
    height: 26,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  micBase: {
    width: 28,
    height: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderTopWidth: 0,
    borderWidth: 3,
    borderColor: '#fff',
    marginTop: 2,
  },
  micStand: {
    width: 3,
    height: 6,
    backgroundColor: '#fff',
    marginTop: 1,
  },
});
