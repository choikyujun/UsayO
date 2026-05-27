import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Calendar, Mic } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

const { width: W } = Dimensions.get('window');

// ── Illustrations ─────────────────────────────────────────

function Illus1() {
  return (
    <View style={illus.row}>
      <View style={illus.iconBox}>
        <Mic size={32} color={Colors.primary} />
      </View>
      <Text style={illus.arrow}>→</Text>
      <View style={illus.iconBox}>
        <Calendar size={32} color={Colors.success} />
      </View>
    </View>
  );
}

function Illus2() {
  const actions = [
    { label: '생성', color: Colors.success },
    { label: '수정', color: Colors.warning },
    { label: '삭제', color: Colors.danger },
  ];
  return (
    <View style={illus.row}>
      {actions.map(a => (
        <View key={a.label} style={[illus.actionCard, { borderColor: a.color + '60' }]}>
          <View style={[illus.actionDot, { backgroundColor: a.color }]} />
          <Text style={[illus.actionLabel, { color: a.color }]}>{a.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Illus3() {
  const examples = [
    { input: '내일 오후', output: '14:00' },
    { input: '퇴근 후', output: '18:00' },
    { input: '다음 주 월요일', output: '월 09:00' },
  ];
  return (
    <View style={illus.col}>
      {examples.map(e => (
        <View key={e.input} style={illus.exRow}>
          <Text style={illus.exInput}>"{e.input}"</Text>
          <Text style={illus.exArrow}>→</Text>
          <Text style={illus.exOutput}>{e.output}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Slide data ────────────────────────────────────────────

const SLIDES = [
  {
    Illus: Illus1,
    title: '말하면 일정이 잡혀요',
    desc: '"내일 오후 3시에 팀 회의 잡아줘" → 완료',
    badge: undefined as string | undefined,
  },
  {
    Illus: Illus2,
    title: '전부 음성으로 됩니다',
    desc: '생성, 수정, 삭제까지 타이핑 없이 말로 해결해요.',
    badge: '업계 유일 완전 음성 CRUD',
  },
  {
    Illus: Illus3,
    title: '한국어를 제대로 알아요',
    desc: '자연스러운 한국어 시간 표현을 정확하게 인식해요.',
    badge: undefined,
  },
];

// ── Screen ────────────────────────────────────────────────

export default function SlidesScreen() {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    AsyncStorage.setItem('onboarding_step', 'slides');
  }, []);

  function goNext() {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
      setIndex(next);
    } else {
      AsyncStorage.setItem('onboarding_step', 'permission-mic');
      router.replace('/onboarding/permission-mic');
    }
  }

  function skip() {
    AsyncStorage.setItem('onboarding_step', 'permission-mic');
    router.replace('/onboarding/permission-mic');
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = Math.round(e.nativeEvent.contentOffset.x / W);
    setIndex(page);
  }

  const isLast = index === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={styles.scroll}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width: W }]}>
            <View style={styles.illustBox}>
              <slide.Illus />
            </View>

            {slide.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{slide.badge}</Text>
              </View>
            )}

            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.desc}>{slide.desc}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.footer}>
        <Pressable style={styles.nextBtn} onPress={goNext}>
          <Text style={styles.nextBtnText}>{isLast ? '시작하기' : '다음'}</Text>
        </Pressable>
        {!isLast && (
          <Pressable style={styles.skipBtn} onPress={skip}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────

const illus = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    justifyContent: 'center',
  },
  col: {
    gap: 10,
    alignItems: 'stretch',
    width: '100%',
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.darkCard,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 24,
    color: Colors.textMuted,
  },
  actionCard: {
    width: 76,
    height: 84,
    borderRadius: 18,
    backgroundColor: Colors.darkCard,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  actionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.darkCard,
    paddingHorizontal: Spacing.base,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.darkBorder,
  },
  exInput: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
  },
  exArrow: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  exOutput: {
    marginLeft: 'auto',
    fontSize: 14,
    color: Colors.success,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  scroll: { flex: 1 },
  slide: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 64,
    alignItems: 'center',
  },
  illustBox: {
    width: '100%',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  badge: {
    backgroundColor: Colors.primary + '20',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    marginBottom: Spacing.base,
  },
  badgeText: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
    letterSpacing: -0.5,
  },
  desc: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.primary,
  },
  dotInactive: {
    width: 8,
    backgroundColor: Colors.darkBorder,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 52,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  nextBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: Spacing.base,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
    color: '#fff',
  },
  skipBtn: {
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
});
