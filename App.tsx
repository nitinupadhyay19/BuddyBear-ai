import { useCallback, useEffect, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { ParentCompanionPhone } from './components/ParentCompanionPhone';
import { ToyHardwarePanel } from './components/ToyHardwarePanel';
import { useBuddyBearLive } from './hooks/useBuddyBearLive';
import type {
  MemoryCategory,
  MemoryItem,
  ToyLanguageMode,
  ToyShellId,
  ToyVoiceName,
} from './types';

const INITIAL_MEMORIES: MemoryItem[] = [
  {
    id: 'moved-from',
    category: 'Personal_Memory',
    label: 'Moved From',
    value: 'Kota Railway Colony',
    source: 'preset',
  },
  {
    id: 'current-city',
    category: 'Personal_Memory',
    label: 'Current City',
    value: 'Jaipur Railway Colony',
    source: 'preset',
  },
  {
    id: 'old-best-friend',
    category: 'Friend',
    label: 'Old Best Friend',
    value: 'Kabir',
    source: 'preset',
  },
  {
    id: 'favorite-game',
    category: 'Preference',
    label: 'Favorite Game',
    value: 'Gully Cricket',
    source: 'preset',
  },
];

export default function App() {
  const [shell, setShell] = useState<ToyShellId>('bear');
  const [voiceName, setVoiceName] = useState<ToyVoiceName>('Puck');
  const [language, setLanguage] = useState<ToyLanguageMode>('hinglish');
  const [memories, setMemories] = useState<MemoryItem[]>(INITIAL_MEMORIES);
  const [recentlyCapturedIds, setRecentlyCapturedIds] = useState<Set<string>>(() => new Set());

  // Hydrate live backend memory state on load
  useEffect(() => {
    let active = true;
    fetch('/api/memories')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { memories?: MemoryItem[] } | null) => {
        if (active && Array.isArray(data?.memories) && data.memories.length > 0) {
          setMemories(data.memories);
        }
      })
      .catch(() => {
        // Keep initial pre-seeded memories cleanly on fallback
      });
    return () => {
      active = false;
    };
  }, []);

  const persistMemoriesToServer = useCallback((next: MemoryItem[]) => {
    fetch('/api/memories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories: next }),
    }).catch(() => {});
  }, []);

  const handleSilentMemoryCaptured = useCallback(
    (captured: MemoryItem, allMemories: MemoryItem[]) => {
      setMemories(allMemories);
      setRecentlyCapturedIds((prev) => {
        const next = new Set(prev);
        next.add(captured.id);
        return next;
      });
      // Soft highlight gently fades back to neutral after 6 seconds (zero sound, zero modal)
      window.setTimeout(() => {
        setRecentlyCapturedIds((prev) => {
          if (!prev.has(captured.id)) return prev;
          const next = new Set(prev);
          next.delete(captured.id);
          return next;
        });
      }, 6000);
    },
    []
  );

  const live = useBuddyBearLive({
    memories,
    shell,
    voiceName,
    language,
    onMemoryCaptured: handleSilentMemoryCaptured,
  });

  const handleLanguageChange = (nextLang: ToyLanguageMode) => {
    setLanguage(nextLang);
    live.syncLanguageToLive(nextLang);
  };

  const handleAddMemory = (category: MemoryCategory, label: string, value: string) => {
    const newItem: MemoryItem = {
      id: `mem-${Date.now()}`,
      category,
      label,
      value,
      source: 'manual',
    };
    const next = [...memories, newItem];
    setMemories(next);
    persistMemoriesToServer(next);
    live.syncMemoryToLive(next, newItem);
  };

  const handleUpdateMemory = (id: string, label: string, value: string) => {
    const existing = memories.find((m) => m.id === id);
    const updatedItem: MemoryItem = {
      id,
      category: existing?.category ?? 'Personal_Memory',
      label,
      value,
      source: existing?.source ?? 'manual',
    };
    const next = memories.map((m) => (m.id === id ? updatedItem : m));
    setMemories(next);
    persistMemoriesToServer(next);
    live.syncMemoryToLive(next, updatedItem);
  };

  const handleDeleteMemory = (id: string) => {
    const next = memories.filter((m) => m.id !== id);
    setMemories(next);
    persistMemoriesToServer(next);
    live.syncMemoryToLive(next);
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-slate-900 flex flex-col">
      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#toy-simulator"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            BuddyBear AI
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a
              href="#toy-simulator"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Toy Simulator
            </a>
            <a
              href="#memory-bank"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Relocation Memory
            </a>
            <a
              href="#parent-app"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Parent Companion
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={live.toggleLiveVoice}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                live.isConnected
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-teal-700 hover:bg-teal-800 text-white'
              }`}
            >
              {live.isConnected ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  End Live Voice
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  Start Live Voice
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Demo Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-7">
        {/* Concise Context Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              Screen-Free Relocation Companion
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Aarav (Age 9) · Kota Railway Colony to Jaipur Railway Colony · Real-time voice companion “Bholu”
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
            {live.status === 'sleeping'
              ? 'Sleeping · PIR Sensor OFF'
              : live.isConnected
                ? 'Live WebSocket · Active'
                : 'Active · PIR Sensor ON'}
          </div>
        </div>

        {/* Two-Panel Split-Screen Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT PANEL — The Toy Hardware Simulator */}
          <div className="lg:col-span-7 xl:col-span-8">
            <ToyHardwarePanel
              shell={shell}
              onShellChange={setShell}
              voiceName={voiceName}
              onVoiceChange={setVoiceName}
              language={language}
              onLanguageChange={handleLanguageChange}
              moodPulse={live.moodPulse}
              status={live.status}
              pirSensorEnabled={live.pirSensorEnabled}
              sleepReason={live.sleepReason}
              isConnected={live.isConnected}
              isStoryMode={live.isStoryMode}
              tutorState={live.tutorState}
              isMuted={live.isMuted}
              onToggleMute={() => live.setIsMuted((m) => !m)}
              errorMessage={live.errorMessage}
              onDismissError={() => live.setErrorMessage(null)}
              transcript={live.transcript}
              onClearTranscript={live.clearTranscript}
              onToggleLiveVoice={live.toggleLiveVoice}
              onTriggerPirMotion={live.triggerPirMotion}
              onTriggerAdultNearby={live.triggerAdultNearby}
              onWakeToyUp={live.wakeToyUp}
              onStartLongStory={() => live.startLongStory()}
              onStartLanguageTutor={live.startLanguageTutor}
              onEndLanguageTutor={live.endLanguageTutor}
              onSendTextFallback={live.sendTextFallback}
              memories={memories}
              recentlyCapturedIds={recentlyCapturedIds}
              onAddMemory={handleAddMemory}
              onUpdateMemory={handleUpdateMemory}
              onDeleteMemory={handleDeleteMemory}
              memorySyncNote={live.memorySyncNote}
              inputAnalyserRef={live.inputAnalyserRef}
              outputAnalyserRef={live.outputAnalyserRef}
            />
          </div>

          {/* RIGHT PANEL — Parent Companion Mobile App Preview */}
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24">
            <ParentCompanionPhone
              moodPulse={live.moodPulse}
              memoryTimeline={live.memoryTimeline}
              isAnalyzingMood={live.isAnalyzingMood}
              sessionSeconds={live.sessionSeconds}
              deviceStatus={live.status}
              pirSensorEnabled={live.pirSensorEnabled}
              sleepReason={live.sleepReason}
              lastPresence={live.lastPresence}
              tutorState={live.tutorState}
              onWakeToyUp={live.wakeToyUp}
              shell={shell}
              pirTriggeredCount={live.pirTriggeredCount}
              memoryCount={memories.length}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
