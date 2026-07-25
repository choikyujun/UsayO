import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

type LucideIconComponent = React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;

interface Props {
  Icon:      LucideIconComponent;
  title:     string;
  subtitle?: string;
  example?:  string;
  action?:   { label: string; onPress: () => void };
}

export default function EmptyState({ Icon, title, subtitle, example, action }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <Icon size={64} color={colors.textTertiary} strokeWidth={1.2} />
      <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sub, { color: colors.textTertiary }]}>{subtitle}</Text>
      ) : null}
      {example ? (
        <View style={styles.exampleBlock}>
          <Text style={[styles.exampleCaption, { color: colors.textTertiary }]}>이렇게 말해보세요</Text>
          <Text style={[styles.exampleText, { color: colors.textSecondary }]}>{example}</Text>
        </View>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={[styles.btn, { borderColor: colors.primary + '80' }]}
        >
          <Text style={[styles.btnText, { color: colors.primary }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.xl,
    gap:               Spacing.sm,
  },
  title: {
    fontSize:   17,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
    textAlign:  'center',
    marginTop:  Spacing.sm,
  },
  sub: {
    fontSize:   14,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
    textAlign:  'center',
    lineHeight: 20,
  },
  exampleBlock: {
    marginTop:  Spacing.base,
    alignItems: 'center',
    gap:        Spacing.xs,
  },
  exampleCaption: {
    fontSize:      11,
    fontFamily:    'Pretendard-Medium',
    fontWeight:    '500',
    letterSpacing: 0.3,
    textAlign:     'center',
  },
  exampleText: {
    fontSize:   15,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
    textAlign:  'center',
  },
  btn: {
    marginTop:         Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical:   Spacing.sm,
    borderRadius:      20,
    borderWidth:       1,
  },
  btnText: {
    fontSize:   14,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
  },
});
