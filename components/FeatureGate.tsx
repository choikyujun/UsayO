import { Lock } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import { FeatureKey } from '../constants/featureGates';
import { useFeatureGate } from '../hooks/useFeatureGate';
import UpgradeModal from './UpgradeModal';

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const gate = useFeatureGate(feature);
  const [modalVisible, setModalVisible] = useState(false);

  if (gate.isAllowed) return <>{children}</>;

  if (fallback) {
    return (
      <>
        <Pressable onPress={() => setModalVisible(true)}>{fallback}</Pressable>
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

  return (
    <>
      <Pressable style={styles.locked} onPress={() => setModalVisible(true)}>
        <Lock size={14} color={Colors.accent} />
        <Text style={styles.lockedText}>
          {gate.upgradeTarget === 'team' ? 'Team' : 'Pro'} 기능
        </Text>
      </Pressable>
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
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.45,
    paddingVertical: 4,
  },
  lockedText: {
    fontSize: 13,
    color: Colors.accent,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
  },
});
