import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LanguageTutorState,
  MemoryItem,
  MemoryTimelineEvent,
  MoodPulse,
  ServerToClientMessage,
  ToyDeviceStatus,
  ToyLanguageMode,
  ToyShellId,
  ToyVoiceName,
  TranscriptEntry,
} from '../types';
import {
  base64Pcm24kToAudioBuffer,
  downsampleTo16kHz,
  float32ToBase64Pcm16,
} from '../utils/audioPcm';

interface UseBuddyBearLiveOptions {
  memories: MemoryItem[];
  shell: ToyShellId;
  voiceName: ToyVoiceName;
  language: ToyLanguageMode;
  onMemoryCaptured?: (memory: MemoryItem, allMemories: MemoryItem[]) => void;
}

const INITIAL_MOOD: MoodPulse = {
  moodLabel: 'Settling In · Ready to Play',
  sentimentTone: 'calm',
  summary:
    'Aarav’s room companion is on standby with motion-gated listening. Trigger PIR motion or start a live voice chat to see real-time emotional insights.',
  playTheme: 'Waiting for After-School Play',
  comfortScore: 84,
  updatedAt: 'Ready',
};

const INITIAL_MEMORY_TIMELINE: MemoryTimelineEvent[] = [
  {
    id: 'seed-mem-2',
    memoryId: 'favorite-game',
    memoryLabel: 'Favorite Game',
    memoryValue: 'Gully Cricket',
    timestamp: '4:05 PM',
    processingNote:
      'Bholu used Aarav’s love for gully cricket to kick off a fun screen-free game in his new Jaipur bedroom.',
    tone: 'playful',
    source: 'earlier',
  },
  {
    id: 'seed-mem-1',
    memoryId: 'moved-from',
    memoryLabel: 'Moved From',
    memoryValue: 'Kota Railway Colony',
    timestamp: '3:40 PM',
    processingNote:
      'Aarav warmly remembered playing with Kabir back in Kota Railway Colony before settling into after-school chat.',
    tone: 'tender',
    source: 'earlier',
  },
];

function formatTimeNow(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function useBuddyBearLive({
  memories,
  shell,
  voiceName,
  language,
  onMemoryCaptured,
}: UseBuddyBearLiveOptions) {
  const [status, setStatus] = useState<ToyDeviceStatus>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [moodPulse, setMoodPulse] = useState<MoodPulse>(INITIAL_MOOD);
  const [memoryTimeline, setMemoryTimeline] = useState<MemoryTimelineEvent[]>(
    INITIAL_MEMORY_TIMELINE
  );
  const [isAnalyzingMood, setIsAnalyzingMood] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [memorySyncNote, setMemorySyncNote] = useState<string | null>(null);
  const [pirTriggeredCount, setPirTriggeredCount] = useState(0);
  const [isStoryMode, setIsStoryMode] = useState(false);
  const [tutorState, setTutorState] = useState<LanguageTutorState>({
    active: false,
    targetLanguage: 'English',
    topic: 'Everyday Speaking',
    round: 1,
    totalRounds: 3,
  });
  const [pirSensorEnabled, setPirSensorEnabled] = useState(true);
  const [sleepReason, setSleepReason] = useState<string | null>(null);
  const [lastPresence, setLastPresence] = useState<'none' | 'kid' | 'adult'>('none');

  const wsRef = useRef<WebSocket | null>(null);
  const tutorActiveRef = useRef(false);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  const isMutedRef = useRef(false);
  const isConnectedRef = useRef(false);
  const isSleepingRef = useRef(false);
  const lastPresenceRef = useRef<'none' | 'kid' | 'adult'>('none');
  const memoriesRef = useRef(memories);
  const languageRef = useRef<ToyLanguageMode>(language);
  const onMemoryCapturedRef = useRef(onMemoryCaptured);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const lastAnalyzedCountRef = useRef(0);
  const motionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    lastPresenceRef.current = lastPresence;
  }, [lastPresence]);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    onMemoryCapturedRef.current = onMemoryCaptured;
  }, [onMemoryCaptured]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Live Screen-Free Playtime Timer (ticks while session is active)
  useEffect(() => {
    if (!isConnected) return;
    const timer = window.setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isConnected]);

  const stopAllPlayback = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const appendOrUpdateTranscript = useCallback(
    (speaker: 'aarav' | 'parent' | 'bholu' | 'system', chunkText: string) => {
      const cleaned = chunkText;
      if (!cleaned) return;

      setTranscript((prev) => {
        if (speaker === 'system') {
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              speaker,
              text: cleaned.trim(),
              timestamp: formatTimeNow(),
            },
          ];
        }

        const last = prev[prev.length - 1];
        if (last && last.speaker === speaker && last.isPartial) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            text: last.text + cleaned,
          };
          return updated;
        }

        const next = prev.map((entry) =>
          entry.isPartial ? { ...entry, isPartial: false } : entry
        );
        return [
          ...next,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            speaker,
            text: cleaned.trimStart(),
            timestamp: formatTimeNow(),
            isPartial: true,
          },
        ];
      });
    },
    []
  );

  const finalizePartialTranscripts = useCallback(() => {
    setTranscript((prev) =>
      prev.map((entry) => (entry.isPartial ? { ...entry, isPartial: false } : entry))
    );
  }, []);

  const refreshMoodPulse = useCallback(async () => {
    const entries = transcriptRef.current.filter((e) => e.speaker !== 'system');
    if (entries.length === 0 || entries.length === lastAnalyzedCountRef.current) {
      return;
    }
    lastAnalyzedCountRef.current = entries.length;
    setIsAnalyzingMood(true);

    try {
      const res = await fetch('/api/mood-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: entries.map((e) => ({ speaker: e.speaker, text: e.text })),
          memories: memoriesRef.current,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as MoodPulse;
      if (data && data.moodLabel) {
        setMoodPulse(data);

        const nowLabel = data.updatedAt || formatTimeNow();
        const latestWindowText = entries
          .slice(-2)
          .map((e) => e.text)
          .join(' ')
          .toLowerCase();

        // Combine AI-detected memory triggers with direct substring checks for newly added custom memories
        const combinedTriggers = new Map<string, MemoryTimelineEvent>();

        for (const tm of data.triggeredMemories ?? []) {
          const key = `${tm.memoryId}::${tm.memoryValue.toLowerCase()}`;
          combinedTriggers.set(key, {
            id: `live-mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            memoryId: tm.memoryId,
            memoryLabel: tm.memoryLabel,
            memoryValue: tm.memoryValue,
            timestamp: nowLabel,
            processingNote: tm.processingNote,
            tone: tm.tone,
            source: 'live',
          });
        }

        for (const mem of memoriesRef.current) {
          const key = `${mem.id}::${mem.value.toLowerCase()}`;
          if (combinedTriggers.has(key)) continue;

          const tokens = mem.value
            .toLowerCase()
            .split(/[\s,&/]+/)
            .filter(
              (tok) =>
                tok.length >= 3 &&
                ![
                  'and',
                  'the',
                  'city',
                  'colony',
                  'game',
                  'railway',
                  'bhaiya',
                  'bhiya',
                  'badi',
                  'chota',
                ].includes(tok)
            );

          const matched = tokens.some((tok) => latestWindowText.includes(tok));
          if (matched) {
            combinedTriggers.set(key, {
              id: `live-mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              memoryId: mem.id,
              memoryLabel: mem.label,
              memoryValue: mem.value,
              timestamp: nowLabel,
              processingNote: `Bholu referenced ${mem.label.toLowerCase()} (“${mem.value}”) while helping Aarav stay connected during his move.`,
              tone: data.sentimentTone,
              source: 'live',
            });
          }
        }

        if (combinedTriggers.size > 0) {
          const newEvents = Array.from(combinedTriggers.values());
          setMemoryTimeline((prev) => [...newEvents, ...prev].slice(0, 24));
        }
      }
    } catch {
      // Non-blocking: preserve last mood pulse on network hiccup
    } finally {
      setIsAnalyzingMood(false);
    }
  }, []);

  const ensureOutputAudio = useCallback(() => {
    if (!outputCtxRef.current || outputCtxRef.current.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 24000 });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      gain.connect(analyser);
      analyser.connect(ctx.destination);

      outputCtxRef.current = ctx;
      outputAnalyserRef.current = analyser;
      outputGainRef.current = gain;
    }
    if (outputCtxRef.current.state === 'suspended') {
      outputCtxRef.current.resume().catch(() => {});
    }
    return outputCtxRef.current;
  }, []);

  const schedulePcmAudio = useCallback(
    (base64Data: string) => {
      const ctx = ensureOutputAudio();
      if (!outputGainRef.current) return;

      const audioBuffer = base64Pcm24kToAudioBuffer(ctx, base64Data);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputGainRef.current);

      const startAt = Math.max(ctx.currentTime + 0.015, nextStartTimeRef.current);
      source.start(startAt);
      nextStartTimeRef.current = startAt + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      setStatus('speaking');

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (activeSourcesRef.current.size === 0) {
          if (isSleepingRef.current) {
            setStatus('sleeping');
          } else if (isConnectedRef.current) {
            setStatus('listening');
          }
        }
      };
    },
    [ensureOutputAudio]
  );

  const stopMicAndSocket = useCallback(
    (options?: { preservePlayback?: boolean; nextStatus?: ToyDeviceStatus }) => {
      if (motionTimeoutRef.current) {
        window.clearTimeout(motionTimeoutRef.current);
        motionTimeoutRef.current = null;
      }

      if (!options?.preservePlayback) {
        stopAllPlayback();
      }

      if (processorRef.current) {
        try {
          processorRef.current.onaudioprocess = null;
          processorRef.current.disconnect();
        } catch {
          // ignore
        }
        processorRef.current = null;
      }

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }

      if (inputCtxRef.current && inputCtxRef.current.state !== 'closed') {
        inputCtxRef.current.close().catch(() => {});
      }
      inputCtxRef.current = null;
      inputAnalyserRef.current = null;

      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'stop' }));
          }
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }

      isConnectedRef.current = false;
      setIsConnected(false);
      setIsStoryMode(false);
      tutorActiveRef.current = false;
      setTutorState((prev) => ({ ...prev, active: false, round: 1 }));
      const targetStatus = options?.nextStatus ?? 'idle';
      if (options?.preservePlayback && activeSourcesRef.current.size > 0) {
        // Let goodbye audio finish naturally, then onended transitions to sleeping
      } else {
        setStatus(targetStatus);
      }
      finalizePartialTranscripts();
    },
    [finalizePartialTranscripts, stopAllPlayback]
  );

  const cleanupAudioAndSocket = useCallback(() => {
    stopMicAndSocket({
      preservePlayback: false,
      nextStatus: isSleepingRef.current ? 'sleeping' : 'idle',
    });
  }, [stopMicAndSocket]);

  const startMicrophonePipeline = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicAvailable(false);
      setErrorMessage(
        'Microphone API is unavailable in this browser. You can still trigger PIR Motion or type messages below.'
      );
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      micStreamRef.current = stream;
      setMicAvailable(true);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }
      inputCtxRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      inputAnalyserRef.current = analyser;

      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect through a zero-gain node so mic audio never echoes locally
      const silentGain = inputCtx.createGain();
      silentGain.gain.value = 0;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(inputCtx.destination);

      processor.onaudioprocess = (event) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !isConnectedRef.current) {
          return;
        }
        if (isMutedRef.current) {
          return;
        }

        const rawSamples = event.inputBuffer.getChannelData(0);
        const pcm16k = downsampleTo16kHz(rawSamples, inputCtx.sampleRate);
        const base64 = float32ToBase64Pcm16(pcm16k);
        ws.send(JSON.stringify({ type: 'audio', data: base64 }));
      };

      return true;
    } catch (err) {
      setMicAvailable(false);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMessage(
          'Microphone permission was denied. Allow mic access in your browser bar for voice chat, or use the text input below.'
        );
      } else {
        setErrorMessage(
          'Could not access a microphone on this device. You can still listen to Bholu via PIR Motion or type below.'
        );
      }
      return false;
    }
  }, []);

  const connectSession = useCallback(
    async (options?: { triggerMotion?: boolean; triggerAdult?: boolean }) => {
      const triggerMotion = Boolean(options?.triggerMotion);
      const triggerAdult = Boolean(options?.triggerAdult);
      setErrorMessage(null);

      // Wake PIR sensor if previously sleeping
      isSleepingRef.current = false;
      setPirSensorEnabled(true);
      setSleepReason(null);

      // Initialize output AudioContext inside user gesture for browser autoplay (zero UI chimes)
      ensureOutputAudio();
      if (triggerAdult) {
        setLastPresence('adult');
        lastPresenceRef.current = 'adult';
        setStatus('motion');
        setPirTriggeredCount((c) => c + 1);
        appendOrUpdateTranscript(
          'system',
          '[ADULT_DETECTED] Adult / Parent sensed nearby — Bholu is greeting respectfully.'
        );
      } else if (triggerMotion) {
        setLastPresence('kid');
        lastPresenceRef.current = 'kid';
        setStatus('motion');
        setPirTriggeredCount((c) => c + 1);
        appendOrUpdateTranscript(
          'system',
          'PIR Motion Sensor triggered — Aarav entered the bedroom. Waking Bholu without wake word.'
        );
      } else {
        setLastPresence('kid');
        lastPresenceRef.current = 'kid';
        setStatus('connecting');
      }

      // Request mic permission concurrently (non-fatal if user denies mic on demo trigger)
      await startMicrophonePipeline();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            memories: memoriesRef.current,
            shell,
            voiceName,
            language: languageRef.current,
            triggerMotion,
            triggerAdult,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg: ServerToClientMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'ready': {
            if (!isConnectedRef.current) {
              isConnectedRef.current = true;
              setIsConnected(true);
              if (!triggerMotion && !triggerAdult) {
                setStatus('listening');
              } else {
                motionTimeoutRef.current = window.setTimeout(() => {
                  setStatus((curr) => (curr === 'motion' ? 'listening' : curr));
                }, 900);
              }
            }
            break;
          }
          case 'audio': {
            if (msg.data) {
              schedulePcmAudio(msg.data);
            }
            break;
          }
          case 'interrupted': {
            stopAllPlayback();
            finalizePartialTranscripts();
            if (isConnectedRef.current && !isSleepingRef.current) {
              setStatus('listening');
            }
            break;
          }
          case 'input_transcript': {
            if (msg.text) {
              const speaker = lastPresenceRef.current === 'adult' ? 'parent' : 'aarav';
              appendOrUpdateTranscript(speaker, msg.text);
            }
            break;
          }
          case 'output_transcript': {
            if (msg.text) {
              appendOrUpdateTranscript('bholu', msg.text);
            }
            break;
          }
          case 'turn_complete': {
            finalizePartialTranscripts();
            window.setTimeout(() => {
              refreshMoodPulse();
            }, 250);
            break;
          }
          case 'pir_sensor_state': {
            if (typeof msg.pirEnabled === 'boolean') {
              setPirSensorEnabled(msg.pirEnabled);
              if (!msg.pirEnabled && msg.reason) {
                setSleepReason(msg.reason);
              }
            }
            break;
          }
          case 'enter_sleep_mode': {
            const reason = msg.reason || 'Parent asked BuddyBear to take a nap';
            isSleepingRef.current = true;
            setPirSensorEnabled(false);
            setSleepReason(reason);
            setIsMuted(false);
            appendOrUpdateTranscript(
              'system',
              `Sleep Mode Activated — PIR Motion Sensor OFF (${reason}).`
            );
            const sleepTimelineEntry: MemoryTimelineEvent = {
              id: `sleep-${Date.now()}`,
              memoryId: 'parent-sleep-mode',
              memoryLabel: 'Parent Voice Shutdown',
              memoryValue: 'PIR Sensor OFF',
              timestamp: formatTimeNow(),
              processingNote: `BuddyBear respectfully powered down its PIR motion sensor and mic after parent request: “${reason}”.`,
              tone: 'calm',
              source: 'live',
            };
            setMemoryTimeline((prev) => [sleepTimelineEntry, ...prev].slice(0, 24));
            stopMicAndSocket({ preservePlayback: true, nextStatus: 'sleeping' });
            break;
          }
          case 'memory_synced': {
            setMemorySyncNote('Synced to active session');
            window.setTimeout(() => setMemorySyncNote(null), 2600);
            break;
          }
          case 'memory_captured': {
            if (msg.memory) {
              const captured = msg.memory;
              const nextAll = Array.isArray(msg.memories) ? msg.memories : memoriesRef.current;
              memoriesRef.current = nextAll;
              onMemoryCapturedRef.current?.(captured, nextAll);

              // Silently record newly learned relocation milestone on Parent Companion timeline
              const toneForCat: MemoryTimelineEvent['tone'] =
                captured.category === 'Friend'
                  ? 'positive'
                  : captured.category === 'School'
                    ? 'calm'
                    : captured.category === 'Preference'
                      ? 'playful'
                      : 'tender';

              const timelineEntry: MemoryTimelineEvent = {
                id: `captured-${captured.id}-${Date.now()}`,
                memoryId: captured.id,
                memoryLabel: captured.label,
                memoryValue: captured.value,
                timestamp: captured.capturedAt || formatTimeNow(),
                processingNote: `Bholu quietly learned a new ${captured.category.replace('_', ' ').toLowerCase()} detail (“${captured.value}”) as Aarav shared about his day.`,
                tone: toneForCat,
                source: 'live',
              };
              setMemoryTimeline((prev) => [timelineEntry, ...prev].slice(0, 24));
            }
            break;
          }
          case 'story_mode': {
            setIsStoryMode(Boolean(msg.active));
            break;
          }
          case 'tutor_mode': {
            if (msg.tutor) {
              const wasActive = tutorActiveRef.current;
              tutorActiveRef.current = msg.tutor.active;
              setTutorState(msg.tutor);
              if (msg.tutor.active && !wasActive) {
                const tutorTimelineEntry: MemoryTimelineEvent = {
                  id: `tutor-${Date.now()}`,
                  memoryId: 'language-tutor-session',
                  memoryLabel: 'Language Tutor',
                  memoryValue: `${msg.tutor.targetLanguage} Practice`,
                  timestamp: formatTimeNow(),
                  processingNote: `Aarav started a playful 3-round screen-free ${msg.tutor.targetLanguage} speaking game (${msg.tutor.topic}) with Bholu.`,
                  tone: 'playful',
                  source: 'live',
                };
                setMemoryTimeline((prev) => [tutorTimelineEntry, ...prev].slice(0, 24));
              }
            }
            break;
          }
          case 'error': {
            setErrorMessage(
              msg.message || 'Voice connection error. Please check your Gemini API key.'
            );
            cleanupAudioAndSocket();
            break;
          }
          case 'closed': {
            if (isConnectedRef.current && !isSleepingRef.current) {
              setErrorMessage(msg.reason || 'Live voice session ended.');
              cleanupAudioAndSocket();
            }
            break;
          }
        }
      };

      ws.onerror = () => {
        if (!isSleepingRef.current) {
          setErrorMessage('WebSocket connection to the BuddyBear voice bridge failed.');
          cleanupAudioAndSocket();
        }
      };

      ws.onclose = () => {
        if (isConnectedRef.current && !isSleepingRef.current) {
          cleanupAudioAndSocket();
        }
      };
    },
    [
      appendOrUpdateTranscript,
      cleanupAudioAndSocket,
      ensureOutputAudio,
      finalizePartialTranscripts,
      refreshMoodPulse,
      schedulePcmAudio,
      shell,
      startMicrophonePipeline,
      stopAllPlayback,
      stopMicAndSocket,
      voiceName,
    ]
  );

  const wakeToyUp = useCallback(() => {
    setErrorMessage(null);
    isSleepingRef.current = false;
    setPirSensorEnabled(true);
    setSleepReason(null);
    setStatus('idle');
    appendOrUpdateTranscript(
      'system',
      'BuddyBear woken up — PIR Motion Sensor ON (Standby ready).'
    );
  }, [appendOrUpdateTranscript]);

  const toggleLiveVoice = useCallback(async () => {
    if (isConnected || status === 'connecting' || status === 'motion') {
      cleanupAudioAndSocket();
      return;
    }
    await connectSession({ triggerMotion: false });
  }, [cleanupAudioAndSocket, connectSession, isConnected, status]);

  const triggerPirMotion = useCallback(async () => {
    setErrorMessage(null);
    ensureOutputAudio();
    isSleepingRef.current = false;
    setPirSensorEnabled(true);
    setSleepReason(null);
    setLastPresence('kid');
    lastPresenceRef.current = 'kid';

    if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      stopAllPlayback();
      setStatus('motion');
      setPirTriggeredCount((c) => c + 1);
      appendOrUpdateTranscript(
        'system',
        'PIR Motion Sensor triggered — simulating Aarav walking back into the room.'
      );
      wsRef.current.send(
        JSON.stringify({
          type: 'pir_trigger',
          memories: memoriesRef.current,
          language: languageRef.current,
        })
      );
      motionTimeoutRef.current = window.setTimeout(() => {
        setStatus((curr) => (curr === 'motion' ? 'listening' : curr));
      }, 900);
      return;
    }

    await connectSession({ triggerMotion: true });
  }, [appendOrUpdateTranscript, connectSession, ensureOutputAudio, stopAllPlayback]);

  const triggerAdultNearby = useCallback(async () => {
    setErrorMessage(null);
    ensureOutputAudio();
    isSleepingRef.current = false;
    setPirSensorEnabled(true);
    setSleepReason(null);
    setLastPresence('adult');
    lastPresenceRef.current = 'adult';

    if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      stopAllPlayback();
      setStatus('motion');
      setPirTriggeredCount((c) => c + 1);
      appendOrUpdateTranscript(
        'system',
        '[ADULT_DETECTED] Adult / Parent sensed nearby — Bholu is greeting respectfully.'
      );
      wsRef.current.send(
        JSON.stringify({
          type: 'adult_trigger',
          language: languageRef.current,
        })
      );
      motionTimeoutRef.current = window.setTimeout(() => {
        setStatus((curr) => (curr === 'motion' ? 'listening' : curr));
      }, 900);
      return;
    }

    await connectSession({ triggerAdult: true });
  }, [appendOrUpdateTranscript, connectSession, ensureOutputAudio, stopAllPlayback]);

  const syncLanguageToLive = useCallback((nextLanguage: ToyLanguageMode) => {
    languageRef.current = nextLanguage;
    if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'set_language',
          language: nextLanguage,
        })
      );
    }
  }, []);

  const syncMemoryToLive = useCallback(
    (updatedMemories: MemoryItem[], changedMemory?: MemoryItem) => {
      if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'update_memory',
            memories: updatedMemories,
            changedMemory,
          })
        );
      }
    },
    []
  );

  const startLongStory = useCallback(
    async (customTopic?: string) => {
      const promptText =
        customTopic?.trim() ||
        (languageRef.current === 'hindi'
          ? 'Bholu, mujhe ek mazedaar poori lambi kahani sunao!'
          : 'Bholu, tell me a complete fun adventure story!');

      if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        stopAllPlayback();
        appendOrUpdateTranscript('aarav', promptText);
        finalizePartialTranscripts();
        wsRef.current.send(
          JSON.stringify({
            type: 'start_story',
            text: promptText,
            memories: memoriesRef.current,
            language: languageRef.current,
          })
        );
        return;
      }

      // Connect first, then trigger long-form story once ready
      await connectSession({ triggerMotion: false });
      const waitAndSend = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isConnectedRef.current) {
          appendOrUpdateTranscript('aarav', promptText);
          finalizePartialTranscripts();
          wsRef.current.send(
            JSON.stringify({
              type: 'start_story',
              text: promptText,
              memories: memoriesRef.current,
              language: languageRef.current,
            })
          );
        } else if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
          window.setTimeout(waitAndSend, 200);
        } else if (wsRef.current?.readyState === WebSocket.OPEN) {
          window.setTimeout(waitAndSend, 200);
        }
      };
      window.setTimeout(waitAndSend, 350);
    },
    [appendOrUpdateTranscript, connectSession, finalizePartialTranscripts, stopAllPlayback]
  );

  const startLanguageTutor = useCallback(
    async (targetLanguage = 'English', topic = 'Everyday Speaking & Making Friends') => {
      const cleanLang = targetLanguage.trim() || 'English';
      const promptLine =
        languageRef.current === 'hindi'
          ? `Bholu, chalo ${cleanLang} bolna practice karte hain!`
          : `Bholu, let’s do a quick fun ${cleanLang} speaking practice!`;

      setLastPresence('kid');
      lastPresenceRef.current = 'kid';

      if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        stopAllPlayback();
        appendOrUpdateTranscript('aarav', promptLine);
        finalizePartialTranscripts();
        wsRef.current.send(
          JSON.stringify({
            type: 'start_tutor',
            targetLanguage: cleanLang,
            topic,
            language: languageRef.current,
          })
        );
        return;
      }

      await connectSession({ triggerMotion: false });
      const waitAndSend = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isConnectedRef.current) {
          appendOrUpdateTranscript('aarav', promptLine);
          finalizePartialTranscripts();
          wsRef.current.send(
            JSON.stringify({
              type: 'start_tutor',
              targetLanguage: cleanLang,
              topic,
              language: languageRef.current,
            })
          );
        } else if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
          window.setTimeout(waitAndSend, 200);
        }
      };
      window.setTimeout(waitAndSend, 350);
    },
    [appendOrUpdateTranscript, connectSession, finalizePartialTranscripts, stopAllPlayback]
  );

  const endLanguageTutor = useCallback(() => {
    tutorActiveRef.current = false;
    setTutorState((prev) => ({ ...prev, active: false, round: 1 }));
    if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_tutor' }));
    }
  }, []);

  const sendTextFallback = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (wsRef.current?.readyState === WebSocket.OPEN && isConnectedRef.current) {
        const speaker = lastPresenceRef.current === 'adult' ? 'parent' : 'aarav';
        appendOrUpdateTranscript(speaker, trimmed);
        finalizePartialTranscripts();
        wsRef.current.send(
          JSON.stringify({
            type: 'text_input',
            text: trimmed,
          })
        );
      }
    },
    [appendOrUpdateTranscript, finalizePartialTranscripts]
  );

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    lastAnalyzedCountRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioAndSocket();
      if (outputCtxRef.current && outputCtxRef.current.state !== 'closed') {
        outputCtxRef.current.close().catch(() => {});
      }
    };
  }, [cleanupAudioAndSocket]);

  return {
    status,
    isConnected,
    isMuted,
    setIsMuted,
    micAvailable,
    errorMessage,
    setErrorMessage,
    transcript,
    moodPulse,
    memoryTimeline,
    isAnalyzingMood,
    sessionSeconds,
    memorySyncNote,
    pirTriggeredCount,
    isStoryMode,
    tutorState,
    pirSensorEnabled,
    sleepReason,
    lastPresence,
    inputAnalyserRef,
    outputAnalyserRef,
    toggleLiveVoice,
    triggerPirMotion,
    triggerAdultNearby,
    wakeToyUp,
    startLongStory,
    startLanguageTutor,
    endLanguageTutor,
    syncMemoryToLive,
    syncLanguageToLive,
    sendTextFallback,
    clearTranscript,
  };
}
