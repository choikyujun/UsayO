import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'has_onboarded_v1';

export function useOnboarding() {
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(val => setIsFirstLaunch(!val));
  }, []);

  const markOnboarded = useCallback(() => {
    AsyncStorage.setItem(KEY, 'true');
    setIsFirstLaunch(false);
  }, []);

  return { isFirstLaunch, markOnboarded };
}
