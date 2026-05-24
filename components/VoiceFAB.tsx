import * as Haptics from 'expo-haptics';
import { Mic } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { quotaTracker } from '../services/subscription/QuotaTracker';
import UpgradeModal from './UpgradeModal';

interface Props {
  disabled?: boolean;
  onVoiceOpen?: () => void;
}

export default function VoiceFAB({ disabled, onVoiceOpen }: Props) {
  const gate = useFeatureGate('voice_create');
  const [modalVisible, setModalVisible] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.22, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  async function handlePress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!gate.isAllowed) {
      setModalVisible(true);
      return;
    }

    const ok = await quotaTracker.checkQuota('create');
    if (!ok) {
      setModalVisible(true);
      return;
    }

    onVoiceOpen?.();
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.fabOuter}>
          <Animated.View
            style={[styles.pulseRing, { transform: [{ scale: pulse }] }]}
            pointerEvents="none"
          />
          <Pressable
            style={[styles.fab, disabled && styles.fabDisabled]}
            onPress={handlePress}
            disabled={disabled}
          >
            <Mic size={26} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.label}>말하려면 탭하세요</Text>
      </View>

      <UpgradeModal
        visible={modalVisible}
        gateType={gate.gateType}
        upgradeTarget={gate.upgradeTarget}
        usageInfo={gate.usageInfo}
        onDismiss={() => setModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  fabOuter: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary + '35',
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  fabDisabled: { opacity: 0.5 },
  label: {
    fontSize: 12,
    color: Colors.accent,
    letterSpacing: 0.3,
  },
});
