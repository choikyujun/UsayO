import { EventEmitter } from 'events';

export const voiceTriggerEmitter = new EventEmitter();

export function triggerVoiceFromDeeplink() {
  voiceTriggerEmitter.emit('voice:start');
}
