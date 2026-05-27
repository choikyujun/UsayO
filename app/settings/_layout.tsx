import { router, Stack } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useColors } from '../../constants/colors';

export default function SettingsLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.nav },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Pretendard-Bold', fontWeight: '700', fontSize: 16, color: colors.textPrimary },
        headerShadowVisible: false,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} style={styles.back}>
            <View style={styles.backInner}>
              <ChevronLeft size={20} color={colors.accent} />
            </View>
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="calendar-integration" options={{ title: '캘린더 연동' }} />
      <Stack.Screen name="notifications"         options={{ title: '알림 설정' }} />
      <Stack.Screen name="language"              options={{ title: '언어·음성' }} />
      <Stack.Screen name="privacy"               options={{ title: '프라이버시' }} />
      <Stack.Screen name="app-info"              options={{ title: '앱 정보' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: 4 },
  backInner: { width: 32, alignItems: 'center', justifyContent: 'center' },
});
