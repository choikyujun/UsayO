import { Lock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTheme, useColors } from '../../constants/colors';

interface CalendarProvider {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  lastSync?: string;
  available: boolean;
}

export default function CalendarIntegrationScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [providers, setProviders] = useState<CalendarProvider[]>([
    { id: 'google', name: 'Google Calendar', icon: '🗓️', connected: false, available: true },
    { id: 'apple',  name: 'Apple Calendar',  icon: '🍎', connected: false, available: true },
    { id: 'naver',  name: 'Naver Calendar',  icon: '🟢', connected: false, available: false },
  ]);

  function handleConnect(id: string) {
    Alert.alert(
      'OAuth 연동',
      '실제 환경에서는 OAuth 플로우가 시작됩니다.\n(RevenueCat/Supabase 연동 후 활성화)',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '연결',
          onPress: () => {
            setProviders(prev => prev.map(p =>
              p.id === id ? { ...p, connected: true, lastSync: '방금 전' } : p
            ));
          },
        },
      ]
    );
  }

  function handleDisconnect(id: string) {
    Alert.alert('연동 해제', '정말 연동을 해제하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '해제',
        style: 'destructive',
        onPress: () => setProviders(prev =>
          prev.map(p => p.id === id ? { ...p, connected: false, lastSync: undefined } : p)
        ),
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>캘린더 연동</Text>
      <Text style={styles.sectionDesc}>
        기존 캘린더를 연결해서 일정을 자동으로 가져오세요.
      </Text>

      {providers.map(p => (
        <View key={p.id} style={[styles.card, !p.available && styles.cardDisabled]}>
          <View style={styles.cardLeft}>
            <Text style={styles.providerIcon}>{p.icon}</Text>
            <View>
              <Text style={[styles.providerName, !p.available && styles.textDisabled]}>
                {p.name}
              </Text>
              {!p.available ? (
                <Text style={styles.comingSoon}>준비 중</Text>
              ) : p.connected ? (
                <Text style={styles.connectedLabel}>
                  연결됨 · 마지막 동기화: {p.lastSync ?? '알 수 없음'}
                </Text>
              ) : (
                <Text style={styles.disconnectedLabel}>연결되지 않음</Text>
              )}
            </View>
          </View>

          {p.available && (
            <Pressable
              style={[styles.btn, p.connected && styles.btnDisconnect]}
              onPress={() => p.connected ? handleDisconnect(p.id) : handleConnect(p.id)}
            >
              <Text style={[styles.btnText, p.connected && styles.btnTextDisconnect]}>
                {p.connected ? '해제' : '연결'}
              </Text>
            </Pressable>
          )}
        </View>
      ))}

      <View style={styles.infoBox}>
        <Lock size={14} color={colors.textMuted} />
        <Text style={styles.infoText}>
          연동된 캘린더 데이터는 YuSay 서버에 저장되지 않으며,
          동기화 시에만 읽기 권한이 사용됩니다.
        </Text>
      </View>
    </ScrollView>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: c.bg },
    scroll:      { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },
    sectionTitle: { fontSize: 20, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    sectionDesc:  { fontSize: 13, color: c.textMuted, marginBottom: 8, lineHeight: 18 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 0.5,
      borderColor: c.border,
    },
    cardDisabled:       { opacity: 0.45 },
    cardLeft:           { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    providerIcon:       { fontSize: 26 },
    providerName:       { fontSize: 15, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', color: c.textPrimary, marginBottom: 3 },
    textDisabled:       { color: c.textMuted },
    comingSoon:         { fontSize: 11, color: c.textMuted },
    connectedLabel:     { fontSize: 11, color: c.success },
    disconnectedLabel:  { fontSize: 11, color: c.textMuted },
    btn: {
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 8,
    },
    btnDisconnect:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
    btnText:           { fontSize: 13, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: '#fff' },
    btnTextDisconnect: { color: c.textMuted },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: c.card,
      borderRadius: 10,
      padding: 14,
      borderWidth: 0.5,
      borderColor: c.border,
      marginTop: 8,
    },
    infoText: { flex: 1, fontSize: 12, color: c.textMuted, lineHeight: 18 },
  });
}
