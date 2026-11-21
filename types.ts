export type ToyShellId = 'bear' | 'car';

export type ToyVoiceName = 'Puck' | 'Aoede';

export type ToyLanguageMode = 'hinglish' | 'hindi';

export type ToyDeviceStatus =
  | 'sleeping'
  | 'idle'
  | 'connecting'
  | 'motion'
  | 'listening'
  | 'speaking';

export type MemoryCategory = 'Friend' | 'School' | 'Personal_Memory' | 'Preference';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  label: string;
  value: string;
  source?: 'preset' | 'manual' | 'ai';
  capturedAt?: string;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'aarav' | 'parent' | 'bholu' | 'system';
  text: string;
  timestamp: string;
  isPartial?: boolean;
}

export interface MemoryTimelineEvent {
  id: string;
  memoryId: string;
  memoryLabel: string;
  memoryValue: string;
  timestamp: string;
  processingNote: string;
  tone: 'positive' | 'playful' | 'tender' | 'calm';
  source: 'live' | 'earlier';
}

export interface MoodPulse {
  moodLabel: string;
  sentimentTone: 'positive' | 'playful' | 'tender' | 'calm';
  summary: string;
  playTheme: string;
  comfortScore: number;
  updatedAt: string;
  triggeredMemories?: Array<{
    memoryId: string;
    memoryLabel: string;
    memoryValue: string;
    processingNote: string;
    tone: 'positive' | 'playful' | 'tender' | 'calm';
  }>;
}

export interface LanguageTutorState {
  active: boolean;
  targetLanguage: string;
  topic: string;
  round: number;
  totalRounds: number;
}

export interface ClientToServerMessage {
  type:
    | 'start'
    | 'audio'
    | 'pir_trigger'
    | 'adult_trigger'
    | 'start_story'
    | 'start_tutor'
    | 'end_tutor'
    | 'update_memory'
    | 'set_language'
    | 'text_input'
    | 'stop';
  memories?: MemoryItem[];
  shell?: ToyShellId;
  voiceName?: ToyVoiceName;
  language?: ToyLanguageMode;
  targetLanguage?: string;
  topic?: string;
  triggerMotion?: boolean;
  triggerAdult?: boolean;
  data?: string;
  text?: string;
  changedMemory?: MemoryItem;
}

export interface ServerToClientMessage {
  type:
    | 'ready'
    | 'audio'
    | 'interrupted'
    | 'input_transcript'
    | 'output_transcript'
    | 'turn_complete'
    | 'pir_acknowledged'
    | 'adult_acknowledged'
    | 'pir_sensor_state'
    | 'enter_sleep_mode'
    | 'memory_synced'
    | 'memory_captured'
    | 'language_synced'
    | 'story_mode'
    | 'tutor_mode'
    | 'error'
    | 'closed';
  data?: string;
  text?: string;
  message?: string;
  reason?: string;
  active?: boolean;
  pirEnabled?: boolean;
  tutor?: LanguageTutorState;
  memory?: MemoryItem;
  memories?: MemoryItem[];
}
