import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

type LucideIconComponent = React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;

interface Props {
  Icon:       LucideIconComponent;
  title:      string;
  subtitle?:  string;
  action?:    { label: string; onPress: () => void };
  openSettings?: boolean; // shortcut for Settings action
}

export default function ErrorState({ Icon, title, subtitle, action, openSettings }: Props) {
  const colors = useColors();

  const effectiveAction = openSettings
    ? { label: 'Settings 열기', onPress: () => Linking.openSettings() }
    : action;

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: colors.error + '15' }]}>
        <Icon size={36} color={colors.error} strokeWidth={1.5} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>
      ) : null}
      {effectiveAction ? (
        <Pressable
          onPress={effectiveAction.onPress}
          style={[styles.btn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.btnText}>{effectiveAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.xl,
    gap:               Spacing.sm,
  },
  iconCircle: {
    width:          72,
    height:         72,
    borderRadius:   36,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   Spacing.xs,
  },
  title: {
    fontSize:   17,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    textAlign:  'center',
  },
  sub: {
    fontSize:   14,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
    textAlign:  'center',
    lineHeight: 20,
  },
  btn: {
    marginTop:         Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical:   10,
    borderRadius:      20,
  },
  btnText: {
    color:      '#FFFFFF',
    fontSize:   14,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
  },
});
