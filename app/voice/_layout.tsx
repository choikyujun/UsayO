import { Stack } from 'expo-router';

export default function VoiceLayout() {
  return <Stack screenOptions={{ headerShown: false, presentation: 'transparentModal' }} />;
}
