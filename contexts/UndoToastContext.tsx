import { createContext, useCallback, useContext, useRef, useState } from 'react';

interface UndoToastState {
  visible:  boolean;
  message:  string;
  onUndo?:  () => void;
}

interface UndoToastContextValue {
  state:    UndoToastState;
  showUndo: (message: string, onUndo: () => void, duration?: number) => void;
  dismiss:  () => void;
}

const UndoToastContext = createContext<UndoToastContextValue>({
  state:    { visible: false, message: '' },
  showUndo: () => {},
  dismiss:  () => {},
});

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UndoToastState>({ visible: false, message: '' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState(s => ({ ...s, visible: false }));
  }, []);

  const showUndo = useCallback((message: string, onUndo: () => void, duration = 5000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ visible: true, message, onUndo });
    timerRef.current = setTimeout(() => {
      setState(s => ({ ...s, visible: false }));
      timerRef.current = null;
    }, duration);
  }, []);

  return (
    <UndoToastContext.Provider value={{ state, showUndo, dismiss }}>
      {children}
    </UndoToastContext.Provider>
  );
}

export function useUndoToast() {
  return useContext(UndoToastContext);
}
