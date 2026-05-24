import { create } from 'zustand';
import { ClassifiedIntent, HybridInputState, NoiseAnalysis, VoicePhase } from '../types';
import { VoiceFlowError } from '../services/voice/VoiceFlowOrchestrator';

interface VoiceStore {
  phase: VoicePhase;
  transcript: string | null;
  classifiedIntent: ClassifiedIntent | null;
  confirmMessage: string | null;
  confirmSource: 'voice' | 'hybrid' | null;
  audioLevel: number;
  error: VoiceFlowError | null;
  isHybridMode: boolean;
  hybridInputState: HybridInputState | null;
  noiseAnalysis: NoiseAnalysis | null;

  setPhase: (phase: VoicePhase) => void;
  setTranscript: (t: string | null) => void;
  setClassifiedIntent: (intent: ClassifiedIntent | null) => void;
  setConfirmMessage: (msg: string | null) => void;
  setConfirmSource: (src: 'voice' | 'hybrid' | null) => void;
  setAudioLevel: (level: number) => void;
  setError: (error: VoiceFlowError | null) => void;
  setHybridMode: (on: boolean) => void;
  setHybridInputState: (state: HybridInputState | null) => void;
  setNoiseAnalysis: (analysis: NoiseAnalysis | null) => void;
  reset: () => void;
}

const initialState = {
  phase: 'idle' as VoicePhase,
  transcript: null,
  classifiedIntent: null,
  confirmMessage: null,
  confirmSource: null as 'voice' | 'hybrid' | null,
  audioLevel: 0,
  error: null,
  isHybridMode: false,
  hybridInputState: null,
  noiseAnalysis: null,
};

export const useVoiceStore = create<VoiceStore>((set) => ({
  ...initialState,
  setPhase: (phase) => set({ phase }),
  setTranscript: (transcript) => set({ transcript }),
  setClassifiedIntent: (classifiedIntent) => set({ classifiedIntent }),
  setConfirmMessage: (confirmMessage) => set({ confirmMessage }),
  setConfirmSource: (confirmSource) => set({ confirmSource }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setError: (error) => set({ error }),
  setHybridMode: (isHybridMode) => set({ isHybridMode }),
  setHybridInputState: (hybridInputState) => set({ hybridInputState }),
  setNoiseAnalysis: (noiseAnalysis) => set({ noiseAnalysis }),
  reset: () => set(initialState),
}));
