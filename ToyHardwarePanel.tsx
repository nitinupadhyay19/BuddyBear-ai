import { useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import {
  AlertCircle,
  BookOpen,
  Car,
  Check,
  Languages,
  Mic,
  MicOff,
  Moon,
  Pencil,
  Plus,
  Power,
  Radio,
  Send,
  Square,
  Trash2,
  UserCheck,
  Volume2,
  X,
} from 'lucide-react';
import type {
  LanguageTutorState,
  MemoryCategory,
  MemoryItem,
  MoodPulse,
  ToyDeviceStatus,
  ToyLanguageMode,
  ToyShellId,
  ToyVoiceName,
  TranscriptEntry,
} from '../types';
import { AudioWaveform } from './AudioWaveform';

const SHELL_ASSETS: Record<
  ToyShellId,
  {
    name: string;
    ageRange: string;
    shortTitle: string;
    materialNote: string;
    imageSrc: string;
    imageAlt: string;
  }
> = {
  bear: {
    name: 'Plush Teddy Bear Shell',
    ageRange: 'Ages 5–8',
    shortTitle: 'Plush Teddy Bear (Ages 5–8)',
    materialNote: 'Oat bouclé cotton · Woven chest acoustic mesh · Zero screen',
    imageSrc: '/src/assets/images/toy_plush_bear_1795091165694.jpg',
    imageAlt: 'BuddyBear AI Plush Teddy Bear screen-free shell with woven speaker mesh',
  },
  car: {
    name: 'Toy Car Shell',
    ageRange: 'Ages 9–12',
    shortTitle: 'Toy Car Shell (Ages 9–12)',
    materialNote: 'Matte teal wood & brass grille · Desk companion · Zero screen',
    imageSrc: '/src/assets/images/toy_car_shell_1795091162794.jpg',
    imageAlt: 'BuddyBear AI Toy Car screen-free shell with perforated brass speaker grille',
  },
};

const STATUS_META: Record<
  ToyDeviceStatus,
  {
    label: string;
    helper: string;
    ringClass: string;
    glowStyle: string;
    textClass: string;
  }
> = {
  sleeping: {
    label: 'Sleeping • PIR Motion Sensor OFF',
    helper: 'PIR sensor and microphone powered down — click Wake Toy Up or Kid Trigger to resume',
    ringClass: 'border-slate-300/75',
    glowStyle: 'shadow-none',
    textClass: 'text-slate-500',
  },
  idle: {
    label: 'Active · PIR Sensor ON',
    helper: 'PIR sensor armed in standby — microphone physically gated until motion or voice starts',
    ringClass: 'border-slate-300',
    glowStyle: 'shadow-[0_0_0_6px_rgba(203,213,225,0.28)]',
    textClass: 'text-slate-700',
  },
  connecting: {
    label: 'Connecting to Bholu',
    helper: 'Opening encrypted 16kHz / 24kHz PCM voice stream',
    ringClass: 'border-slate-400',
    glowStyle: 'shadow-[0_0_0_8px_rgba(148,163,184,0.25)]',
    textClass: 'text-slate-700',
  },
  motion: {
    label: 'Active · Motion Detected',
    helper: 'PIR sensor detected presence — Bholu is speaking first without a wake word',
    ringClass: 'border-amber-500',
    glowStyle: 'shadow-[0_0_0_12px_rgba(217,119,6,0.20)]',
    textClass: 'text-amber-700',
  },
  listening: {
    label: 'Listening',
    helper: 'Speak naturally — interrupt Bholu anytime for instant barge-in',
    ringClass: 'border-teal-600',
    glowStyle: 'shadow-[0_0_0_10px_rgba(15,118,110,0.18)]',
    textClass: 'text-teal-700',
  },
  speaking: {
    label: 'Speaking',
    helper: '24kHz voice active — speak anytime to interrupt naturally',
    ringClass: 'border-orange-500',
    glowStyle: 'shadow-[0_0_0_14px_rgba(234,88,12,0.22)]',
    textClass: 'text-orange-700',
  },
};

const SENTIMENT_GLOW_META: Record<
  MoodPulse['sentimentTone'],
  {
    auraColor: string;
    innerTint: string;
    hueLabel: string;
    dotColor: string;
  }
> = {
  positive: {
    auraColor:
      'radial-gradient(circle, rgba(250, 204, 21, 0.52) 0%, rgba(251, 191, 36, 0.24) 48%, rgba(250, 204, 21, 0) 74%)',
    innerTint: 'rgba(250, 204, 21, 0.16)',
    hueLabel: 'Warm Yellow · Happy',
    dotColor: 'text-amber-600',
  },
  calm: {
    auraColor:
      'radial-gradient(circle, rgba(96, 165, 250, 0.46) 0%, rgba(125, 211, 252, 0.22) 48%, rgba(96, 165, 250, 0) 74%)',
    innerTint: 'rgba(96, 165, 250, 0.14)',
    hueLabel: 'Soft Blue · Calm',
    dotColor: 'text-sky-600',
  },
  playful: {
    auraColor:
      'radial-gradient(circle, rgba(251, 146, 60, 0.50) 0%, rgba(253, 186, 116, 0.24) 48%, rgba(251, 146, 60, 0) 74%)',
    innerTint: 'rgba(251, 146, 60, 0.16)',
    hueLabel: 'Warm Amber · Playful',
    dotColor: 'text-orange-600',
  },
  tender: {
    auraColor:
      'radial-gradient(circle, rgba(192, 132, 252, 0.44) 0%, rgba(216, 180, 254, 0.22) 48%, rgba(192, 132, 252, 0) 74%)',
    innerTint: 'rgba(192, 132, 252, 0.14)',
    hueLabel: 'Soft Lavender · Comforted',
    dotColor: 'text-purple-600',
  },
};

interface ToyHardwarePanelProps {
  shell: ToyShellId;
  onShellChange: (shell: ToyShellId) => void;
  voiceName: ToyVoiceName;
  onVoiceChange: (voice: ToyVoiceName) => void;
  language: ToyLanguageMode;
  onLanguageChange: (language: ToyLanguageMode) => void;
  moodPulse: MoodPulse;
  status: ToyDeviceStatus;
  pirSensorEnabled: boolean;
  sleepReason: string | null;
  isConnected: boolean;
  isStoryMode: boolean;
  tutorState: LanguageTutorState;
  isMuted: boolean;
  onToggleMute: () => void;
  errorMessage: string | null;
  onDismissError: () => void;
  transcript: TranscriptEntry[];
  onClearTranscript: () => void;
  onToggleLiveVoice: () => void;
  onTriggerPirMotion: () => void;
  onTriggerAdultNearby: () => void;
  onWakeToyUp: () => void;
  onStartLongStory: () => void;
  onStartLanguageTutor: (targetLanguage: string, topic: string) => void;
  onEndLanguageTutor: () => void;
  onSendTextFallback: (text: string) => void;
  memories: MemoryItem[];
  recentlyCapturedIds: Set<string>;
  onAddMemory: (category: MemoryCategory, label: string, value: string) => void;
  onUpdateMemory: (id: string, label: string, value: string) => void;
  onDeleteMemory: (id: string) => void;
  memorySyncNote: string | null;
  inputAnalyserRef: RefObject<AnalyserNode | null>;
  outputAnalyserRef: RefObject<AnalyserNode | null>;
}

const TUTOR_LANGUAGE_PRESETS = [
  { language: 'English', topic: 'Making New Friends & School Phrases' },
  { language: 'Hindi', topic: 'Polite Everyday Phrases' },
  { language: 'Spanish', topic: 'Fun Greetings & Counting' },
  { language: 'French', topic: 'Friendly Words & Greetings' },
  { language: 'Marwari', topic: 'Local Jaipur & Rajasthan Greetings' },
] as const;

export function ToyHardwarePanel({
  shell,
  onShellChange,
  voiceName,
  onVoiceChange,
  language,
  onLanguageChange,
  moodPulse,
  status,
  pirSensorEnabled,
  sleepReason,
  isConnected,
  isStoryMode,
  tutorState,
  isMuted,
  onToggleMute,
  errorMessage,
  onDismissError,
  transcript,
  onClearTranscript,
  onToggleLiveVoice,
  onTriggerPirMotion,
  onTriggerAdultNearby,
  onWakeToyUp,
  onStartLongStory,
  onStartLanguageTutor,
  onEndLanguageTutor,
  onSendTextFallback,
  memories,
  recentlyCapturedIds,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  memorySyncNote,
  inputAnalyserRef,
  outputAnalyserRef,
}: ToyHardwarePanelProps) {
  const [imgFailed, setImgFailed] = useState<Record<ToyShellId, boolean>>({
    bear: false,
    car: false,
  });
  const [textDraft, setTextDraft] = useState('');
  const [showTutorPicker, setShowTutorPicker] = useState(false);
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newCategory, setNewCategory] = useState<MemoryCategory>('Friend');
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editValue, setEditValue] = useState('');

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const activeShell = SHELL_ASSETS[shell];
  const statusInfo = STATUS_META[status];
  const sentimentGlow = SENTIMENT_GLOW_META[moodPulse.sentimentTone];

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [transcript]);

  const handleAddMemorySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newValue.trim()) return;
    onAddMemory(newCategory, newLabel.trim(), newValue.trim());
    setNewLabel('');
    setNewValue('');
    setIsAddingMemory(false);
  };

  const handleStartEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditValue(item.value);
  };

  const handleSaveEdit = (id: string) => {
    if (!editLabel.trim() || !editValue.trim()) return;
    onUpdateMemory(id, editLabel.trim(), editValue.trim());
    setEditingId(null);
  };

  const handleTextSend = (e: FormEvent) => {
    e.preventDefault();
    if (!textDraft.trim()) return;
    onSendTextFallback(textDraft);
    setTextDraft('');
  };

  return (
    <div className="space-y-6">
      {/* Hardware Stage Section */}
      <section
        id="toy-simulator"
        className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden"
      >
        {/* Top Toolbar: Swappable Shell Selector + Voice Selector */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 tracking-tight">
              Toy Hardware Simulator
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Swap physical shells around the same screen-free audio core
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Swappable Shell Segmented Control */}
            <div
              role="tablist"
              aria-label="Swappable toy shell selector"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                role="tab"
                aria-selected={shell === 'bear'}
                onClick={() => onShellChange('bear')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  shell === 'bear'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Plush Bear · 5–8
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={shell === 'car'}
                onClick={() => onShellChange('car')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  shell === 'car'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Toy Car · 9–12
              </button>
            </div>

            {/* Language Selector: Hinglish / Simple Hindi */}
            <div
              role="group"
              aria-label="Spoken language"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                onClick={() => onLanguageChange('hinglish')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  language === 'hinglish'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Hinglish
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('hindi')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  language === 'hindi'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                सरल हिंदी
              </button>
            </div>

            {/* Expressive Voice Picker */}
            <div
              role="group"
              aria-label="Voice timbre"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            >
              {(['Puck', 'Aoede'] as const).map((voice) => (
                <button
                  key={voice}
                  type="button"
                  disabled={isConnected}
                  onClick={() => onVoiceChange(voice)}
                  title={
                    isConnected
                      ? 'Stop voice session to change voice timbre'
                      : `Use ${voice} voice`
                  }
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    voiceName === voice
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  } ${isConnected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {voice}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Centerpiece Visual + Status Ring + Controls */}
        <div className="p-6 md:p-8">
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss error"
                className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            {/* Circular Hardware Pod + Dynamic Sentiment Glow + Acoustic Ring */}
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="relative flex items-center justify-center py-2">
                {/* Ambient Sentiment-Reactive Breathing Halo (dims gently in Sleep Mode) */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -inset-6 rounded-full blur-2xl transition-all duration-700 ${
                    status === 'sleeping' ? 'opacity-20' : 'animate-sentiment-glow'
                  }`}
                  style={{
                    background:
                      status === 'sleeping'
                        ? 'radial-gradient(circle, rgba(148, 163, 184, 0.35) 0%, rgba(148, 163, 184, 0) 70%)'
                        : sentimentGlow.auraColor,
                  }}
                />

                {(status === 'motion' || status === 'speaking' || status === 'listening') && (
                  <span
                    aria-hidden="true"
                    className={`absolute inset-2 rounded-full border-2 animate-ring-ripple ${
                      status === 'speaking'
                        ? 'border-orange-500/60'
                        : status === 'motion'
                          ? 'border-amber-500/70'
                          : 'border-teal-600/45'
                    }`}
                  />
                )}

                <div
                  className={`relative w-52 h-52 sm:w-56 sm:h-56 rounded-full border-[3px] p-2 bg-white/95 transition-all duration-500 ${statusInfo.ringClass} ${statusInfo.glowStyle}`}
                >
                  <div className="relative w-full h-full rounded-full overflow-hidden bg-[#ECEAE4] flex items-center justify-center">
                    {!imgFailed[shell] ? (
                      <img
                        src={activeShell.imageSrc}
                        alt={activeShell.imageAlt}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setImgFailed((prev) => ({ ...prev, [shell]: true }))
                        }
                        className={`w-full h-full object-cover transition-all duration-500 ${
                          status === 'sleeping' ? 'opacity-55 grayscale-[40%]' : ''
                        }`}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                        <Car className="w-10 h-10 mb-2 text-teal-700" />
                        <span className="text-sm font-medium text-slate-700">
                          {activeShell.name}
                        </span>
                      </div>
                    )}
                    {/* Subtle Sentiment Edge Tint or Sleep Dimmer */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-full transition-all duration-700"
                      style={{
                        boxShadow:
                          status === 'sleeping'
                            ? 'inset 0 0 36px 10px rgba(15, 23, 42, 0.22)'
                            : `inset 0 0 28px 6px ${sentimentGlow.innerTint}`,
                      }}
                    />
                    {status === 'sleeping' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/15">
                        <div className="w-11 h-11 rounded-full bg-slate-900/75 text-slate-100 flex items-center justify-center backdrop-blur-xs">
                          <Moon className="w-5 h-5" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Unboxed Hardware & Sentiment Glow Readout */}
              <div className="mt-4 text-center">
                <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                  <span className={statusInfo.textClass}>{statusInfo.label}</span>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-xs">
                  {status === 'sleeping' ? (
                    <span className="text-slate-500">
                      {sleepReason || 'Paused by parent voice shutdown'}
                    </span>
                  ) : (
                    <>
                      <span className="text-slate-400">{activeShell.ageRange}</span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className={`font-medium ${sentimentGlow.dotColor}`}>
                        {sentimentGlow.hueLabel}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
                  {activeShell.materialNote}
                </p>
              </div>
            </div>

            {/* Right Control Column: Waveform + Primary Hardware Actions */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span className="font-medium text-slate-700">
                    {activeShell.name} — Bholu Audio Core
                  </span>
                  <span className="font-mono tabular-nums text-[11px]">
                    {pirSensorEnabled ? 'PIR ON · 16k/24k PCM' : 'PIR OFF · Mic Muted'}
                  </span>
                </div>

                {/* Real-time Audio Waveform Canvas */}
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-3">
                  <AudioWaveform
                    status={status}
                    inputAnalyserRef={inputAnalyserRef}
                    outputAnalyserRef={outputAnalyserRef}
                  />
                  <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {status === 'sleeping' && sleepReason
                        ? `Sleeping: ${sleepReason}`
                        : statusInfo.helper}
                    </span>
                    {status === 'speaking' && (
                      <span className="inline-flex items-center gap-1 text-orange-700 font-medium whitespace-nowrap ml-2">
                        <Volume2 className="w-3.5 h-3.5" />
                        Live Voice
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Primary Interactive Controls */}
              <div className="space-y-3">
                {/* Sleep Mode Recovery Banner + Wake Toy Up Button */}
                {status === 'sleeping' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Moon className="w-4 h-4 text-slate-600 shrink-0" />
                      <div className="text-xs min-w-0">
                        <div className="font-semibold text-slate-900">
                          Sleeping • PIR Motion Sensor OFF
                        </div>
                        <div className="text-slate-500 truncate">
                          Microphone muted after parent shutdown command
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onWakeToyUp}
                      className="min-h-[38px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Wake Toy Up
                    </button>
                  </div>
                )}

                {/* Two Demo Trigger Buttons: Kid PIR & Adult/Parent Nearby */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onTriggerPirMotion}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100/90 active:scale-[0.99] text-amber-950 border border-amber-300/80 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer"
                  >
                    <Radio className="w-4 h-4 text-amber-700 shrink-0" />
                    Simulate Kid Nearby (PIR)
                  </button>

                  <button
                    type="button"
                    onClick={onTriggerAdultNearby}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 active:scale-[0.99] text-slate-900 border border-slate-300/80 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 text-slate-700 shrink-0" />
                    Simulate Adult / Parent Nearby
                  </button>
                </div>

                {/* Primary Live Voice Chat Toggle */}
                <button
                  type="button"
                  onClick={onToggleLiveVoice}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] whitespace-nowrap cursor-pointer ${
                    isConnected
                      ? 'bg-slate-900 hover:bg-slate-800 text-white'
                      : 'bg-teal-700 hover:bg-teal-800 text-white'
                  }`}
                >
                  {isConnected ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                      Stop Live Voice Chat
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 shrink-0" />
                      Start Live Voice Chat
                    </>
                  )}
                </button>

                {/* Secondary Active Mic Mute Control */}
                {isConnected && (
                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                    <span className="font-mono tabular-nums">
                      Voice: {voiceName} · {language === 'hindi' ? 'Simple Hindi' : 'Hinglish'} · Barge-in ready
                    </span>
                    <button
                      type="button"
                      onClick={onToggleMute}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {isMuted ? (
                        <>
                          <MicOff className="w-3.5 h-3.5 text-red-600" />
                          Mic Muted — Unmute
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5 text-teal-700" />
                          Mute Mic
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Scrolling Transcript (For Noisy Demo Rooms) */}
        <div className="border-t border-slate-200/80 bg-[#FAFBFD] px-6 py-4">
          <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
              <span className="font-semibold text-slate-800 whitespace-nowrap">
                Live Voice Transcript
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">
                {tutorState.active
                  ? `Language Tutor · ${tutorState.targetLanguage} · Round ${tutorState.round}/${tutorState.totalRounds}`
                  : isStoryMode
                    ? 'Long-Form Story Mode · Multi-minute narration'
                    : 'Demo-room caption monitor'}
              </span>
            </div>
            <div className="flex items-center gap-3.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowTutorPicker((v) => !v)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  tutorState.active || showTutorPicker
                    ? 'text-teal-800'
                    : 'text-teal-700 hover:text-teal-900'
                }`}
              >
                <Languages className="w-3.5 h-3.5" />
                Language Tutor
              </button>
              <button
                type="button"
                onClick={onStartLongStory}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-900 transition-colors whitespace-nowrap cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Tell a Full Story
              </button>
              {transcript.length > 0 && (
                <button
                  type="button"
                  onClick={onClearTranscript}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Clear log
                </button>
              )}
            </div>
          </div>

          {/* Inline Playful Language Tutor Picker (or Active 3-Round Progress Strip) */}
          {tutorState.active && (
            <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-teal-50/75 border border-teal-200/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0 text-xs">
                <Languages className="w-4 h-4 text-teal-700 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-teal-950">
                    Language Tutor · {tutorState.targetLanguage}
                  </span>
                  <span className="text-teal-700/70 mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-teal-800 truncate">{tutorState.topic}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5" aria-label={`Round ${tutorState.round} of ${tutorState.totalRounds}`}>
                  {[1, 2, 3].map((step) => (
                    <span
                      key={step}
                      className={`h-1.5 rounded-full transition-all ${
                        step <= tutorState.round
                          ? 'w-5 bg-teal-700'
                          : 'w-2.5 bg-teal-200'
                      }`}
                    />
                  ))}
                  <span className="ml-1 font-mono text-[11px] font-medium text-teal-900 tabular-nums">
                    R{tutorState.round}/{tutorState.totalRounds}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onEndLanguageTutor}
                  className="text-[11px] font-medium text-teal-800 hover:text-slate-900 underline underline-offset-2 cursor-pointer whitespace-nowrap"
                >
                  End Practice
                </button>
              </div>
            </div>
          )}

          {showTutorPicker && (
            <div className="mb-3 px-3.5 py-3 rounded-xl bg-white border border-slate-200/90">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-slate-700">
                  Pick a language for a quick 3-round screen-free practice game (or ask Bholu by voice):
                </span>
                <button
                  type="button"
                  onClick={() => setShowTutorPicker(false)}
                  aria-label="Close language picker"
                  className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {TUTOR_LANGUAGE_PRESETS.map((preset) => (
                  <button
                    key={preset.language}
                    type="button"
                    onClick={() => {
                      setShowTutorPicker(false);
                      onStartLanguageTutor(preset.language, preset.topic);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-teal-600/60 hover:bg-teal-50/50 text-xs font-medium text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {preset.language}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="h-44 overflow-y-auto space-y-2.5 pr-1">
            {transcript.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <p className="text-sm text-slate-600">
                  Click <span className="font-medium text-slate-900">Simulate Kid Nearby (PIR)</span> or{' '}
                  <span className="font-medium text-slate-900">Simulate Adult / Parent Nearby</span> to test live voice & voice-shutdown.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Live captions stream here automatically for noisy hackathon rooms.
                </p>
              </div>
            ) : (
              transcript.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex flex-col ${
                    entry.speaker === 'system'
                      ? 'items-center'
                      : entry.speaker === 'aarav' || entry.speaker === 'parent'
                        ? 'items-end'
                        : 'items-start'
                  }`}
                >
                  {entry.speaker === 'system' ? (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-1.5 text-center">
                      {entry.text}
                    </p>
                  ) : (
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
                        entry.speaker === 'aarav'
                          ? 'bg-teal-700 text-white'
                          : entry.speaker === 'parent'
                            ? 'bg-slate-800 text-white'
                            : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      <div
                        className={`flex items-center gap-2 text-[11px] mb-0.5 ${
                          entry.speaker === 'aarav'
                            ? 'text-teal-100'
                            : entry.speaker === 'parent'
                              ? 'text-slate-300'
                              : 'text-slate-400'
                        }`}
                      >
                        <span className="font-semibold">
                          {entry.speaker === 'aarav'
                            ? 'Aarav'
                            : entry.speaker === 'parent'
                              ? 'Parent / Adult'
                              : 'Bholu'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{entry.timestamp}</span>
                      </div>
                      <p>{entry.text}</p>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Discreet Text Fallback Input when Live Session is Active */}
          {isConnected && (
            <form onSubmit={handleTextSend} className="mt-3 pt-3 border-t border-slate-200/70 flex gap-2">
              <input
                type="text"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                placeholder="Try 'Teach me English speaking', 'I met Rohan in class', or 'Nahi sojao tum'..."
                className="flex-1 min-h-[40px] px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/25 focus:border-teal-600"
              />
              <button
                type="submit"
                disabled={!textDraft.trim()}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Editable Cross-Relocation Memory Card */}
      <section
        id="memory-bank"
        className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Live Cross-Relocation Memory
              </h2>
              {memorySyncNote && (
                <span className="text-xs font-medium text-teal-700">
                  · {memorySyncNote}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Bholu silently remembers new friends, school details, and hobbies mid-conversation with zero interruption
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingMemory((v) => !v)}
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 hover:border-teal-600/50 hover:bg-teal-50/40 text-slate-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-teal-700" />
            Add Memory
          </button>
        </div>

        <div className="p-6">
          {isAddingMemory && (
            <form
              onSubmit={handleAddMemorySubmit}
              className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
            >
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                  className="w-full min-h-[40px] px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/25 focus:border-teal-600"
                >
                  <option value="Friend">Friend</option>
                  <option value="School">School</option>
                  <option value="Personal_Memory">Personal Memory</option>
                  <option value="Preference">Preference</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Memory Key
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. New Friend"
                  className="w-full min-h-[40px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/25 focus:border-teal-600"
                  autoFocus
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Detail
                </label>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="e.g. Rohan (Class 4)"
                  className="w-full min-h-[40px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/25 focus:border-teal-600"
                />
              </div>
              <div className="sm:col-span-3 flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingMemory(false)}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {memories.map((item) => {
              const isEditing = editingId === item.id;
              const isJustCaptured = recentlyCapturedIds.has(item.id);
              const categoryDisplay = item.category.replace('_', ' ');

              return (
                <div
                  key={item.id}
                  className={`group rounded-xl border px-4 py-3 transition-all duration-700 ${
                    isJustCaptured
                      ? 'animate-memory-fade-in border-teal-500/70 bg-teal-50/55 shadow-[0_0_0_3px_rgba(13,148,136,0.12)]'
                      : 'border-slate-200/80 bg-[#FAFBFD] hover:border-slate-300'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md focus:outline-none focus:border-teal-600"
                      />
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-teal-600"
                      />
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-700 text-white text-xs font-medium cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          Update
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-medium truncate">{item.label}</span>
                          <span aria-hidden="true">·</span>
                          <span className={item.source === 'ai' ? 'text-teal-700 font-medium' : 'text-slate-400'}>
                            {item.source === 'ai'
                              ? `${categoryDisplay} · Learned live`
                              : categoryDisplay}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 mt-0.5 break-words">
                          {item.value}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          aria-label={`Edit ${item.label}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMemory(item.id)}
                          aria-label={`Remove ${item.label}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
