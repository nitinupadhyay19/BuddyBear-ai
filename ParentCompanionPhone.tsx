import { useMemo, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Clock,
  HeartHandshake,
  History,
  Lock,
  Moon,
  Power,
  Radio,
  ShieldCheck,
  Smile,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  LanguageTutorState,
  MemoryTimelineEvent,
  MoodPulse,
  ToyDeviceStatus,
  ToyShellId,
} from '../types';

type PhoneTab = 'overview' | 'timeline' | 'insights' | 'privacy';

interface ParentCompanionPhoneProps {
  moodPulse: MoodPulse;
  memoryTimeline: MemoryTimelineEvent[];
  isAnalyzingMood: boolean;
  sessionSeconds: number;
  deviceStatus: ToyDeviceStatus;
  pirSensorEnabled: boolean;
  sleepReason: string | null;
  lastPresence: 'none' | 'kid' | 'adult';
  tutorState: LanguageTutorState;
  onWakeToyUp: () => void;
  shell: ToyShellId;
  pirTriggeredCount: number;
  memoryCount: number;
}

interface MoodDayPoint {
  day: string;
  score: number;
  mood: string;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const PRIOR_SIX_DAYS: Array<{ score: number; mood: string }> = [
  { score: 58, mood: 'Missing Kota · Gentle' },
  { score: 63, mood: 'Quiet · Curious' },
  { score: 68, mood: 'Opening Up · Playful' },
  { score: 72, mood: 'Warm · Storytime' },
  { score: 76, mood: 'Settling In · Calm' },
  { score: 81, mood: 'Cheerful · Making Friends' },
];

const BASELINE_PLAY_SECONDS = 18 * 60; // 18m already played earlier today
const DAILY_GOAL_MINUTES = 45;

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function formatClockOnly(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const TIMELINE_NODE_STYLES: Record<
  MemoryTimelineEvent['tone'],
  { dot: string; label: string; toneText: string }
> = {
  positive: {
    dot: 'bg-amber-400 ring-amber-100',
    label: 'Joyful recall',
    toneText: 'text-amber-700',
  },
  playful: {
    dot: 'bg-orange-500 ring-orange-100',
    label: 'Playful bridge',
    toneText: 'text-orange-700',
  },
  tender: {
    dot: 'bg-purple-500 ring-purple-100',
    label: 'Processing move',
    toneText: 'text-purple-700',
  },
  calm: {
    dot: 'bg-sky-500 ring-sky-100',
    label: 'Calm reflection',
    toneText: 'text-sky-700',
  },
};

export function ParentCompanionPhone({
  moodPulse,
  memoryTimeline,
  isAnalyzingMood,
  sessionSeconds,
  deviceStatus,
  pirSensorEnabled,
  sleepReason,
  lastPresence,
  tutorState,
  onWakeToyUp,
  shell,
  pirTriggeredCount,
  memoryCount,
}: ParentCompanionPhoneProps) {
  const [activeTab, setActiveTab] = useState<PhoneTab>('overview');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'live'>('all');
  const [bedtimeQuietMode, setBedtimeQuietMode] = useState(true);

  const isSleeping = deviceStatus === 'sleeping' || !pirSensorEnabled;

  const sevenDayMoodData = useMemo<MoodDayPoint[]>(() => {
    const todayIndex = new Date().getDay();
    const prior = PRIOR_SIX_DAYS.map((entry, idx) => {
      const offset = 6 - idx;
      const dayIdx = (todayIndex - offset + 7) % 7;
      return {
        day: WEEKDAY_SHORT[dayIdx],
        score: entry.score,
        mood: entry.mood,
      };
    });
    return [
      ...prior,
      {
        day: 'Today',
        score: moodPulse.comfortScore,
        mood: moodPulse.moodLabel,
      },
    ];
  }, [moodPulse.comfortScore, moodPulse.moodLabel]);

  const weeklyDelta = sevenDayMoodData[6].score - sevenDayMoodData[0].score;

  const liveMemoryCount = memoryTimeline.filter((e) => e.source === 'live').length;
  const visibleTimeline =
    timelineFilter === 'live'
      ? memoryTimeline.filter((e) => e.source === 'live')
      : memoryTimeline;
  const latestMemoryEvent = memoryTimeline[0];

  const totalPlaySeconds = BASELINE_PLAY_SECONDS + sessionSeconds;
  const totalMinutes = totalPlaySeconds / 60;
  const goalProgress = Math.min(1, totalMinutes / DAILY_GOAL_MINUTES);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - goalProgress);

  const isMicOpen =
    deviceStatus === 'listening' ||
    deviceStatus === 'speaking' ||
    deviceStatus === 'motion';

  const toneAccent =
    moodPulse.sentimentTone === 'positive'
      ? 'text-amber-700'
      : moodPulse.sentimentTone === 'playful'
        ? 'text-orange-700'
        : moodPulse.sentimentTone === 'tender'
          ? 'text-purple-700'
          : 'text-sky-700';

  const toneBar =
    moodPulse.sentimentTone === 'positive'
      ? 'bg-amber-400'
      : moodPulse.sentimentTone === 'playful'
        ? 'bg-orange-500'
        : moodPulse.sentimentTone === 'tender'
          ? 'bg-purple-500'
          : 'bg-sky-500';

  return (
    <aside id="parent-app" className="flex flex-col items-center">
      <div className="w-full max-w-[392px]">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Parent Companion Preview
          </h2>
          <span className="text-xs text-slate-500">Zero raw transcripts shared</span>
        </div>

        {/* Sleek Mobile Hardware Frame */}
        <div className="rounded-[40px] bg-[#181C24] p-[11px] shadow-[0_24px_48px_-16px_rgba(15,23,42,0.22)]">
          <div className="rounded-[30px] bg-[#F7F8FA] overflow-hidden flex flex-col min-h-[690px]">
            {/* Mobile Status Bar */}
            <div className="bg-white px-6 pt-3 pb-2 flex items-center justify-between text-[11px] font-mono font-medium text-slate-700 tabular-nums">
              <span>4:25 PM</span>
              <div className="w-20 h-4 rounded-full bg-[#181C24]" aria-hidden="true" />
              <span>5G · 94%</span>
            </div>

            {/* Mobile Top App Bar */}
            <div className="bg-white px-5 pb-3.5 pt-1 border-b border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-teal-700 text-white font-display font-semibold text-sm flex items-center justify-center shrink-0">
                  A
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    Aarav’s Room
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {shell === 'bear' ? 'Plush Bear Shell' : 'Toy Car Shell'} · Jaipur Colony
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={`text-[11px] font-semibold ${
                    isSleeping
                      ? 'text-slate-500'
                      : isMicOpen
                        ? 'text-teal-700'
                        : 'text-slate-600'
                  }`}
                >
                  {isSleeping
                    ? 'Sleeping · OFF'
                    : isMicOpen
                      ? 'Active · PIR ON'
                      : 'Standby · PIR ON'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                  {memoryCount} memories
                </div>
              </div>
            </div>

            {/* Scrollable Mobile Content Area */}
            <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
              {activeTab === 'overview' && (
                <>
                  {/* 0. PIR Motion Sensor & Power State (Syncs Live on Parent Voice-Shutdown) */}
                  <div
                    className={`rounded-2xl border p-4 transition-colors duration-300 ${
                      isSleeping
                        ? 'bg-slate-900 border-slate-800 text-white'
                        : 'bg-white border-slate-200/85 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`text-xs font-semibold ${
                          isSleeping ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        PIR Motion Sensor & Power State
                      </span>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          isSleeping ? 'text-amber-300' : 'text-teal-700'
                        }`}
                      >
                        {isSleeping ? 'OFF' : 'ON'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isSleeping
                              ? 'bg-slate-800 text-slate-200'
                              : 'bg-teal-50 text-teal-700'
                          }`}
                        >
                          {isSleeping ? (
                            <Moon className="w-4 h-4" />
                          ) : (
                            <Radio className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {isSleeping
                              ? 'Sleeping • PIR Sensor OFF'
                              : isMicOpen
                                ? `Active · ${lastPresence === 'adult' ? 'Adult Nearby' : 'Child Active'}`
                                : 'Active · PIR Sensor Armed'}
                          </div>
                          <div
                            className={`text-[11px] truncate mt-0.5 ${
                              isSleeping ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {isSleeping
                              ? sleepReason || 'Paused by parent voice command'
                              : isMicOpen
                                ? 'Mic gate open · Live voice session'
                                : 'Mic closed until motion detected'}
                          </div>
                        </div>
                      </div>

                      {isSleeping && (
                        <button
                          type="button"
                          onClick={onWakeToyUp}
                          className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Power className="w-3 h-3" />
                          Wake
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 1. Today's Emotional Mood Pulse */}
                  <div className="bg-white rounded-2xl border border-slate-200/85 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-500">
                        Today’s Emotional Mood Pulse
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {isAnalyzingMood ? 'Updating…' : moodPulse.updatedAt}
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Smile className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-display text-base font-semibold leading-snug ${toneAccent}`}>
                          {moodPulse.moodLabel}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed mt-1.5">
                          {moodPulse.summary}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3.5 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-slate-500 truncate pr-2">
                          Focus ·{' '}
                          <span className="text-slate-800 font-medium">
                            {tutorState.active
                              ? `Language Tutor (${tutorState.targetLanguage})`
                              : moodPulse.playTheme}
                          </span>
                        </span>
                        <span className="font-mono font-semibold text-slate-800 tabular-nums shrink-0">
                          {moodPulse.comfortScore}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${toneBar}`}
                          style={{ width: `${moodPulse.comfortScore}%` }}
                        />
                      </div>

                      {/* 7-Day Emotional Mood Pulse Line Chart (Recharts) */}
                      <div className="mt-3.5 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="font-medium text-slate-600">
                            7-Day Mood Pulse
                          </span>
                          <span className="font-mono text-[10px] font-semibold text-teal-700 tabular-nums">
                            {weeklyDelta >= 0 ? `+${weeklyDelta}%` : `${weeklyDelta}%`} vs 6d ago
                          </span>
                        </div>
                        <div className="h-[108px] w-full min-w-0" aria-label="7-day Emotional Mood Pulse line chart">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={108}>
                            <LineChart
                              data={sevenDayMoodData}
                              margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                            >
                              <CartesianGrid
                                stroke="#E2E8F0"
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="day"
                                tick={{ fontSize: 10, fill: '#64748B' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                domain={[40, 100]}
                                ticks={[40, 70, 100]}
                                tick={{ fontSize: 9, fill: '#94A3B8' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }}
                                content={({ active, payload }) => {
                                  if (!active || !payload || !payload.length) return null;
                                  const point = payload[0].payload as MoodDayPoint;
                                  return (
                                    <div className="rounded-lg bg-slate-900 text-white px-2.5 py-1.5 text-[10px] shadow-md">
                                      <div className="font-semibold">
                                        {point.day} · {point.score}%
                                      </div>
                                      <div className="text-slate-300 mt-0.5">{point.mood}</div>
                                    </div>
                                  );
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="score"
                                stroke="#0F766E"
                                strokeWidth={2.25}
                                dot={{
                                  r: 3,
                                  fill: '#FFFFFF',
                                  stroke: '#0F766E',
                                  strokeWidth: 2,
                                }}
                                activeDot={{
                                  r: 4.5,
                                  fill: '#0F766E',
                                  stroke: '#CCFBF1',
                                  strokeWidth: 3,
                                }}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400 mt-2">
                        Summarized privately without revealing Aarav’s verbatim voice logs.
                      </p>
                    </div>
                  </div>

                  {/* 2. Screen-Free Playtime Tracker */}
                  <div className="bg-white rounded-2xl border border-slate-200/85 p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-semibold text-slate-500">
                        Screen-Free Playtime Counter
                      </span>
                      <span className="text-[11px] font-mono text-teal-700 font-medium tabular-nums">
                        {isMicOpen ? 'Live timer' : 'Paused'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Circular Progress Ring */}
                      <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 68 68">
                          <circle
                            cx="34"
                            cy="34"
                            r={radius}
                            fill="none"
                            stroke="#E2E8F0"
                            strokeWidth="5"
                          />
                          <circle
                            cx="34"
                            cy="34"
                            r={radius}
                            fill="none"
                            stroke="#0F766E"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-500"
                          />
                        </svg>
                        <span className="absolute font-mono text-[11px] font-semibold text-slate-800 tabular-nums">
                          {Math.round(goalProgress * 100)}%
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums tracking-tight">
                          {formatDuration(totalPlaySeconds)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                          <span>Goal {DAILY_GOAL_MINUTES}m</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-slate-700">
                            Session {formatClockOnly(sessionSeconds)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2.5 Relocation Memory Timeline Teaser */}
                  {latestMemoryEvent && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('timeline')}
                      className="w-full text-left bg-white hover:bg-slate-50/70 rounded-2xl border border-slate-200/85 p-4 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-500">
                          Memory Processing Timeline
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-teal-700">
                          {liveMemoryCount > 0 ? `${liveMemoryCount} live` : `${memoryTimeline.length} today`}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 w-2.5 h-2.5 rounded-full ring-4 shrink-0 ${
                            TIMELINE_NODE_STYLES[latestMemoryEvent.tone].dot
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {latestMemoryEvent.memoryLabel} · {latestMemoryEvent.memoryValue}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
                              {latestMemoryEvent.timestamp}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {latestMemoryEvent.processingNote}
                          </p>
                        </div>
                      </div>
                    </button>
                  )}

                  {/* 3. Child Safety & Privacy Status */}
                  <div className="bg-white rounded-2xl border border-slate-200/85 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        Privacy & Safety Status
                      </span>
                      <span className="text-[11px] font-medium text-teal-700">Verified</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                          <Radio className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900">
                            PIR Motion-Gated Mic
                          </div>
                          <div className="text-[11px] text-slate-500">
                            No 24/7 Recording · {isSleeping ? 'Sensor OFF' : isMicOpen ? 'Gate Open' : 'Hardware Closed'}
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900">
                            Zero Raw Audio Stored
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Ephemeral stream · Deleted after turn
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900">
                            Parent Voice-Shutdown Enabled
                          </div>
                          <div className="text-[11px] text-slate-500">
                            English & Hindi commands (“Nahi sojao tum”)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200/85 p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          Relocation Memory Timeline
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Moments Bholu helped Aarav process the move
                        </div>
                      </div>
                    </div>

                    {/* Interactive Filter Toggle */}
                    <div className="mt-2.5 flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTimelineFilter('all')}
                        className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                          timelineFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All Today ({memoryTimeline.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimelineFilter('live')}
                        className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                          timelineFilter === 'live'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Live Session ({liveMemoryCount})
                      </button>
                    </div>
                  </div>

                  {/* Vertical Timeline Track */}
                  <div className="bg-white rounded-2xl border border-slate-200/85 p-4">
                    {visibleTimeline.length === 0 ? (
                      <div className="py-8 text-center px-3">
                        <History className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-medium text-slate-700">
                          No live memory triggers yet
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          When Aarav mentions a new friend like Rohan, Kota, Kabir, Jaipur, or any school detail during voice chat, it logs here silently.
                        </p>
                      </div>
                    ) : (
                      <ol className="relative space-y-5 before:content-[''] before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                        {visibleTimeline.map((item) => {
                          const node = TIMELINE_NODE_STYLES[item.tone];
                          return (
                            <li key={item.id} className="relative pl-6">
                              <span
                                aria-hidden="true"
                                className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ${node.dot}`}
                              />
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className={`font-semibold ${node.toneText}`}>
                                  {node.label}
                                  {item.source === 'live' ? ' · Live' : ' · Earlier'}
                                </span>
                                <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
                                  {item.timestamp}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-slate-900 mt-0.5">
                                {item.memoryLabel} — {item.memoryValue}
                              </div>
                              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                                {item.processingNote}
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    )}

                    <p className="text-[10px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
                      Only high-level memory themes are logged—verbatim private conversations stay inside the room.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'insights' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200/85 p-4">
                    <div className="text-xs font-semibold text-slate-500 mb-1">
                      Kota → Jaipur Relocation Rhythm
                    </div>
                    <div className="font-display text-base font-semibold text-slate-900">
                      Day 11 in Jaipur Railway Colony
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Aarav’s after-school comfort score has steadily risen as Bholu connects familiar Kota memories of Kabir with new Jaipur school friendships and games.
                    </p>

                    {/* 7-Day Emotional Mood Pulse Trend (Recharts) */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[11px] mb-2">
                        <span className="font-medium text-slate-600">
                          Emotional Mood Pulse · Last 7 Days
                        </span>
                        <span className="font-mono font-semibold text-teal-700 tabular-nums">
                          {moodPulse.comfortScore}% today
                        </span>
                      </div>
                      <div className="h-[148px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={148}>
                          <LineChart
                            data={sevenDayMoodData}
                            margin={{ top: 8, right: 10, left: -22, bottom: 0 }}
                          >
                            <CartesianGrid
                              stroke="#E2E8F0"
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="day"
                              tick={{ fontSize: 10, fill: '#64748B' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              domain={[40, 100]}
                              ticks={[40, 60, 80, 100]}
                              tick={{ fontSize: 10, fill: '#94A3B8' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }}
                              content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const point = payload[0].payload as MoodDayPoint;
                                return (
                                  <div className="rounded-lg bg-slate-900 text-white px-2.5 py-1.5 text-[10px] shadow-md">
                                    <div className="font-semibold">
                                      {point.day} · {point.score}%
                                    </div>
                                    <div className="text-slate-300 mt-0.5">{point.mood}</div>
                                  </div>
                                );
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="#0F766E"
                              strokeWidth={2.5}
                              dot={{
                                r: 3.5,
                                fill: '#FFFFFF',
                                stroke: '#0F766E',
                                strokeWidth: 2,
                              }}
                              activeDot={{
                                r: 5,
                                fill: '#0F766E',
                                stroke: '#CCFBF1',
                                strokeWidth: 3,
                              }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/85 p-4 space-y-3">
                    <div className="text-xs font-semibold text-slate-500">
                      Session Activity Summary
                    </div>
                    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                      <span className="text-slate-600">PIR Wake Events Today</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {2 + pirTriggeredCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                      <span className="text-slate-600">Screen-Free Play Total</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatDuration(totalPlaySeconds)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-600">Active Play Focus</span>
                      <span className="font-medium text-teal-700">
                        {tutorState.active
                          ? `Language Tutor · ${tutorState.targetLanguage}`
                          : moodPulse.playTheme}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'privacy' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200/85 p-4">
                    <div className="flex items-center gap-2 text-teal-700 mb-2">
                      <HeartHandshake className="w-4 h-4" />
                      <span className="text-xs font-semibold">Trust-First Family Architecture</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      BuddyBear AI gives parents emotional visibility without turning a child’s bedroom toy into a surveillance device.
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/85 divide-y divide-slate-100">
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          Bedtime Quiet Hours (9:00 PM)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Hardware PIR sensor auto-sleeps at night
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={bedtimeQuietMode}
                        onClick={() => setBedtimeQuietMode((v) => !v)}
                        className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                          bedtimeQuietMode ? 'bg-teal-700' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                            bedtimeQuietMode ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="p-4">
                      <div className="text-xs font-semibold text-slate-900">
                        Audio Retention Policy
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        0 seconds saved · Raw PCM buffers exist only in volatile RAM during live speech
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="text-xs font-semibold text-slate-900">
                        Hardware Mic Gate Status
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {isMicOpen
                          ? 'Active — opened by PIR / session trigger'
                          : 'Closed — physically disconnected in standby'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Bottom Tab Bar */}
            <div className="bg-white border-t border-slate-200/85 px-2 py-2 grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
                  activeTab === 'overview'
                    ? 'text-teal-700 bg-teal-50/70'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Overview</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
                  activeTab === 'timeline'
                    ? 'text-teal-700 bg-teal-50/70'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <History className="w-4 h-4" />
                <span>Timeline</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('insights')}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
                  activeTab === 'insights'
                    ? 'text-teal-700 bg-teal-50/70'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Insights</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('privacy')}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
                  activeTab === 'privacy'
                    ? 'text-teal-700 bg-teal-50/70'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Privacy</span>
              </button>
            </div>

            {/* Home Indicator */}
            <div className="bg-white pb-2 pt-0.5 flex justify-center">
              <div className="w-28 h-1 rounded-full bg-slate-300" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
