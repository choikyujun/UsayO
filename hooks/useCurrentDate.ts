import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { localDateStr } from '../utils/timeHelpers';

function msUntilMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function useCurrentDate() {
  const [today, setToday] = useState(() => new Date());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleNextMidnight() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToday(new Date());
      scheduleNextMidnight();
    }, msUntilMidnight() + 100); // +100ms so it fires just after midnight
  }

  useEffect(() => {
    scheduleNextMidnight();

    function onAppStateChange(state: AppStateStatus) {
      if (state === 'active') {
        const fresh = new Date();
        setToday(prev => {
          if (localDateStr(prev) !== localDateStr(fresh)) return fresh;
          return prev;
        });
        scheduleNextMidnight();
      }
    }

    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => {
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    today,
    todayStr: localDateStr(today),
  };
}
