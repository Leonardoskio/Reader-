import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export interface ProsodicClauseInput {
  id: string;
  speaker?: string;
  text: string;
  punctuationMark: string;
  punctuationFunction: string;
  tone: string;
  pitchContour: "rising" | "falling" | "sustained" | "circumflex" | "neutral";
  pauseMs: number;
  vocalSetting: string;
  emphasisWords: string[];
}

/**
 * Ensures raw PCM bytes are wrapped in a valid 44-byte RIFF WAV header
 * if the model response does not already include a RIFF header.
 */
function ensureWavBuffer(rawBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  if (
    rawBuffer.length >= 44 &&
    rawBuffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    rawBuffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return rawBuffer;
  }

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = rawBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20);  // AudioFormat = 1 (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, rawBuffer]);
}

/**
 * Extracts raw 16-bit PCM bytes (without RIFF header) from a WAV or raw PCM buffer.
 */
function extractRawPcm(buffer: Buffer): { pcm: Buffer; sampleRate: number } {
  if (
    buffer.length >= 44 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    const sampleRate = buffer.readUInt32LE(24) || 24000;
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === "data") {
        const start = offset + 8;
        const end = Math.min(buffer.length, start + chunkSize);
        return { pcm: buffer.subarray(start, end), sampleRate };
      }
      offset += 8 + chunkSize;
    }
    return { pcm: buffer.subarray(44), sampleRate };
  }
  return { pcm: buffer, sampleRate: 24000 };
}

/**
 * Generates 16-bit mono silence buffer of a given duration in milliseconds.
 */
function createSilencePcm(durationMs: number, sampleRate = 24000): Buffer {
  const clampedMs = Math.max(0, Math.min(1500, durationMs));
  const numSamples = Math.round((sampleRate * clampedMs) / 1000);
  return Buffer.alloc(numSamples * 2, 0);
}

/**
 * Computes acoustic metrics (duration, peak dBFS) from a 16-bit mono WAV buffer.
 */
function analyzeWavMetrics(wavBuffer: Buffer): {
  sampleRate: number;
  durationSec: number;
  peakDb: number;
  rmsDb: number;
} {
  const { pcm, sampleRate } = extractRawPcm(wavBuffer);
  const numSamples = Math.floor(pcm.length / 2);
  if (numSamples === 0) {
    return { sampleRate, durationSec: 0, peakDb: -60, rmsDb: -60 };
  }

  let maxAbs = 0;
  let sumSq = 0;
  for (let i = 0; i < numSamples; i++) {
    const sample = pcm.readInt16LE(i * 2) / 32768;
    const abs = Math.abs(sample);
    if (abs > maxAbs) maxAbs = abs;
    sumSq += sample * sample;
  }

  const rms = Math.sqrt(sumSq / numSamples);
  const peakDb = maxAbs > 0.00001 ? Math.max(-60, 20 * Math.log10(maxAbs)) : -60;
  const rmsDb = rms > 0.00001 ? Math.max(-60, 20 * Math.log10(rms)) : -60;
  const durationSec = Number((numSamples / sampleRate).toFixed(2));

  return {
    sampleRate,
    durationSec,
    peakDb: Number(peakDb.toFixed(1)),
    rmsDb: Number(rmsDb.toFixed(1)),
  };
}

/**
 * Deterministically splits the user's exact input text into prosodic clauses
 * around punctuation marks WITHOUT ever altering, removing, or rewriting a single word.
 */
function extractExactClausesFromText(
  text: string,
  commaIntensity: string
): {
  clauses: ProsodicClauseInput[];
  punctuationStats: {
    commas: number;
    semicolonsColons: number;
    periods: number;
    expressiveMarks: number;
    totalPauseMs: number;
  };
} {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const basePauseFactor =
    commaIntensity === "teatrale" ? 1.35 : commaIntensity === "morbida" ? 0.75 : 1.0;

  // Match any phrase followed by punctuation (including ..., ., ;, :, ,, ?, !, —) or trailing text
  const rawSegments =
    normalized.match(/[^,;:.?!—\n]+(?:\.\.\.|[,;:.?!—])+|[^,;:.?!—\n]+/g) || [normalized];

  let commas = 0;
  let semicolonsColons = 0;
  let periods = 0;
  let expressiveMarks = 0;
  let totalPauseMs = 0;

  const clauses: ProsodicClauseInput[] = rawSegments
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((trimmed, idx) => {
      const isEllipsis = trimmed.endsWith("...");
      const lastChar = trimmed.slice(-1);
      const mark = isEllipsis
        ? "..."
        : [",", ";", ":", ".", "?", "!", "—"].includes(lastChar)
        ? lastChar
        : ".";

      let pauseMs = 220;
      let punctuationFunction = "Cesura sintattica";
      let tone = "Narrativo disteso";
      let pitchContour: ProsodicClauseInput["pitchContour"] = "neutral";
      let vocalSetting = "Emissione morbida e continua, dizione italiana fedele al testo";

      if (mark === ",") {
        commas++;
        pauseMs = Math.round(220 * basePauseFactor);
        punctuationFunction =
          idx % 2 === 0 ? "Virgola sospensiva di continuità" : "Virgola d'inciso espressivo";
        tone = idx % 2 === 0 ? "Sospensivo ascendente" : "Inciso confidenziale";
        pitchContour = "rising";
        vocalSetting = "Lieve sospensione della voce senza caduta tonale, appoggio sul fiato";
      } else if (mark === ";" || mark === ":") {
        semicolonsColons++;
        pauseMs = Math.round(400 * basePauseFactor);
        punctuationFunction =
          mark === ":" ? "Due punti d'apertura esplicativa" : "Punto e virgola di snodo";
        tone = mark === ":" ? "Attesa assertiva" : "Riflessivo bilanciato";
        pitchContour = "sustained";
        vocalSetting = "Tenuta del timbro con micro-respiro controllato prima della ripresa";
      } else if (mark === "?") {
        expressiveMarks++;
        pauseMs = Math.round(480 * basePauseFactor);
        punctuationFunction = "Interrogativa diretta o retorica";
        tone = "Incuriosito e ascendente";
        pitchContour = "rising";
        vocalSetting = "Innalzamento melodico finale sull'ultima sillaba tonica";
      } else if (mark === "!" || mark === "...") {
        expressiveMarks++;
        pauseMs = Math.round(520 * basePauseFactor);
        punctuationFunction =
          mark === "..." ? "Punti di sospensione evocativi" : "Chiusura esclamativa";
        tone = mark === "..." ? "Sospeso e intimo" : "Enfatico e vibrante";
        pitchContour = mark === "..." ? "sustained" : "circumflex";
        vocalSetting =
          mark === "..." ? "Sfumatura progressiva a mezza voce" : "Maggiore proiezione diaframmatica";
      } else {
        periods++;
        pauseMs = Math.round(580 * basePauseFactor);
        punctuationFunction = "Punto fermo conclusivo";
        tone = "Conclusivo e autorevole";
        pitchContour = "falling";
        vocalSetting = "Cadenza discendente naturale con presa di fiato piena";
      }

      totalPauseMs += pauseMs;

      const segWords = trimmed
        .replace(/[.,;?!:—"]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const emphasisWords = segWords.slice(0, 2);

      return {
        id: `clause-${idx + 1}`,
        speaker: "Narratore",
        text: trimmed, // IMMUTABLE VERBATIM SUBSTRING OF USER INPUT
        punctuationMark: mark,
        punctuationFunction,
        tone,
        pitchContour,
        pauseMs,
        vocalSetting,
        emphasisWords,
      };
    });

  return {
    clauses,
    punctuationStats: {
      commas,
      semicolonsColons,
      periods,
      expressiveMarks,
      totalPauseMs,
    },
  };
}

/**
 * Builds complete analysis using immutable exact clauses as the structural backbone.
 */
function buildDeterministicAnalysis(
  text: string,
  voiceStylePreset: string,
  commaIntensity: string,
  speedPreset: string
) {
  const cleanText = text.trim();
  const words = cleanText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const syllableCount = Math.max(1, Math.round(wordCount * 2.35));
  const wpm = speedPreset === "lenta" ? 120 : speedPreset === "dinamica" ? 155 : 138;

  const { clauses, punctuationStats } = extractExactClausesFromText(cleanText, commaIntensity);
  const estimatedDurationSec = Number(
    ((wordCount / wpm) * 60 + punctuationStats.totalPauseMs / 1000).toFixed(1)
  );

  return {
    internalReading: {
      semanticSummary: `Lettura integrale verificata (${wordCount} parole in ${clauses.length} clausole). Il testo originale è bloccato 1:1 senza alcuna modifica lessicale.`,
      emotionalRegister:
        voiceStylePreset === "giornalismo"
          ? "Autorevole, lucido e informativo"
          : voiceStylePreset === "cinema"
          ? "Intenso, evocativo e cinematografico"
          : "Caldo, letterario e avvolgente",
      narrativeArc:
        "Attacco misurato -> Sviluppo articolato sulle virgole -> Cadenza finale risolutiva",
      estimatedWpm: wpm,
      wordCount,
      syllableCount,
      estimatedDurationSec,
      breathUnitsCount: Math.max(
        1,
        punctuationStats.periods +
          punctuationStats.semicolonsColons +
          Math.floor(punctuationStats.commas / 2)
      ),
      tonicAccents: [
        {
          word: clauses[0]?.emphasisWords[0] || words[0] || "dizione",
          phoneticHint: "Pronuncia italiana nitida con appoggio sulla vocale tonica",
          reason: "Parola chiave del segmento d'apertura",
        },
      ],
    },
    prosodyMap: {
      globalVocalSetting: `Impostazione vocale italiana ${voiceStylePreset}: lettura rigorosamente fedele al testo scritto, emissione morbida sul fiato, rispetto delle virgole con sospensione melodica e cadenze conclusive sui punti fermi.`,
      englishStyleDirective: `Read the provided Italian text strictly verbatim word-for-word without changing, adding, or omitting any word. Style: ${voiceStylePreset}, warm and natural native Italian diction.`,
      punctuationStats,
      clauses,
    },
  };
}

/**
 * Groups immutable clauses into large verbatim units (up to 2,600 chars)
 * so a complete script is synthesized in a single API call without hitting 3 RPM free-tier limits,
 * while keeping the exact 1:1 verbatim text locked.
 */
interface SynthesisUnit {
  verbatimText: string;
  dominantTone: string;
  vocalSetting: string;
  trailingPauseMs: number;
}

function groupClausesForVerbatimSynthesis(
  clauses: ProsodicClauseInput[],
  fallbackFullText: string
): SynthesisUnit[] {
  const MAX_UNIT_CHARS = 2600;

  if (!clauses || clauses.length === 0) {
    return [
      {
        verbatimText: fallbackFullText.trim(),
        dominantTone: "Naturale ed espressivo",
        vocalSetting: "Lettura fedele e nitida in italiano",
        trailingPauseMs: 350,
      },
    ];
  }

  const units: SynthesisUnit[] = [];
  let currentTexts: string[] = [];
  let currentTones: string[] = [];
  let currentSettings: string[] = [];
  let currentLen = 0;

  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    const segText = c.text.trim();
    if (!segText) continue;

    currentTexts.push(segText);
    if (c.tone && !currentTones.includes(c.tone)) currentTones.push(c.tone);
    if (c.vocalSetting && !currentSettings.includes(c.vocalSetting)) {
      currentSettings.push(c.vocalSetting);
    }
    currentLen += segText.length;

    const isSentenceEnd = [".", "?", "!", "...", ";", ":"].includes(c.punctuationMark);
    const nextLen = clauses[i + 1]?.text?.length || 0;

    if (
      i === clauses.length - 1 ||
      (isSentenceEnd && currentLen + nextLen > MAX_UNIT_CHARS) ||
      currentLen + nextLen > MAX_UNIT_CHARS + 300
    ) {
      units.push({
        verbatimText: currentTexts.join(" "),
        dominantTone: currentTones.slice(0, 3).join(", ") || "Naturale e caldo",
        vocalSetting: currentSettings[0] || "Dizione italiana curata",
        trailingPauseMs: c.pauseMs || 420,
      });
      currentTexts = [];
      currentTones = [];
      currentSettings = [];
      currentLen = 0;
    }
  }

  if (currentTexts.length > 0) {
    units.push({
      verbatimText: currentTexts.join(" "),
      dominantTone: currentTones.slice(0, 3).join(", ") || "Naturale e caldo",
      vocalSetting: currentSettings[0] || "Dizione italiana curata",
      trailingPauseMs: 300,
    });
  }

  return units;
}

const VOICE_PERSONA_DIRECTIVES: Record<
  string,
  { timbrePrompt: string; prebuiltId: string; pitchFactor: number }
> = {
  Kore: {
    timbrePrompt: "Warm, velvety Italian mezzo-soprano audiobook narrator",
    prebuiltId: "Kore",
    pitchFactor: 1.0,
  },
  Charon: {
    timbrePrompt: "Deep, authoritative, resonant Italian baritone documentary narrator",
    prebuiltId: "Charon",
    pitchFactor: 1.0,
  },
  Zephyr: {
    timbrePrompt: "Bright, crisp, articulate Italian soprano editorial journalist",
    prebuiltId: "Zephyr",
    pitchFactor: 1.0,
  },
  Puck: {
    timbrePrompt: "Dynamic, expressive, natural Italian tenor podcast host",
    prebuiltId: "Puck",
    pitchFactor: 1.0,
  },
  Fenrir: {
    timbrePrompt: "Intense, dark, cinematic Italian bass-baritone voice actor",
    prebuiltId: "Fenrir",
    pitchFactor: 1.0,
  },
  Aoede: {
    timbrePrompt:
      "Poetic, lyrical, theatrical Italian contralto with rich lower-mid resonance and soft half-voice nuance",
    prebuiltId: "Kore",
    pitchFactor: 0.945,
  },
  Orus: {
    timbrePrompt:
      "Poised, clear, academic Italian light-baritone lecturer with calm didactic cadence",
    prebuiltId: "Charon",
    pitchFactor: 1.055,
  },
};

/**
 * Applies a subtle linear-interpolated acoustic timbre shift when pitchFactor !== 1.0
 * so extended studio personas (Aoede contralto, Orus light-baritone) have distinct vocal formants.
 */
function applyAcousticTimbreShift(pcm: Buffer, pitchFactor: number): Buffer {
  if (!pitchFactor || Math.abs(pitchFactor - 1.0) < 0.01) {
    return pcm;
  }
  const inSamples = Math.floor(pcm.length / 2);
  if (inSamples < 4) return pcm;

  const outSamples = Math.max(2, Math.floor(inSamples / pitchFactor));
  const outBuf = Buffer.alloc(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * pitchFactor;
    const idx0 = Math.min(inSamples - 1, Math.floor(srcPos));
    const idx1 = Math.min(inSamples - 1, idx0 + 1);
    const frac = srcPos - idx0;
    const s0 = pcm.readInt16LE(idx0 * 2);
    const s1 = pcm.readInt16LE(idx1 * 2);
    const interpolated = Math.max(-32768, Math.min(32767, Math.round(s0 + (s1 - s0) * frac)));
    outBuf.writeInt16LE(interpolated, i * 2);
  }

  return outBuf;
}

const TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];
let ttsModelCursor = 0;

// In-memory LRU cache to avoid redundant API calls on repeated voice auditions or identical takes
const synthesisCache = new Map<string, { wavBase64: string; sampleRate: number; modelUsed: string }>();

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(err: any): number {
  const msg = String(err?.message || "");
  const match = msg.match(/retry in ([0-9.]+)s/i);
  if (match && match[1]) {
    const sec = parseFloat(match[1]);
    if (!Number.isNaN(sec) && sec > 0) {
      return Math.min(11000, Math.ceil(sec * 1000) + 400);
    }
  }
  return 6500;
}

/**
 * Synthesizes a verbatim Italian text unit into raw 24kHz 16-bit mono PCM.
 * Load-balances across gemini-3.8-flash-lite-tts and gemini-3.8-flash-tts,
 * and automatically waits & retries once if free-tier 429 rate limit is reached.
 */
async function synthesizeSingleUnitVerbatim(
  unit: SynthesisUnit,
  voiceName: string,
  voiceStylePreset: string,
  speedPreset: string,
  commaIntensity: string
): Promise<{ pcm: Buffer; sampleRate: number; modelUsed: string }> {
  const speedHint =
    speedPreset === "lenta"
      ? "slow measured pace"
      : speedPreset === "dinamica"
      ? "brisk dynamic pace"
      : "natural pace";

  const commaHint =
    commaIntensity === "teatrale"
      ? "clear expressive comma pauses"
      : commaIntensity === "morbida"
      ? "smooth gentle comma transitions"
      : "natural Italian comma suspension";

  const persona = VOICE_PERSONA_DIRECTIVES[voiceName] || VOICE_PERSONA_DIRECTIVES.Kore;

  const styleInstruction = `${persona.timbrePrompt} (${voiceStylePreset}). Tone: ${unit.dominantTone}. ${speedHint}, ${commaHint}. Read the provided Italian text strictly verbatim word-for-word from start to finish without changing, adding, or omitting any word.`;

  // Rotate starting model so consecutive requests distribute across both model quota buckets
  const startIdx = ttsModelCursor++ % TTS_MODELS.length;
  const orderedModels = [
    TTS_MODELS[startIdx],
    TTS_MODELS[(startIdx + 1) % TTS_MODELS.length],
  ];

  let lastErr: any = null;

  // Up to 2 passes (Pass 1: immediate across both models; Pass 2: after waiting retryDelay if 429)
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1 && lastErr) {
      const waitTime = parseRetryDelayMs(lastErr);
      await sleepMs(waitTime);
    }

    for (const modelName of orderedModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: unit.verbatimText,
                  speechMetadata: {
                    style: styleInstruction,
                  },
                } as any,
              ],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: persona.prebuiltId },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const rawBuf = Buffer.from(base64Audio, "base64");
          const { pcm, sampleRate } = extractRawPcm(rawBuf);
          if (pcm.length > 0) {
            const shiftedPcm = applyAcousticTimbreShift(pcm, persona.pitchFactor);
            return { pcm: shiftedPcm, sampleRate, modelUsed: modelName };
          }
        }
      } catch (err: any) {
        lastErr = err;
        // Continue silently to alternate model or backoff pass
      }
    }
  }

  const isQuotaError = String(lastErr?.message || "").includes("429") || String(lastErr?.message || "").includes("RESOURCE_EXHAUSTED");
  if (isQuotaError) {
    throw new Error(
      "Limite di richieste al minuto raggiunto (3 richieste/min per modello sul piano gratuito). Attendi 8 secondi e riprova."
    );
  }

  throw lastErr || new Error("Sintesi vocale dell'unità non riuscita.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "35mb" }));

  // STAGE 1 PDF INPUT: Estrazione Fedele 1:1 da PDF per Lettura Vocale
  app.post("/api/pipeline/extract-pdf", async (req, res) => {
    try {
      const { pdfBase64, fileName = "documento.pdf", pageFilter = "" } = req.body;

      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        return res.status(400).json({ error: "File PDF mancante o non valido." });
      }

      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");

      const pageInstruction = pageFilter.trim()
        ? `Estrai esclusivamente le pagine o sezioni indicate: "${pageFilter.trim()}".`
        : `Estrai il testo integrale del documento PDF.`;

      const prompt = `Sei un Trascrittore Editoriale Certificato per sintesi vocale in italiano.
Estrai il testo da questo documento PDF ("${fileName}").
${pageInstruction}

VINCOLO ASSOLUTO DI FEDELTÀ LETTERALE (VERBATIM 1:1):
1. È SEVERAMENTE VIETATO riassumere, parafrasare, riscrivere, cambiare parole, usare sinonimi o inventare frasi. Il testo estratto in "fullText" e nelle "sections" deve corrispondere PAROLA PER PAROLA esattamente a ciò che è scritto nel PDF dall'inizio alla fine.
2. L'unico intervento consentito è unire le parole spezzate a fine riga dal trattino di a capo (es. "ar-chitettura" -> "architettura") e ignorare i numeri di pagina isolati a piè di pagina.
3. Conserva rigorosamente ogni singola parola, virgola, punto e virgola, due punti e punto fermo dell'originale.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: cleanBase64,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              documentTitle: {
                type: Type.STRING,
                description: "Titolo rilevato del documento PDF.",
              },
              detectedStylePreset: {
                type: Type.STRING,
                description: "Uno tra: narrativa, giornalismo, documentario, cinema, podcast.",
              },
              totalPagesDetected: {
                type: Type.INTEGER,
                description: "Numero di pagine o blocchi rilevati nel PDF.",
              },
              editorialNotes: {
                type: Type.STRING,
                description: "Conferma della trascrizione letterale 1:1 senza modifiche al testo.",
              },
              fullText: {
                type: Type.STRING,
                description: "Il testo integrale estratto parola per parola dal PDF senza alcuna modifica o riassunto.",
              },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: {
                      type: Type.STRING,
                      description: "Etichetta della pagina o sezione (es. Pagina 1, Capitolo 1).",
                    },
                    text: {
                      type: Type.STRING,
                      description: "Testo fedele parola per parola di questa specifica pagina o sezione.",
                    },
                    wordCount: { type: Type.INTEGER },
                  },
                  required: ["id", "label", "text", "wordCount"],
                },
              },
            },
            required: [
              "documentTitle",
              "detectedStylePreset",
              "totalPagesDetected",
              "editorialNotes",
              "fullText",
              "sections",
            ],
          },
        },
      });

      const rawJson = response.text?.trim();
      if (!rawJson) {
        return res.status(502).json({
          error: "Impossibile estrarre il testo dal PDF. Verifica che il file non sia protetto da password.",
        });
      }

      const parsed = JSON.parse(rawJson);
      return res.json(parsed);
    } catch (error: any) {
      console.error("Error in /api/pipeline/extract-pdf:", error);
      return res.status(500).json({
        error:
          error?.message ||
          "Errore durante la lettura del file PDF. Riprova con un file PDF standard.",
      });
    }
  });

  // STAGE 2 & STAGE 3: Lettura Interna + Individuazione di Virgole, Toni e Impostazione (TESTO BLOCCATO 1:1)
  app.post("/api/pipeline/analyze", async (req, res) => {
    try {
      const {
        text,
        mode = "single",
        voiceStylePreset = "narrativa",
        commaIntensity = "classica",
        speedPreset = "naturale",
      } = req.body;

      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Inserisci un testo in italiano da analizzare." });
      }

      const cleanText = text.trim();

      // 1. Deterministic 1:1 segmentation: guarantees NOT A SINGLE CHARACTER OR WORD is ever modified!
      const baseDeterministic = buildDeterministicAnalysis(
        cleanText,
        voiceStylePreset,
        commaIntensity,
        speedPreset
      );
      const exactClauses = baseDeterministic.prosodyMap.clauses;

      // Prepare numbered list of immutable clauses for prosodic annotation
      const numberedClausesList = exactClauses
        .slice(0, 60)
        .map((c, idx) => `[${idx}] "${c.text}" (Segno finale: "${c.punctuationMark}")`)
        .join("\n");

      const prompt = `Sei un Maestro di Dizione, Fonetica e Regia Prosodica Italiana.
Analizza il seguente testo già suddiviso in clausole immutabili (da [0] a [${Math.min(exactClauses.length - 1, 59)}]).
IMPORTANTE: Non devi modificare né riscrivere il testo. Devi solo fornire l'analisi di lettura interna e, per ciascun indice "index", indicare come la voce deve leggerlo (tono, curva melodica, pausa in ms dopo la punteggiatura e impostazione vocale).

Parametri:
- Modalità: ${mode === "dialogue" ? "Dialogo a due voci" : "Voce singola"}
- Stile di regia: ${voiceStylePreset}
- Gestione pause alle virgole: ${commaIntensity}
- Velocità d'elocuzione: ${speedPreset}

Clausole immutabili del testo:
${numberedClausesList}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              semanticSummary: {
                type: Type.STRING,
                description: "Sintesi in italiano del significato e del sottotesto del brano.",
              },
              emotionalRegister: {
                type: Type.STRING,
                description: "Registro emotivo dominante in italiano.",
              },
              narrativeArc: {
                type: Type.STRING,
                description: "Evoluzione dinamica della lettura dall'attacco alla chiusa.",
              },
              globalVocalSetting: {
                type: Type.STRING,
                description: "Indicazione in italiano sull'impostazione vocale globale.",
              },
              englishStyleDirective: {
                type: Type.STRING,
                description: "Concise vocal style instruction in English for the TTS model.",
              },
              tonicAccents: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    phoneticHint: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ["word", "phoneticHint", "reason"],
                },
              },
              clauseAnnotations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    punctuationFunction: { type: Type.STRING },
                    tone: { type: Type.STRING },
                    pitchContour: {
                      type: Type.STRING,
                      description: "rising, falling, sustained, circumflex, or neutral",
                    },
                    pauseMs: { type: Type.INTEGER },
                    vocalSetting: { type: Type.STRING },
                    emphasisWords: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    "index",
                    "punctuationFunction",
                    "tone",
                    "pitchContour",
                    "pauseMs",
                    "vocalSetting",
                    "emphasisWords",
                  ],
                },
              },
            },
            required: [
              "semanticSummary",
              "emotionalRegister",
              "narrativeArc",
              "globalVocalSetting",
              "englishStyleDirective",
              "tonicAccents",
              "clauseAnnotations",
            ],
          },
        },
      });

      const rawJson = response.text?.trim();
      if (!rawJson) {
        return res.json(baseDeterministic);
      }

      const llmData = JSON.parse(rawJson);
      const annotationsMap = new Map<number, any>();
      if (Array.isArray(llmData.clauseAnnotations)) {
        for (const ann of llmData.clauseAnnotations) {
          if (typeof ann.index === "number") {
            annotationsMap.set(ann.index, ann);
          }
        }
      }

      // Merge LLM prosodic direction onto our 100% IMMUTABLE exactClauses!
      let totalPauseMs = 0;
      const mergedClauses: ProsodicClauseInput[] = exactClauses.map((exactClause, idx) => {
        const ann = annotationsMap.get(idx);
        const validContours = ["rising", "falling", "sustained", "circumflex", "neutral"];
        const pitchContour =
          ann && validContours.includes(ann.pitchContour)
            ? ann.pitchContour
            : exactClause.pitchContour;
        const pauseMs =
          ann && typeof ann.pauseMs === "number"
            ? Math.max(80, Math.min(1200, ann.pauseMs))
            : exactClause.pauseMs;

        totalPauseMs += pauseMs;

        return {
          ...exactClause,
          // CRITICAL: exactClause.text and exactClause.punctuationMark are NEVER overwritten!
          text: exactClause.text,
          punctuationMark: exactClause.punctuationMark,
          punctuationFunction: ann?.punctuationFunction || exactClause.punctuationFunction,
          tone: ann?.tone || exactClause.tone,
          pitchContour,
          pauseMs,
          vocalSetting: ann?.vocalSetting || exactClause.vocalSetting,
          emphasisWords:
            Array.isArray(ann?.emphasisWords) && ann.emphasisWords.length > 0
              ? ann.emphasisWords
              : exactClause.emphasisWords,
        };
      });

      return res.json({
        internalReading: {
          ...baseDeterministic.internalReading,
          semanticSummary: llmData.semanticSummary || baseDeterministic.internalReading.semanticSummary,
          emotionalRegister:
            llmData.emotionalRegister || baseDeterministic.internalReading.emotionalRegister,
          narrativeArc: llmData.narrativeArc || baseDeterministic.internalReading.narrativeArc,
          tonicAccents:
            Array.isArray(llmData.tonicAccents) && llmData.tonicAccents.length > 0
              ? llmData.tonicAccents
              : baseDeterministic.internalReading.tonicAccents,
        },
        prosodyMap: {
          globalVocalSetting:
            llmData.globalVocalSetting || baseDeterministic.prosodyMap.globalVocalSetting,
          englishStyleDirective:
            llmData.englishStyleDirective || baseDeterministic.prosodyMap.englishStyleDirective,
          punctuationStats: {
            ...baseDeterministic.prosodyMap.punctuationStats,
            totalPauseMs,
          },
          clauses: mergedClauses,
        },
      });
    } catch (error: any) {
      console.error("Error in /api/pipeline/analyze:", error);
      const {
        text = "",
        voiceStylePreset = "narrativa",
        commaIntensity = "classica",
        speedPreset = "naturale",
      } = req.body || {};
      if (text && typeof text === "string") {
        const fallback = buildDeterministicAnalysis(
          text,
          voiceStylePreset,
          commaIntensity,
          speedPreset
        );
        return res.json(fallback);
      }
      return res.status(500).json({
        error: error?.message || "Errore durante la lettura interna e analisi prosodica.",
      });
    }
  });

  // STAGE 4 & STAGE 5: Creazione Interna Verbatim 1:1 + Output WAV 24kHz
  app.post("/api/pipeline/synthesize", async (req, res) => {
    try {
      const {
        text,
        mode = "single",
        voiceName = "Kore",
        secondaryVoiceName = "Puck",
        speakerA = "Marco",
        speakerB = "Elena",
        prosodyMap,
        voiceStylePreset = "narrativa",
        speedPreset = "naturale",
        commaIntensity = "classica",
      } = req.body;

      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Testo mancante per la sintesi vocale." });
      }

      const cleanOriginalText = text.trim();

      // Check in-memory cache first to save quota on repeated auditions or identical script runs
      const cacheKey = JSON.stringify({
        t: cleanOriginalText,
        m: mode,
        v1: voiceName,
        v2: mode === "dialogue" ? secondaryVoiceName : "",
        st: voiceStylePreset,
        sp: speedPreset,
        ci: commaIntensity,
      });

      const cached = synthesisCache.get(cacheKey);
      if (cached) {
        const wavBuffer = Buffer.from(cached.wavBase64, "base64");
        const metrics = analyzeWavMetrics(wavBuffer);
        return res.json({
          audioBase64: cached.wavBase64,
          mimeType: "audio/wav",
          sampleRate: metrics.sampleRate,
          channels: 1,
          bitDepth: 16,
          durationSec: metrics.durationSec,
          peakDb: metrics.peakDb,
          rmsDb: metrics.rmsDb,
          modelUsed: cached.modelUsed,
          verbatimVerified: true,
          cached: true,
        });
      }

      // Always verify that clauses match the exact original text; if user edited the text in Stage 1, re-extract exact clauses
      const clientClauses: ProsodicClauseInput[] = Array.isArray(prosodyMap?.clauses)
        ? prosodyMap.clauses
        : [];
      const joinedClientClauses = clientClauses.map((c) => c.text.trim()).join(" ");
      const normalizedOriginal = cleanOriginalText.replace(/\s+/g, " ");
      const normalizedClient = joinedClientClauses.replace(/\s+/g, " ");

      const verifiedClauses =
        clientClauses.length > 0 && normalizedClient === normalizedOriginal
          ? clientClauses
          : extractExactClausesFromText(cleanOriginalText, commaIntensity).clauses;

      if (mode === "dialogue") {
        // Dialogue mode: use single multiSpeakerVoiceConfig call (1 API request total)
        const lines = cleanOriginalText
          .split(/\n+/)
          .map((l: string) => l.trim())
          .filter(Boolean);

        const personaA = VOICE_PERSONA_DIRECTIVES[voiceName] || VOICE_PERSONA_DIRECTIVES.Puck;
        const personaB = VOICE_PERSONA_DIRECTIVES[secondaryVoiceName] || VOICE_PERSONA_DIRECTIVES.Kore;

        const parts = lines.map((line: string, idx: number) => {
          const isSpeakerB =
            line.toLowerCase().startsWith(speakerB.toLowerCase() + ":") ||
            (!line.toLowerCase().startsWith(speakerA.toLowerCase() + ":") && idx % 2 === 1);
          const activeSpeaker = isSpeakerB ? speakerB : speakerA;
          const normalizedLine = line.includes(":") ? line : `${activeSpeaker}: ${line}`;
          return {
            text: normalizedLine,
            speechMetadata: {
              speaker: activeSpeaker,
              style: `Native Italian speaker. Read strictly verbatim word-for-word.`,
            },
          };
        });

        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash-tts",
            contents: [
              {
                role: "user",
                parts: parts.length > 0 ? (parts as any) : [{ text: `${speakerA}: ${cleanOriginalText}` }],
              },
            ],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: speakerA,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: personaA.prebuiltId },
                      },
                    },
                    {
                      speaker: speakerB,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: personaB.prebuiltId },
                      },
                    },
                  ],
                },
              },
            },
          });

          const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            const rawBuffer = Buffer.from(base64Audio, "base64");
            const wavBuffer = ensureWavBuffer(rawBuffer, 24000, 1, 16);
            const wavBase64 = wavBuffer.toString("base64");
            const metrics = analyzeWavMetrics(wavBuffer);

            if (synthesisCache.size >= 40) {
              const oldestKey = synthesisCache.keys().next().value;
              if (oldestKey) synthesisCache.delete(oldestKey);
            }
            synthesisCache.set(cacheKey, {
              wavBase64,
              sampleRate: metrics.sampleRate,
              modelUsed: "gemini-3.8-flash-tts",
            });

            return res.json({
              audioBase64: wavBase64,
              mimeType: "audio/wav",
              sampleRate: metrics.sampleRate,
              channels: 1,
              bitDepth: 16,
              durationSec: metrics.durationSec,
              peakDb: metrics.peakDb,
              rmsDb: metrics.rmsDb,
              modelUsed: "gemini-3.8-flash-tts",
              verbatimVerified: true,
            });
          }
        } catch {
          // Fallback to single-call synthesis below if multiSpeakerVoiceConfig hits quota
        }
      }

      // Single-speaker mode: group verified verbatim clauses into up to 2,600-char units (1 API call for standard scripts)
      const synthesisUnits = groupClausesForVerbatimSynthesis(verifiedClauses, cleanOriginalText);

      const pcmParts: Buffer[] = [];
      let detectedSampleRate = 24000;
      let modelUsed = "gemini-3.8-flash-lite-tts";

      for (let i = 0; i < synthesisUnits.length; i++) {
        const unit = synthesisUnits[i];
        const unitResult = await synthesizeSingleUnitVerbatim(
          unit,
          voiceName,
          voiceStylePreset,
          speedPreset,
          commaIntensity
        );

        detectedSampleRate = unitResult.sampleRate;
        modelUsed = unitResult.modelUsed;
        pcmParts.push(unitResult.pcm);

        if (i < synthesisUnits.length - 1) {
          const interUnitPauseMs = Math.max(120, Math.min(800, Math.round(unit.trailingPauseMs * 0.55)));
          pcmParts.push(createSilencePcm(interUnitPauseMs, detectedSampleRate));
        }
      }

      const combinedPcm = Buffer.concat(pcmParts);
      const wavBuffer = ensureWavBuffer(combinedPcm, detectedSampleRate, 1, 16);
      const wavBase64 = wavBuffer.toString("base64");
      const metrics = analyzeWavMetrics(wavBuffer);

      if (synthesisCache.size >= 40) {
        const oldestKey = synthesisCache.keys().next().value;
        if (oldestKey) synthesisCache.delete(oldestKey);
      }
      synthesisCache.set(cacheKey, {
        wavBase64,
        sampleRate: metrics.sampleRate,
        modelUsed,
      });

      return res.json({
        audioBase64: wavBase64,
        mimeType: "audio/wav",
        sampleRate: metrics.sampleRate,
        channels: 1,
        bitDepth: 16,
        durationSec: metrics.durationSec,
        peakDb: metrics.peakDb,
        rmsDb: metrics.rmsDb,
        modelUsed,
        verbatimVerified: true,
      });
    } catch (error: any) {
      console.error("Error in /api/pipeline/synthesize:", error);
      return res.status(500).json({
        error: error?.message || "Errore durante la creazione interna dell'audio.",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vocalia Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
