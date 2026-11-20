import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  Behavior,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import type {
  ClientToServerMessage,
  LanguageTutorState,
  MemoryCategory,
  MemoryItem,
  ToyLanguageMode,
  ToyShellId,
  ToyVoiceName,
} from './src/types.ts';
import {
  buildBholuSystemInstruction,
  buildLanguageTutorCue,
  buildLongStoryDirectorCue,
  isStoryRequest,
} from './server/bholuPrompt.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cliPortIndex = process.argv.indexOf('--port');
const cliPort =
  cliPortIndex >= 0 && process.argv[cliPortIndex + 1]
    ? Number(process.argv[cliPortIndex + 1])
    : NaN;
const PORT =
  (Number.isFinite(cliPort) && cliPort > 0 ? cliPort : Number(process.env.PORT)) || 3000;
const LIVE_MODEL = 'gemini-3.8-live';
const MOOD_MODEL = 'gemini-3.1-flash-lite';

const ALLOWED_MEMORY_CATEGORIES = new Set<MemoryCategory>([
  'Friend',
  'School',
  'Personal_Memory',
  'Preference',
]);

const DEFAULT_MEMORIES: MemoryItem[] = [
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

// Live server-side memory store persisted across active turns and sessions
let serverMemories: MemoryItem[] = DEFAULT_MEMORIES.map((m) => ({ ...m }));

function normalizeCategory(raw: unknown): MemoryCategory {
  if (typeof raw === 'string' && ALLOWED_MEMORY_CATEGORIES.has(raw as MemoryCategory)) {
    return raw as MemoryCategory;
  }
  return 'Personal_Memory';
}

function upsertServerMemory(
  category: MemoryCategory,
  key: string,
  value: string,
  source: 'preset' | 'manual' | 'ai' = 'ai'
): MemoryItem {
  const cleanKey = key.trim() || 'New Detail';
  const cleanValue = value.trim();
  const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const existingIndex = serverMemories.findIndex(
    (m) =>
      m.label.toLowerCase() === cleanKey.toLowerCase() ||
      (m.category === category && m.value.toLowerCase() === cleanValue.toLowerCase())
  );

  if (existingIndex >= 0) {
    const updated: MemoryItem = {
      ...serverMemories[existingIndex],
      category,
      label: cleanKey,
      value: cleanValue,
      source,
      capturedAt: nowLabel,
    };
    serverMemories = serverMemories.map((m, i) => (i === existingIndex ? updated : m));
    return updated;
  }

  const created: MemoryItem = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    label: cleanKey,
    value: cleanValue,
    source,
    capturedAt: nowLabel,
  };
  serverMemories = [...serverMemories, created];
  return created;
}

const SAVE_CHILD_MEMORY_DECLARATION: FunctionDeclaration = {
  name: 'save_child_memory',
  description:
    'Silently saves any new personal detail Aarav shares during conversation—such as a new friend’s name, teacher, school name, favorite subject, hobby, fear, or relocation memory—without interrupting or announcing it.',
  behavior: Behavior.NON_BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: 'Category of memory: Friend, School, Personal_Memory, or Preference.',
        enum: ['Friend', 'School', 'Personal_Memory', 'Preference'],
      },
      key: {
        type: Type.STRING,
        description:
          'Short descriptive 1–3 word label, e.g. "New Friend", "Math Teacher", "Favorite Subject", "New Hobby".',
      },
      value: {
        type: Type.STRING,
        description: 'The specific detail learned from Aarav, e.g. "Rohan (Class 4)".',
      },
    },
    required: ['category', 'key', 'value'],
  },
};

const ENTER_SLEEP_MODE_DECLARATION: FunctionDeclaration = {
  name: 'enter_sleep_mode',
  description:
    'Puts BuddyBear AI into sleep mode and turns off the simulated PIR Motion Sensor whenever an adult or parent declines to talk or asks Bholu to sleep/shut down in English (e.g., "No, you may shutdown", "Go to sleep", "Not now") or in Hindi/local Indian languages (e.g., "Nahi chod", "Nahi sojao tum", "Abhi band ho jao", "Rehne do", "So jao").',
  behavior: Behavior.BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        description:
          'Brief human-readable reason why sleep mode was triggered, e.g. "Parent asked Bholu to sleep (Nahi sojao tum)".',
      },
    },
    required: ['reason'],
  },
};

const SET_LANGUAGE_TUTOR_DECLARATION: FunctionDeclaration = {
  name: 'set_language_tutor_mode',
  description:
    'Silently starts, updates the round of, or finishes Bholu’s playful 3-round screen-free Language Tutor practice session whenever Aarav asks to learn or practice English or another language (such as Hindi, Spanish, French, or Marwari).',
  behavior: Behavior.NON_BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      active: {
        type: Type.BOOLEAN,
        description: 'True while a language practice session is running; false when finished or stopped.',
      },
      targetLanguage: {
        type: Type.STRING,
        description: 'The language being practiced, e.g. "English", "Spanish", "French", "Hindi", "Marwari".',
      },
      topic: {
        type: Type.STRING,
        description:
          'Short playful theme for the 3-round mini-session, e.g. "Making Friends in School" or "Everyday Greetings".',
      },
      round: {
        type: Type.INTEGER,
        description: 'Current practice round number (1 = Warm-Up Echo, 2 = Mini Roleplay, 3 = Quick Challenge).',
      },
    },
    required: ['active', 'targetLanguage'],
  },
};

function createGeminiClient(apiVersion?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      configured: Boolean(process.env.GEMINI_API_KEY),
      liveModel: LIVE_MODEL,
      memoryCount: serverMemories.length,
    });
  });

  app.get('/api/memories', (_req, res) => {
    res.json({ memories: serverMemories });
  });

  app.put('/api/memories', (req, res) => {
    const { memories } = req.body as { memories?: MemoryItem[] };
    if (!Array.isArray(memories)) {
      return res.status(400).json({ error: 'memories array is required.' });
    }
    serverMemories = memories.map((m) => ({
      id: m.id || `mem-${Date.now()}`,
      category: normalizeCategory(m.category),
      label: String(m.label || '').trim(),
      value: String(m.value || '').trim(),
      source: m.source || 'manual',
      capturedAt: m.capturedAt,
    }));
    return res.json({ memories: serverMemories });
  });

  app.post('/api/memories/reset', (_req, res) => {
    serverMemories = DEFAULT_MEMORIES.map((m) => ({ ...m }));
    return res.json({ memories: serverMemories });
  });

  app.post('/api/mood-pulse', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured in the server environment.',
      });
    }

    const { transcript, memories } = req.body as {
      transcript?: Array<{ speaker: string; text: string }>;
      memories?: MemoryItem[];
    };

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: 'Transcript entries are required.' });
    }

    const recentTurns = transcript
      .filter((t) => t.speaker !== 'system' && t.text.trim().length > 0)
      .slice(-10)
      .map((t) => `${t.speaker === 'aarav' ? 'Child (Aarav)' : 'Companion (Bholu)'}: ${t.text}`)
      .join('\n');

    if (!recentTurns) {
      return res.status(400).json({ error: 'No dialogue available to analyze.' });
    }

    const memoryList = Array.isArray(memories) && memories.length > 0 ? memories : serverMemories;
    const memoryContext = memoryList
      .map((m) => `[id=${m.id}] (${m.category}) ${m.label}: ${m.value}`)
      .join('\n');

    const latestTurnFocus = transcript
      .filter((t) => t.speaker !== 'system' && t.text.trim().length > 0)
      .slice(-2)
      .map((t) => `${t.speaker === 'aarav' ? 'Child (Aarav)' : 'Companion (Bholu)'}: ${t.text}`)
      .join('\n');

    try {
      const moodConfig = {
        systemInstruction:
          'You are a child-privacy-first emotional wellness summarizer for BuddyBear AI’s Parent Companion app. Never quote or expose raw private chat messages. Output: (1) a concise, warm 1-sentence emotional summary for Aarav’s parents, (2) a short 2–4 word mood label separated by " · ", (3) a short play/learning theme, (4) sentimentTone (positive, playful, tender, or calm), (5) comfortScore 40–98, and (6) triggeredMemories: list ONLY the stored memories from the provided list that were explicitly or clearly discussed in the LATEST exchange, with a warm 1-sentence privacy-safe processingNote explaining how Aarav is processing the move (empty array if none).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            moodLabel: {
              type: Type.STRING,
              description: 'Two short phrases separated by " · ", e.g. "Adjusting Well · Cheerful"',
            },
            sentimentTone: {
              type: Type.STRING,
              description: 'One of: positive, playful, tender, calm',
            },
            summary: {
              type: Type.STRING,
              description:
                'A single warm, empathetic sentence summarizing Aarav’s mood for his parent without revealing raw private quotes.',
            },
            playTheme: {
              type: Type.STRING,
              description: 'Short 2–4 word screen-free play, story, or study theme noticed.',
            },
            comfortScore: {
              type: Type.INTEGER,
              description: 'Emotional comfort & engagement level between 40 and 98.',
            },
            triggeredMemories: {
              type: Type.ARRAY,
              description:
                'Stored relocation memories referenced in the latest exchange (empty if none).',
              items: {
                type: Type.OBJECT,
                properties: {
                  memoryId: { type: Type.STRING },
                  memoryLabel: { type: Type.STRING },
                  memoryValue: { type: Type.STRING },
                  processingNote: {
                    type: Type.STRING,
                    description:
                      'Warm 1-sentence privacy-preserving note for parents explaining how this memory came up as Aarav adjusts to the move.',
                  },
                  tone: {
                    type: Type.STRING,
                    description: 'One of: positive, playful, tender, calm',
                  },
                },
                required: ['memoryId', 'memoryLabel', 'memoryValue', 'processingNote', 'tone'],
              },
            },
          },
          required: [
            'moodLabel',
            'sentimentTone',
            'summary',
            'playTheme',
            'comfortScore',
            'triggeredMemories',
          ],
        },
      };

      const moodPrompt = [
        'Analyze the emotional tone of this brief child-companion interaction and generate a privacy-preserving parent mood update + detect any stored relocation memories referenced in the LATEST exchange.',
        'Stored relocation memories:',
        memoryContext,
        '',
        'Recent conversation context (DO NOT quote raw lines back to the parent):',
        recentTurns,
        '',
        'LATEST exchange to inspect for triggered memories:',
        latestTurnFocus,
      ].join('\n');

      const candidates = [
        { model: MOOD_MODEL, thinkingLevel: ThinkingLevel.MINIMAL },
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      ];

      let response = null;
      let lastErr: unknown = null;
      for (const candidate of candidates) {
        try {
          response = await ai.models.generateContent({
            model: candidate.model,
            contents: moodPrompt,
            config: {
              ...moodConfig,
              thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
            },
          });
          break;
        } catch (err) {
          lastErr = err;
          const errStr = err instanceof Error ? err.message : String(err);
          if (!errStr.includes('503') && !errStr.includes('UNAVAILABLE')) {
            throw err;
          }
        }
      }

      if (!response) {
        throw lastErr ?? new Error('Unable to analyze mood pulse.');
      }

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);

      const allowedTones = new Set(['positive', 'playful', 'tender', 'calm']);
      const sentimentTone = allowedTones.has(parsed.sentimentTone)
        ? parsed.sentimentTone
        : 'positive';

      const validMemoryMap = new Map(memoryList.map((m) => [m.id, m]));
      const triggeredMemories = Array.isArray(parsed.triggeredMemories)
        ? parsed.triggeredMemories
            .filter((tm: { memoryId?: string; memoryLabel?: string }) =>
              Boolean(tm?.memoryLabel || (tm?.memoryId && validMemoryMap.has(tm.memoryId)))
            )
            .map(
              (tm: {
                memoryId?: string;
                memoryLabel?: string;
                memoryValue?: string;
                processingNote?: string;
                tone?: string;
              }) => {
                const matched = tm.memoryId ? validMemoryMap.get(tm.memoryId) : undefined;
                return {
                  memoryId: matched?.id || tm.memoryId || 'memory',
                  memoryLabel: matched?.label || tm.memoryLabel || 'Relocation Memory',
                  memoryValue: matched?.value || tm.memoryValue || '',
                  processingNote:
                    tm.processingNote ||
                    'Bholu gently wove this memory into conversation to help Aarav feel grounded.',
                  tone: allowedTones.has(tm.tone ?? '') ? tm.tone : sentimentTone,
                };
              }
            )
        : [];

      return res.json({
        moodLabel: parsed.moodLabel || 'Adjusting Well · Cheerful',
        sentimentTone,
        summary:
          parsed.summary ||
          'Aarav is engaging warmly in screen-free play and curiosity while settling into his new room in Jaipur Railway Colony.',
        playTheme: parsed.playTheme || 'Room Discovery Play',
        comfortScore: Math.max(40, Math.min(98, Number(parsed.comfortScore) || 82)),
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        triggeredMemories,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze mood pulse.';
      console.error('[mood-pulse error]', message);
      return res.status(502).json({ error: message });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (clientWs) => {
    let liveSession: Session | null = null;
    let currentLanguage: ToyLanguageMode = 'hinglish';
    let isClosing = false;

    // Long-Form Storytelling Mode, Silent Tool & Sleep Shutdown state
    let storyModeActive = false;
    let storyWordCount = 0;
    let storyContinuationCount = 0;
    let currentUserInputBuffer = '';
    let currentTurnEmittedAudio = false;
    let silentToolTriggeredThisTurn = false;
    let pendingSleepReason: string | null = null;
    let sleepFinalizeTimer: ReturnType<typeof setTimeout> | null = null;
    let tutorState: LanguageTutorState = {
      active: false,
      targetLanguage: 'English',
      topic: 'Everyday Speaking',
      round: 1,
      totalRounds: 3,
    };

    const resetStoryTurnState = () => {
      storyModeActive = false;
      storyWordCount = 0;
      storyContinuationCount = 0;
      safeSend(clientWs, { type: 'story_mode', active: false });
    };

    const activateStoryMode = () => {
      storyModeActive = true;
      storyWordCount = 0;
      storyContinuationCount = 0;
      safeSend(clientWs, { type: 'story_mode', active: true });
    };

    const clearSleepTimer = () => {
      if (sleepFinalizeTimer) {
        clearTimeout(sleepFinalizeTimer);
        sleepFinalizeTimer = null;
      }
    };

    const closeLiveSession = () => {
      clearSleepTimer();
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore close errors
        }
        liveSession = null;
      }
      storyModeActive = false;
      storyWordCount = 0;
      storyContinuationCount = 0;
      currentTurnEmittedAudio = false;
      silentToolTriggeredThisTurn = false;
      pendingSleepReason = null;
      tutorState = {
        active: false,
        targetLanguage: 'English',
        topic: 'Everyday Speaking',
        round: 1,
        totalRounds: 3,
      };
    };

    const finalizeSleepShutdown = (reason: string) => {
      clearSleepTimer();
      pendingSleepReason = null;
      safeSend(clientWs, {
        type: 'enter_sleep_mode',
        reason,
        pirEnabled: false,
      });
      isClosing = true;
      closeLiveSession();
      isClosing = false;
    };

    const sendPirProactivePrompt = (
      session: Session,
      memories: MemoryItem[],
      language: ToyLanguageMode
    ) => {
      resetStoryTurnState();
      const currentCity =
        memories.find((m) => m.label.toLowerCase().includes('current'))?.value ||
        'Jaipur Railway Colony';
      const oldFriend =
        memories.find((m) => m.label.toLowerCase().includes('friend'))?.value || 'Kabir';

      const langNote =
        language === 'hindi'
          ? 'Speak in warm, simple everyday Hindi that a 9-year-old easily understands.'
          : 'Speak in natural, cheerful Indian English mixed smoothly with warm Hindi words like "yaar", "arre wah", "batao", or "chalo".';

      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: `[HARDWARE EVENT — PIR MOTION SENSOR TRIGGERED: Aarav just walked into his bedroom in ${currentCity} after coming back from his new school. No wake word was spoken. Speak FIRST right now! Welcome Aarav warmly like his best friend Bholu, ask if he made any new friends at school today or has any homework questions or fun curiosities, and keep it concise (2–3 warm sentences). ${langNote} Remember his old best friend ${oldFriend} if helpful later. If Aarav replies with any new friend, teacher, hobby, or school detail, silently call save_child_memory in the background without mentioning it.]`,
              },
            ],
          },
        ],
        turnComplete: true,
      });
      safeSend(clientWs, { type: 'pir_acknowledged' });
    };

    const sendAdultDetectedPrompt = (session: Session, language: ToyLanguageMode) => {
      resetStoryTurnState();
      const langNote =
        language === 'hindi'
          ? 'Greet respectfully in warm, polite Hindi ("Namaste ji! Kya aap Aarav ki Mummy ya Papa bol rahe hain, ya koi aur?").'
          : 'Greet respectfully in warm Indian English with "Namaste!" (e.g., "Namaste! Are you Aarav’s Mummy or Papa, or someone else?"). Automatically switch to Hindi if they speak Hindi.';

      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: `[ADULT_DETECTED — HARDWARE MOTION & VOICE SENSOR EVENT: An adult/parent (NOT Aarav) just walked near BuddyBear in Aarav’s bedroom. Speak FIRST right now! ${langNote} Wait for them to tell you who they are; once they answer, politely ask if they would like to talk to you or if you should take a nap right now. If they decline or tell you to sleep/shut down in English ("No, you may shutdown", "Go to sleep", "Not now") or Hindi/local phrasing ("Nahi chod", "Nahi sojao tum", "Abhi band ho jao", "Rehne do", "So jao"), warmly reply "Ji bilkul, goodnight! Call me whenever Aarav needs me" and IMMEDIATELY call the enter_sleep_mode tool.]`,
              },
            ],
          },
        ],
        turnComplete: true,
      });
      safeSend(clientWs, { type: 'adult_acknowledged' });
    };

    clientWs.on('message', async (rawData) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      if (msg.type === 'start') {
        closeLiveSession();
        // Gemini Live BidiGenerateContent requires v1beta on @google/genai 3.x (which defaults to v1)
        const ai = createGeminiClient('v1beta');
        if (!ai) {
          safeSend(clientWs, {
            type: 'error',
            message:
              'GEMINI_API_KEY is missing on the server. Please configure it in Settings > Secrets.',
          });
          return;
        }

        if (Array.isArray(msg.memories) && msg.memories.length > 0) {
          serverMemories = msg.memories.map((m) => ({
            ...m,
            category: normalizeCategory(m.category),
          }));
        }
        const shell: ToyShellId = msg.shell === 'car' ? 'car' : 'bear';
        const voiceName: ToyVoiceName = msg.voiceName === 'Aoede' ? 'Aoede' : 'Puck';
        currentLanguage = msg.language === 'hindi' ? 'hindi' : 'hinglish';
        const systemInstruction = buildBholuSystemInstruction(
          serverMemories,
          shell,
          currentLanguage
        );

        try {
          const session = await ai.live.connect({
            model: LIVE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              tools: [
                {
                  functionDeclarations: [
                    SAVE_CHILD_MEMORY_DECLARATION,
                    ENTER_SLEEP_MODE_DECLARATION,
                    SET_LANGUAGE_TUTOR_DECLARATION,
                  ],
                },
              ],
              systemInstruction,
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
            callbacks: {
              onopen: () => {
                // Ready is emitted immediately once liveSession is assigned below
              },
              onmessage: (message: LiveServerMessage) => {
                // 1. Handle Function Calling Tools (NON_BLOCKING memory & language tutor; BLOCKING sleep mode)
                const calls = message.toolCall?.functionCalls ?? [];
                if (calls.length > 0 && liveSession) {
                  const responses = [];
                  let hasSilentBackgroundCall = false;

                  for (const call of calls) {
                    if (call.name === 'save_child_memory') {
                      hasSilentBackgroundCall = true;
                      const args = (call.args ?? {}) as {
                        category?: string;
                        key?: string;
                        value?: string;
                      };
                      const category = normalizeCategory(args.category);
                      const key = typeof args.key === 'string' ? args.key.trim() : 'New Detail';
                      const value = typeof args.value === 'string' ? args.value.trim() : '';

                      if (value) {
                        const savedMemory = upsertServerMemory(category, key, value, 'ai');
                        // Silently broadcast to browser so new memory smoothly fades into the card
                        safeSend(clientWs, {
                          type: 'memory_captured',
                          memory: savedMemory,
                          memories: serverMemories,
                        });
                      }

                      responses.push({
                        id: call.id,
                        name: call.name,
                        response: {
                          status: 'saved_silently',
                          category,
                          key,
                          value,
                        },
                        scheduling: FunctionResponseScheduling.SILENT,
                      });
                    } else if (call.name === 'set_language_tutor_mode') {
                      hasSilentBackgroundCall = true;
                      const args = (call.args ?? {}) as {
                        active?: boolean;
                        targetLanguage?: string;
                        topic?: string;
                        round?: number;
                      };
                      const isActive = Boolean(args.active);
                      const targetLanguage =
                        typeof args.targetLanguage === 'string' && args.targetLanguage.trim()
                          ? args.targetLanguage.trim()
                          : tutorState.targetLanguage || 'English';
                      const topic =
                        typeof args.topic === 'string' && args.topic.trim()
                          ? args.topic.trim()
                          : tutorState.topic || 'Everyday Speaking';
                      const rawRound = Number(args.round);
                      const round =
                        Number.isFinite(rawRound) && rawRound >= 1 && rawRound <= 3
                          ? Math.round(rawRound)
                          : isActive
                            ? tutorState.active
                              ? Math.min(3, tutorState.round + 1)
                              : 1
                            : 1;

                      tutorState = {
                        active: isActive,
                        targetLanguage,
                        topic,
                        round,
                        totalRounds: 3,
                      };

                      safeSend(clientWs, {
                        type: 'tutor_mode',
                        tutor: tutorState,
                      });

                      responses.push({
                        id: call.id,
                        name: call.name,
                        response: {
                          status: isActive ? 'language_tutor_active' : 'language_tutor_ended',
                          tutor: tutorState,
                        },
                        scheduling: FunctionResponseScheduling.SILENT,
                      });
                    } else if (call.name === 'enter_sleep_mode') {
                      const args = (call.args ?? {}) as { reason?: string };
                      const reason =
                        typeof args.reason === 'string' && args.reason.trim()
                          ? args.reason.trim()
                          : 'Parent asked BuddyBear to go to sleep';

                      pendingSleepReason = reason;
                      // Immediately sync PIR sensor OFF state to both Toy Simulator & Parent Companion preview
                      safeSend(clientWs, {
                        type: 'pir_sensor_state',
                        pirEnabled: false,
                        reason,
                      });

                      // BLOCKING response: let Bholu speak his brief polite goodbye if not yet spoken, then sleep
                      responses.push({
                        id: call.id,
                        name: call.name,
                        response: {
                          status: 'sleep_mode_scheduled',
                          pirSensor: 'OFF',
                          reason,
                          note: currentTurnEmittedAudio
                            ? 'Goodbye already delivered. Entering sleep mode immediately.'
                            : 'Say only your brief warm goodbye ("Ji bilkul, goodnight! Call me whenever Aarav needs me") right now and then stop.',
                        },
                      });

                      // Safety fallback timer in case Gemini already finished speaking before invoking the tool
                      clearSleepTimer();
                      sleepFinalizeTimer = setTimeout(
                        () => {
                          if (pendingSleepReason) {
                            finalizeSleepShutdown(pendingSleepReason);
                          }
                        },
                        currentTurnEmittedAudio ? 800 : 8000
                      );
                    }
                  }

                  if (responses.length > 0) {
                    if (hasSilentBackgroundCall && !pendingSleepReason) {
                      silentToolTriggeredThisTurn = true;
                    }
                    try {
                      liveSession.sendToolResponse({ functionResponses: responses });
                    } catch (err) {
                      console.error('[tool response error]', err);
                    }
                  }
                }

                // 2. Handle Live Audio, Transcripts & Barge-In
                const content = message.serverContent;
                if (!content) return;

                if (content.interrupted) {
                  currentTurnEmittedAudio = false;
                  silentToolTriggeredThisTurn = false;
                  if (storyModeActive) {
                    resetStoryTurnState();
                  }
                  safeSend(clientWs, { type: 'interrupted' });
                }

                if (content.inputTranscription?.text) {
                  const chunk = content.inputTranscription.text;
                  currentUserInputBuffer += ` ${chunk}`;
                  if (!storyModeActive && isStoryRequest(currentUserInputBuffer)) {
                    activateStoryMode();
                  }
                  safeSend(clientWs, {
                    type: 'input_transcript',
                    text: chunk,
                  });
                }

                if (content.outputTranscription?.text) {
                  const outChunk = content.outputTranscription.text;
                  if (storyModeActive) {
                    const words = outChunk.trim().split(/\s+/).filter(Boolean).length;
                    storyWordCount += words;
                  }
                  safeSend(clientWs, {
                    type: 'output_transcript',
                    text: outChunk,
                  });
                }

                for (const part of content.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    currentTurnEmittedAudio = true;
                    safeSend(clientWs, {
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }

                if (content.turnComplete) {
                  currentUserInputBuffer = '';

                  // Finalize sleep mode only once Bholu finishes speaking his polite goodbye
                  // (ignore the empty turnComplete immediately following a toolCall frame before goodbye audio streams)
                  if (pendingSleepReason) {
                    if (currentTurnEmittedAudio) {
                      const reasonToFinalize = pendingSleepReason;
                      currentTurnEmittedAudio = false;
                      silentToolTriggeredThisTurn = false;
                      safeSend(clientWs, { type: 'turn_complete' });
                      finalizeSleepShutdown(reasonToFinalize);
                    }
                    return;
                  }

                  // If Gemini emitted save_child_memory before speaking any audio in this turn,
                  // its SILENT tool response intentionally won't auto-speak—prompt it seamlessly
                  // to deliver its warm spoken reply right away without mentioning memory saving.
                  if (silentToolTriggeredThisTurn && !currentTurnEmittedAudio && liveSession) {
                    silentToolTriggeredThisTurn = false;
                    const continuationPrompt = tutorState.active
                      ? `[Language Tutor state updated silently (${tutorState.targetLanguage}, Round ${tutorState.round}/3). Speak warmly out loud right now for this short playful practice turn—2 to 3 cheerful screen-free sentences, and NEVER mention any tool or mode toggle!]`
                      : '[Background update saved silently. Respond warmly out loud to what Aarav just shared right now—2 to 4 natural, cheerful sentences like a best friend, and NEVER mention saving any memory or tool!]';
                    try {
                      liveSession.sendClientContent({
                        turns: [
                          {
                            role: 'user',
                            parts: [{ text: continuationPrompt }],
                          },
                        ],
                        turnComplete: true,
                      });
                      return;
                    } catch (err) {
                      console.error('[post-silent-tool reply cue error]', err);
                    }
                  }

                  currentTurnEmittedAudio = false;
                  silentToolTriggeredThisTurn = false;

                  if (
                    storyModeActive &&
                    liveSession &&
                    storyWordCount > 0 &&
                    storyWordCount < 220 &&
                    storyContinuationCount < 2
                  ) {
                    storyContinuationCount += 1;
                    const isFinalPart = storyContinuationCount === 2;
                    const continueCue = isFinalPart
                      ? '[LONG-FORM STORY CONTINUATION — FINAL PART: Keep narrating smoothly right where you paused with ZERO recap! Build the exciting climax, clever solution, and warm cozy ending in ~180–220 words, then ask Aarav which moment he liked best.]'
                      : '[LONG-FORM STORY CONTINUATION — MIDDLE SCENE: Do NOT end or summarize yet! Keep narrating smoothly right where you paused with fun character dialogue, vivid details, and an exciting twist in ~180–220 words.]';

                    try {
                      liveSession.sendClientContent({
                        turns: [{ role: 'user', parts: [{ text: continueCue }] }],
                        turnComplete: true,
                      });
                    } catch (err) {
                      console.error('[story continuation error]', err);
                      resetStoryTurnState();
                      safeSend(clientWs, { type: 'turn_complete' });
                    }
                    return;
                  }

                  if (storyModeActive) {
                    resetStoryTurnState();
                  }
                  safeSend(clientWs, { type: 'turn_complete' });
                }
              },
              onerror: (err: ErrorEvent) => {
                console.error('[Gemini Live error]', err);
                safeSend(clientWs, {
                  type: 'error',
                  message: err.message || 'Gemini Live connection encountered an error.',
                });
              },
              onclose: (event: CloseEvent) => {
                if (!isClosing) {
                  safeSend(clientWs, {
                    type: 'closed',
                    reason: event?.reason || 'Live voice session closed.',
                  });
                }
                liveSession = null;
              },
            },
          });

          liveSession = session;
          safeSend(clientWs, { type: 'ready' });
          safeSend(clientWs, { type: 'pir_sensor_state', pirEnabled: true });

          if (msg.triggerAdult) {
            sendAdultDetectedPrompt(session, currentLanguage);
          } else if (msg.triggerMotion) {
            sendPirProactivePrompt(session, serverMemories, currentLanguage);
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Unable to connect to Gemini Live API.';
          console.error('[Gemini Live connect failed]', message);
          safeSend(clientWs, { type: 'error', message });
        }
        return;
      }

      if (msg.type === 'audio' && msg.data && liveSession) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          console.error('[audio forward error]', err);
        }
        return;
      }

      if (msg.type === 'pir_trigger' && liveSession) {
        try {
          if (msg.language) {
            currentLanguage = msg.language === 'hindi' ? 'hindi' : 'hinglish';
          }
          if (Array.isArray(msg.memories) && msg.memories.length > 0) {
            serverMemories = msg.memories.map((m) => ({
              ...m,
              category: normalizeCategory(m.category),
            }));
          }
          safeSend(clientWs, { type: 'pir_sensor_state', pirEnabled: true });
          sendPirProactivePrompt(liveSession, serverMemories, currentLanguage);
        } catch (err) {
          console.error('[pir trigger error]', err);
        }
        return;
      }

      if (msg.type === 'adult_trigger' && liveSession) {
        try {
          if (msg.language) {
            currentLanguage = msg.language === 'hindi' ? 'hindi' : 'hinglish';
          }
          safeSend(clientWs, { type: 'pir_sensor_state', pirEnabled: true });
          sendAdultDetectedPrompt(liveSession, currentLanguage);
        } catch (err) {
          console.error('[adult trigger error]', err);
        }
        return;
      }

      if (msg.type === 'start_tutor' && liveSession) {
        try {
          if (msg.language) {
            currentLanguage = msg.language === 'hindi' ? 'hindi' : 'hinglish';
          }
          resetStoryTurnState();
          const targetLanguage = msg.targetLanguage?.trim() || 'English';
          const topic = msg.topic?.trim() || 'Everyday Speaking & Making Friends';
          tutorState = {
            active: true,
            targetLanguage,
            topic,
            round: 1,
            totalRounds: 3,
          };
          safeSend(clientWs, { type: 'tutor_mode', tutor: tutorState });
          const tutorPrompt = buildLanguageTutorCue(targetLanguage, topic, currentLanguage);
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: tutorPrompt }] }],
            turnComplete: true,
          });
        } catch (err) {
          console.error('[start_tutor error]', err);
        }
        return;
      }

      if (msg.type === 'end_tutor' && liveSession) {
        try {
          tutorState = {
            ...tutorState,
            active: false,
            round: 1,
          };
          safeSend(clientWs, { type: 'tutor_mode', tutor: tutorState });
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: '[LANGUAGE TUTOR MODE ENDED: Cheer Aarav on briefly for a great practice session in 1–2 warm sentences and return to normal playful best-friend chat.]',
                  },
                ],
              },
            ],
            turnComplete: true,
          });
        } catch (err) {
          console.error('[end_tutor error]', err);
        }
        return;
      }

      if (msg.type === 'start_story' && liveSession) {
        try {
          if (msg.language) {
            currentLanguage = msg.language === 'hindi' ? 'hindi' : 'hinglish';
          }
          if (Array.isArray(msg.memories) && msg.memories.length > 0) {
            serverMemories = msg.memories.map((m) => ({
              ...m,
              category: normalizeCategory(m.category),
            }));
          }
          activateStoryMode();
          const storyTopic =
            msg.text?.trim() ||
            (currentLanguage === 'hindi'
              ? 'Bholu, mujhe ek mazedaar poori lambi kahani sunao!'
              : 'Bholu, tell me a fun complete adventure story!');
          const storyPrompt = buildLongStoryDirectorCue(
            storyTopic,
            currentLanguage,
            serverMemories
          );
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: storyPrompt }] }],
            turnComplete: true,
          });
        } catch (err) {
          console.error('[start_story error]', err);
        }
        return;
      }

      if (msg.type === 'set_language' && liveSession) {
        currentLanguage = msg.language === 'hindi' ? 'hindi' : 'hinglish';
        const directive =
          currentLanguage === 'hindi'
            ? '[LANGUAGE PREFERENCE UPDATED — DO NOT SPEAK YET: From your very next reply onward, speak in very simple, warm, everyday spoken Hindi that a 9-year-old child easily understands.]'
            : '[LANGUAGE PREFERENCE UPDATED — DO NOT SPEAK YET: From your very next reply onward, speak in natural, expressive Indian English mixed smoothly with warm Hindi words like "yaar", "chalo", and "arre wah".]';
        try {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: directive }] }],
            turnComplete: false,
          });
          safeSend(clientWs, { type: 'language_synced' });
        } catch (err) {
          console.error('[language sync error]', err);
        }
        return;
      }

      if (msg.type === 'update_memory' && liveSession) {
        const memories = (msg.memories ?? []).map((m) => ({
          ...m,
          category: normalizeCategory(m.category),
        }));
        serverMemories = memories;
        const changed = msg.changedMemory;
        const summary = changed
          ? `Aarav's memory was updated — [${changed.category}] ${changed.label}: ${changed.value}.`
          : `Updated memories: ${memories.map((m) => `${m.label}: ${m.value}`).join(', ')}.`;
        try {
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: `[SYSTEM MEMORY UPDATE — DO NOT SPEAK YET, JUST REMEMBER SILENTLY: ${summary}]`,
                  },
                ],
              },
            ],
            turnComplete: false,
          });
          safeSend(clientWs, { type: 'memory_synced' });
        } catch (err) {
          console.error('[memory sync error]', err);
        }
        return;
      }

      if (msg.type === 'text_input' && msg.text && liveSession) {
        try {
          const wantsLongStory = isStoryRequest(msg.text);
          if (wantsLongStory) {
            activateStoryMode();
          } else {
            resetStoryTurnState();
          }
          const payloadText = wantsLongStory
            ? buildLongStoryDirectorCue(msg.text, currentLanguage, serverMemories)
            : msg.text;
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: payloadText }],
              },
            ],
            turnComplete: true,
          });
        } catch (err) {
          console.error('[text input error]', err);
        }
        return;
      }

      if (msg.type === 'stop') {
        isClosing = true;
        closeLiveSession();
        isClosing = false;
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      closeLiveSession();
    });
  });

  let vitePromise: Promise<import('vite').ViteDevServer> | null = null;

  if (process.env.NODE_ENV !== 'production') {
    // Initialize Vite middleware in parallel so port 3000 binds immediately for health checks
    // and avoid HMR WebSocket port 24678 conflicts on rapid restarts.
    vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
        },
        appType: 'spa',
      })
    );
    vitePromise.catch((err) => {
      console.error('[vite middleware init error]', err);
    });

    app.use((req, res, next) => {
      if (!vitePromise) return next();
      vitePromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch((err) => next(err));
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BuddyBear AI server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = () => {
    wss.close();
    server.close();
    if (vitePromise) {
      vitePromise.then((vite) => vite.close()).catch(() => {});
    }
  };
  process.once('SIGTERM', gracefulShutdown);
  process.once('SIGINT', gracefulShutdown);
}

startServer();
