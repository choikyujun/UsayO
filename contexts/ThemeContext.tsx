import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ttsService } from '../services/voice/TTSService';

const STORAGE_KEY_ACCENT = 'accent_color';
const STORAGE_KEY_HINT  = 'hint_enabled';
const STORAGE_KEY_TTS   = 'voice_tts_enabled';
const STORAGE_KEY_LUNAR = 'lunar_enabled';

// Per-mode color variant for each theme
interface ThemeVariant {
  bg:      string;
  card:    string;
  card2:   string;
  border:  string;
  nav:     string;
  primary: string;
  accent:  string;
}

export interface AccentPalette {
  id:    string;
  label: string;
  color: string; // swatch dot color
  dark:  ThemeVariant;
  light: ThemeVariant;
}

export const ACCENT_PALETTES: AccentPalette[] = [
  {
    id: 'purple', label: 'Voice', color: '#534AB7',
    dark:  { bg:'#1A183A', card:'#252248', card2:'#2E2B57', border:'#3C3869', nav:'#100E28', primary:'#534AB7', accent:'#AFA9EC' },
    light: { bg:'#EEEDFE', card:'#FFFFFF', card2:'#F0EFFF', border:'#D8D5F7', nav:'#E2E0FF', primary:'#534AB7', accent:'#534AB7' },
  },
  {
    id: 'blue', label: 'Ocean', color: '#2563EB',
    dark:  { bg:'#0F172A', card:'#1E293B', card2:'#273548', border:'#334155', nav:'#0A1120', primary:'#2563EB', accent:'#93C5FD' },
    light: { bg:'#F0F7FF', card:'#FFFFFF', card2:'#E8F4FE', border:'#BFDBFE', nav:'#DBE9F7', primary:'#2563EB', accent:'#1D4ED8' },
  },
  {
    id: 'green', label: 'Forest', color: '#1D9E75',
    dark:  { bg:'#0A1F1A', card:'#0D2F25', card2:'#153D33', border:'#1E4D40', nav:'#071510', primary:'#1D9E75', accent:'#6EE7B7' },
    light: { bg:'#F0FDF4', card:'#FFFFFF', card2:'#DCFCE7', border:'#BBF7D0', nav:'#D1FAE5', primary:'#1D9E75', accent:'#15815F' },
  },
  {
    id: 'coral', label: 'Sunset', color: '#F97366',
    dark:  { bg:'#1F1410', card:'#2D1C15', card2:'#3A241B', border:'#4A2E22', nav:'#140D09', primary:'#F97366', accent:'#FCA5A5' },
    light: { bg:'#FFF7ED', card:'#FFFFFF', card2:'#FEF3E2', border:'#FED7AA', nav:'#FDE8C8', primary:'#E85549', accent:'#C73D31' },
  },
  {
    id: 'charcoal', label: 'Mono', color: '#374151',
    dark:  { bg:'#09090B', card:'#18181B', card2:'#27272A', border:'#3F3F46', nav:'#030303', primary:'#6B7280', accent:'#9CA3AF' },
    light: { bg:'#FAFAFA', card:'#FFFFFF', card2:'#F4F4F5', border:'#E4E4E7', nav:'#F1F1F3', primary:'#374151', accent:'#1F2937' },
  },
];

interface ThemeContextValue {
  accentId:     string;
  setAccentId:  (id: string) => void;
  hintEnabled:  boolean;
  toggleHint:   () => void;
  ttsEnabled:   boolean;
  toggleTTS:    () => void;
  lunarEnabled: boolean;
  toggleLunar:  () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  accentId:     'purple',
  setAccentId:  () => {},
  hintEnabled:  true,
  toggleHint:   () => {},
  ttsEnabled:   true,
  toggleTTS:    () => {},
  lunarEnabled: true,
  toggleLunar:  () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accentId,     setAccentIdState]    = useState('purple');
  const [hintEnabled,  setHintEnabledState] = useState(true);
  const [ttsEnabled,   setTTSEnabledState]  = useState(true);
  const [lunarEnabled, setLunarEnabledState] = useState(true);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_ACCENT),
      AsyncStorage.getItem(STORAGE_KEY_HINT),
      AsyncStorage.getItem(STORAGE_KEY_TTS),
      AsyncStorage.getItem(STORAGE_KEY_LUNAR),
    ]).then(([accent, hint, tts, lunar]) => {
      if (accent && ACCENT_PALETTES.some(p => p.id === accent)) setAccentIdState(accent);
      if (hint  !== null) setHintEnabledState(hint  === 'true');
      if (tts   !== null) setTTSEnabledState(tts   === 'true');
      if (lunar !== null) setLunarEnabledState(lunar === 'true');
    }).catch(() => {});
  }, []);

  // "음성 확인(TTS)" 설정을 ttsService에 동기화 → Home(useVoiceFlow) 포함 모든 speak 경로가 반영.
  useEffect(() => {
    ttsService.setEnabled(ttsEnabled);
  }, [ttsEnabled]);

  // 콜백을 useCallback으로 안정화 (setXState는 불변) → context value 참조 안정화의 전제.
  const setAccentId = useCallback((id: string) => {
    setAccentIdState(id);
    AsyncStorage.setItem(STORAGE_KEY_ACCENT, id).catch(() => {});
  }, []);

  const toggleHint = useCallback(() => {
    setHintEnabledState(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY_HINT, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleTTS = useCallback(() => {
    setTTSEnabledState(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY_TTS, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleLunar = useCallback(() => {
    setLunarEnabledState(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY_LUNAR, String(next)).catch(() => {});
      return next;
    });
  }, []);

  // value를 메모화 → 상태(accentId/hintEnabled/…)가 실제로 바뀔 때만 새 참조.
  const value = useMemo(
    () => ({ accentId, setAccentId, hintEnabled, toggleHint, ttsEnabled, toggleTTS, lunarEnabled, toggleLunar }),
    [accentId, hintEnabled, ttsEnabled, lunarEnabled, setAccentId, toggleHint, toggleTTS, toggleLunar],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
