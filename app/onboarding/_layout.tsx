import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#0E0C1F' },
      }}
    >
      <Stack.Screen name="splash" options={{ animation: 'fade' }} />
    </Stack>
  );
}
