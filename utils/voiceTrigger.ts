type Listener = () => void;
const listeners = new Set<Listener>();

export function onVoiceTrigger(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function triggerVoiceFromDeeplink(): void {
  listeners.forEach(l => l());
}
