import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export default function BigClock({ hideDate, compact }: { hideDate?: boolean; compact?: boolean } = {}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [now, setNow] = useState<Date>(() => new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current); };
  }, []);

  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일 ${DAYS[now.getDay()]}`;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.time, compact && styles.timeCompact, { fontFamily: MONO }]}>{timeStr}</Text>
      {!hideDate && <Text style={styles.date}>{dateStr}</Text>}
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    wrap:        { alignItems: 'center', paddingTop: 28, paddingBottom: 20 },
    wrapCompact: { paddingTop: 6, paddingBottom: 3 },
    time: {
      fontSize: 52,
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: 2,
      lineHeight: 60,
    },
    timeCompact: {
      fontSize: 40,
      lineHeight: 48,
    },
    date: {
      fontSize: 14,
      color: c.accent,
      marginTop: 6,
      letterSpacing: 0.3,
    },
  });
}
