import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTheme, useColors } from '../../constants/colors';
import { ttsService } from '../../services/voice/TTSService';

const LANG_KEY  = 'yusay_lang';
const SPEED_KEY = 'yusay_tts_speed';

interface LangOption {
  id:    string;
  flag:  string;
  label: string;
}

const LANGUAGES: LangOption[] = [
  { id: 'ko',  flag: '🇰🇷', label: '한국어' },
  { id: 'en',  flag: '🇺🇸', label: 'English' },
  { id: 'ja',  flag: '🇯🇵', label: '日本語' },
  { id: 'sea', flag: '🌏',  label: '동남아어' },
];

const SPEED_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export default function LanguageSettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedLang, setSelectedLang] = useState('ko');
  const [ttsSpeed, setTtsSpeed]         = useState(1.0);
  const [loaded, setLoaded]             = useState(false);

  useEffect(() => {
    (async () => {
      const lang  = await AsyncStorage.getItem(LANG_KEY);
      const speed = await AsyncStorage.getItem(SPEED_KEY);
      if (lang)  setSelectedLang(lang);
      if (speed) setTtsSpeed(parseFloat(speed));
      setLoaded(true);
    })();
  }, []);

  async function selectLang(id: string) {
    setSelectedLang(id);
    await AsyncStorage.setItem(LANG_KEY, id);
  }

  async function selectSpeed(speed: number) {
    setTtsSpeed(speed);
    await AsyncStorage.setItem(SPEED_KEY, String(speed));
  }

  function testTts() {
    ttsService.speak('내일 오후 3시에 팀 회의 잡았어요', 'ko-KR', ttsSpeed);
  }

  if (!loaded) return <View style={styles.root} />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>인식 언어</Text>
        <View style={styles.card}>
          {LANGUAGES.map((lang, i) => (
            <Pressable
              key={lang.id}
              style={[styles.langRow, i > 0 && styles.langRowBorder]}
              onPress={() => selectLang(lang.id)}
            >
              <Text style={styles.langFlag}>{lang.flag}</Text>
              <Text style={styles.langLabel}>{lang.label}</Text>
              {selectedLang === lang.id && <View style={styles.checkDot} />}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TTS 속도</Text>
        <View style={styles.card}>
          <View style={styles.speedRow}>
            <Text style={styles.speedLabel}>느리게</Text>
            <View style={styles.speedSteps}>
              {SPEED_STEPS.map(s => (
                <Pressable
                  key={s}
                  style={[styles.speedStep, ttsSpeed === s && styles.speedStepActive]}
                  onPress={() => selectSpeed(s)}
                >
                  <Text style={[
                    styles.speedStepText,
                    { fontFamily: MONO },
                    ttsSpeed === s && styles.speedStepTextActive,
                  ]}>
                    {s.toFixed(2).replace('.00', '').replace(/0$/, '')}x
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.speedLabel}>빠르게</Text>
          </View>

          <Pressable style={styles.testBtn} onPress={testTts}>
            <Play size={14} color={colors.accent} />
            <Text style={styles.testBtnText}>테스트 재생</Text>
          </Pressable>
          <Text style={styles.testSample}>"내일 오후 3시에 팀 회의 잡았어요"</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root:         { flex: 1, backgroundColor: c.bg },
    scroll:       { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 20 },
    section:      { gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.accent, paddingLeft: 4 },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: c.border,
      overflow: 'hidden',
    },
    langRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 12,
    },
    langRowBorder: { borderTopWidth: 0.5, borderTopColor: c.border },
    langFlag:      { fontSize: 22 },
    langLabel:     { flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
    checkDot: {
      width: 8, height: 8,
      borderRadius: 4,
      backgroundColor: c.primary,
      marginRight: 4,
    },
    speedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 8,
      gap: 8,
    },
    speedLabel: { fontSize: 11, color: c.textMuted, width: 36, textAlign: 'center' },
    speedSteps: { flex: 1, flexDirection: 'row', gap: 3, justifyContent: 'center' },
    speedStep: {
      paddingHorizontal: 6,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    speedStepActive:     { backgroundColor: c.primary, borderColor: c.primary },
    speedStepText:       { fontSize: 9, color: c.textMuted },
    speedStepTextActive: { color: '#fff', fontWeight: '700' },
    testBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginHorizontal: 14,
      marginBottom: 6,
      backgroundColor: c.card2,
      borderRadius: 10,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    testBtnText: { fontSize: 14, color: c.accent, fontWeight: '600' },
    testSample: {
      textAlign: 'center',
      fontSize: 11,
      color: c.textMuted,
      paddingBottom: 12,
    },
  });
}
