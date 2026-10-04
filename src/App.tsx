/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from "react";
import {
  Mic,
  BookOpen,
  Sliders,
  Cpu,
  Volume2,
  Play,
  CheckCircle2,
  Loader2,
  Users,
  User,
  History,
  Trash2,
  AlertCircle,
} from "lucide-react";
import {
  STUDIO_VOICES,
  VOICE_STYLE_PRESETS,
  SAMPLE_ITALIAN_SCRIPTS,
  INITIAL_INTERNAL_READING,
  INITIAL_PROSODY_MAP,
  VoiceId,
  InternalReadingData,
  ProsodyMapData,
  ProsodicClause,
  SampleItalianScript,
} from "./data/italianStudioPresets";
import {
  AcousticPresetId,
  decodeBase64Audio,
  renderMasteredBuffer,
  computeWaveformPeaks,
} from "./utils/audioExporter";
import { StudioWaveformPlayer } from "./components/StudioWaveformPlayer";
import { ProsodyScoreInspector } from "./components/ProsodyScoreInspector";
import { StudioExportSection } from "./components/StudioExportSection";
import { PdfInputImporter, ExtractedPdfResult } from "./components/PdfInputImporter";

export type PipelineStageNumber = 1 | 2 | 3 | 4 | 5;

export interface StudioTakeRecord {
  id: string;
  title: string;
  createdAt: string;
  voiceName: VoiceId;
  secondaryVoiceName?: VoiceId;
  mode: "single" | "dialogue";
  voiceStylePreset: string;
  durationSec: number;
  peakDb: number;
  sampleRate: number;
  commasCount: number;
  audioBase64: string;
  internalReading: InternalReadingData;
  prosodyMap: ProsodyMapData;
}

const PIPELINE_STEPS: {
  stage: PipelineStageNumber;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    stage: 1,
    title: "01. Input Testo & PDF",
    subtitle: "Scrittura, PDF, voce & regia",
    icon: Mic,
  },
  {
    stage: 2,
    title: "02. Lettura Interna",
    subtitle: "Semantica, sillabe & accenti",
    icon: BookOpen,
  },
  {
    stage: 3,
    title: "03. Virgole, Toni & Impostazione",
    subtitle: "Punteggiatura, pause & curve",
    icon: Sliders,
  },
  {
    stage: 4,
    title: "04. Creazione Interna",
    subtitle: "Sintesi vocale & mastering",
    icon: Cpu,
  },
  {
    stage: 5,
    title: "05. Output & Export",
    subtitle: "Ascolto & multi-formato",
    icon: Volume2,
  },
];

export default function App() {
  // Stage 1: Input & Vocal Settings State
  const [scriptTitle, setScriptTitle] = useState<string>(SAMPLE_ITALIAN_SCRIPTS[0].title);
  const [text, setText] = useState<string>(SAMPLE_ITALIAN_SCRIPTS[0].text);
  const [mode, setMode] = useState<"single" | "dialogue">("single");
  const [voiceName, setVoiceName] = useState<VoiceId>("Kore");
  const [secondaryVoiceName, setSecondaryVoiceName] = useState<VoiceId>("Puck");
  const [speakerA, setSpeakerA] = useState<string>("Marco");
  const [speakerB, setSpeakerB] = useState<string>("Elena");
  const [voiceStylePreset, setVoiceStylePreset] = useState<string>("narrativa");
  const [commaIntensity, setCommaIntensity] = useState<"morbida" | "classica" | "teatrale">("classica");
  const [speedPreset, setSpeedPreset] = useState<"lenta" | "naturale" | "dinamica">("naturale");

  // Pipeline Execution State
  const [currentStage, setCurrentStage] = useState<PipelineStageNumber>(3);
  const [activeRunningStage, setActiveRunningStage] = useState<PipelineStageNumber | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(
    "Spartito iniziale pre-analizzato (Fasi 1–3). Premi 'Esegui Pipeline Completa' per sintetizzare e ascoltare la voce."
  );

  // Stage 2 & 3 Data: Lettura Interna & Individuazione Virgole, Toni e Impostazione
  const [internalReading, setInternalReading] = useState<InternalReadingData>(INITIAL_INTERNAL_READING);
  const [prosodyMap, setProsodyMap] = useState<ProsodyMapData>(INITIAL_PROSODY_MAP);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(INITIAL_PROSODY_MAP.clauses[0]?.id || null);

  // Stage 4 & 5 Data: Audio Buffers, Peaks, Mastering & Take History
  const [rawAudioBuffer, setRawAudioBuffer] = useState<AudioBuffer | null>(null);
  const [masteredAudioBuffer, setMasteredAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [acousticPreset, setAcousticPreset] = useState<AcousticPresetId>("valvolare");
  const [isMastering, setIsMastering] = useState<boolean>(false);
  const [audioMetrics, setAudioMetrics] = useState<{
    sampleRate: number;
    durationSec: number;
    peakDb: number;
  }>({
    sampleRate: 24000,
    durationSec: 0,
    peakDb: -1.0,
  });

  const [takesHistory, setTakesHistory] = useState<StudioTakeRecord[]>([]);
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<"all" | "Femminile" | "Maschile">("all");
  const [auditioningVoiceId, setAuditioningVoiceId] = useState<VoiceId | null>(null);

  const selectedVoiceProfile =
    STUDIO_VOICES.find((v) => v.id === voiceName) || STUDIO_VOICES[0];

  const filteredVoices = STUDIO_VOICES.filter((v) =>
    voiceGenderFilter === "all" ? true : v.genderLabel === voiceGenderFilter
  );

  // Quick audition of a voice sample in the browser
  const handleAuditionVoice = async (
    e: React.MouseEvent,
    targetVoiceId: VoiceId,
    samplePhrase: string
  ) => {
    e.stopPropagation();
    if (auditioningVoiceId) return;
    setAuditioningVoiceId(targetVoiceId);
    try {
      const response = await fetch("/api/pipeline/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: samplePhrase,
          mode: "single",
          voiceName: targetVoiceId,
          voiceStylePreset,
          speedPreset: "naturale",
          commaIntensity: "classica",
        }),
      });
      const data = await response.json();
      if (response.ok && data.audioBase64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        await audio.play();
      }
    } catch {
      // Ignore audition playback interruption
    } finally {
      setAuditioningVoiceId(null);
    }
  };

  // Apply sample script
  const handleSelectSample = (sample: SampleItalianScript) => {
    setScriptTitle(sample.title);
    setText(sample.text);
    setMode(sample.mode);
    setVoiceStylePreset(sample.voiceStylePreset);
    setVoiceName(sample.recommendedVoice);
    if (sample.secondaryVoice) setSecondaryVoiceName(sample.secondaryVoice);
    if (sample.speakerA) setSpeakerA(sample.speakerA);
    if (sample.speakerB) setSpeakerB(sample.speakerB);
    setPipelineError(null);
    setStatusMessage(`Caricato brano "${sample.title}". Avvia la pipeline per eseguire lettura interna e sintesi.`);
  };

  // Apply style preset defaults
  const handleSelectStylePreset = (presetId: string) => {
    setVoiceStylePreset(presetId);
    const found = VOICE_STYLE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setVoiceName(found.defaultVoice);
      setCommaIntensity(found.defaultComma);
      setSpeedPreset(found.defaultSpeed);
    }
  };

  // Update a single clause in Stage 3 (Virgole, Toni e Impostazione)
  const handleUpdateClause = useCallback((clauseId: string, updates: Partial<ProsodicClause>) => {
    setProsodyMap((prev) => {
      const updatedClauses = prev.clauses.map((c) =>
        c.id === clauseId ? { ...c, ...updates } : c
      );
      const totalPauseMs = updatedClauses.reduce((acc, c) => acc + (c.pauseMs || 0), 0);
      return {
        ...prev,
        punctuationStats: {
          ...prev.punctuationStats,
          totalPauseMs,
        },
        clauses: updatedClauses,
      };
    });
  }, []);

  const handleUpdateGlobalSetting = useCallback((newSetting: string) => {
    setProsodyMap((prev) => ({
      ...prev,
      globalVocalSetting: newSetting,
    }));
  }, []);

  // Re-master audio buffer when user changes Acoustic EQ preset
  const handleAcousticPresetChange = async (newPreset: AcousticPresetId) => {
    setAcousticPreset(newPreset);
    if (!rawAudioBuffer) return;
    setIsMastering(true);
    try {
      const mastered = await renderMasteredBuffer(rawAudioBuffer, newPreset);
      setMasteredAudioBuffer(mastered);
      setWaveformPeaks(computeWaveformPeaks(mastered.getChannelData(0), 140));
    } finally {
      setIsMastering(false);
    }
  };

  // Execute Stage 2 (Lettura Interna) & Stage 3 (Individuazione Virgole, Toni e Impostazione)
  const runAnalysisStages = async (
    overrideText?: string,
    overrideStylePreset?: string
  ): Promise<{
    reading: InternalReadingData;
    map: ProsodyMapData;
  } | null> => {
    const activeText = overrideText !== undefined ? overrideText : text;
    const activeStyle = overrideStylePreset || voiceStylePreset;

    if (!activeText.trim()) {
      setPipelineError("Inserisci un testo in italiano o carica un file PDF nella Fase 1 prima di procedere.");
      return null;
    }

    setPipelineError(null);
    setActiveRunningStage(2);
    setCurrentStage(2);
    setStatusMessage("Fase 2 in corso: Lettura interna, analisi semantica e individuazione accenti tonici...");

    try {
      const response = await fetch("/api/pipeline/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: activeText,
          mode,
          voiceStylePreset: activeStyle,
          commaIntensity,
          speedPreset,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante l'analisi prosodica del testo.");
      }

      setActiveRunningStage(3);
      setCurrentStage(3);
      setStatusMessage("Fase 3 completata: Mappatura di virgole, pause in ms, curve melodiche e impostazione vocale.");

      const reading: InternalReadingData = data.internalReading;
      const map: ProsodyMapData = data.prosodyMap;

      setInternalReading(reading);
      setProsodyMap(map);
      if (map.clauses?.[0]) {
        setActiveClauseId(map.clauses[0].id);
      }

      return { reading, map };
    } catch (err: any) {
      setPipelineError(err?.message || "Errore durante la lettura interna del testo.");
      setActiveRunningStage(null);
      return null;
    }
  };

  // Execute Stage 4 (Creazione Interna) & Stage 5 (Output Ascoltabile)
  const runSynthesisStages = async (
    overrideMap?: ProsodyMapData,
    overrideReading?: InternalReadingData,
    overrideText?: string,
    overrideTitle?: string
  ) => {
    const activeMap = overrideMap || prosodyMap;
    const activeReading = overrideReading || internalReading;
    const activeText = overrideText !== undefined ? overrideText : text;
    const activeTitle = overrideTitle || scriptTitle;

    setPipelineError(null);
    setActiveRunningStage(4);
    setCurrentStage(4);
    setStatusMessage(
      `Fase 4 in corso: Creazione interna con voce ${voiceName}, applicazione delle ${activeMap.punctuationStats.commas} virgole e mastering acustico...`
    );

    try {
      const response = await fetch("/api/pipeline/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: activeText,
          mode,
          voiceName,
          secondaryVoiceName,
          speakerA,
          speakerB,
          prosodyMap: activeMap,
          voiceStylePreset,
          speedPreset,
          commaIntensity,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante la creazione interna dell'audio.");
      }

      const { audioBuffer } = await decodeBase64Audio(data.audioBase64, 140);
      setRawAudioBuffer(audioBuffer);

      const mastered = await renderMasteredBuffer(audioBuffer, acousticPreset);
      const masteredPeaks = computeWaveformPeaks(mastered.getChannelData(0), 140);

      setMasteredAudioBuffer(mastered);
      setWaveformPeaks(masteredPeaks);
      setAudioMetrics({
        sampleRate: data.sampleRate || 24000,
        durationSec: Number(mastered.duration.toFixed(2)),
        peakDb: data.peakDb ?? -1.0,
      });

      // Record take in session history
      const newTake: StudioTakeRecord = {
        id: `take-${Date.now()}`,
        title: activeTitle || "Brano Senza Titolo",
        createdAt: new Date().toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        voiceName,
        secondaryVoiceName: mode === "dialogue" ? secondaryVoiceName : undefined,
        mode,
        voiceStylePreset,
        durationSec: Number(mastered.duration.toFixed(2)),
        peakDb: data.peakDb ?? -1.0,
        sampleRate: data.sampleRate || 24000,
        commasCount: activeMap.punctuationStats.commas,
        audioBase64: data.audioBase64,
        internalReading: activeReading,
        prosodyMap: activeMap,
      };

      setTakesHistory((prev) => [newTake, ...prev]);

      setActiveRunningStage(null);
      setCurrentStage(5);
      setStatusMessage(
        `Fase 5 pronta: Output vocale generato (${mastered.duration.toFixed(1)}s) pronto per l'ascolto e l'esportazione multi-formato.`
      );

      // Scroll smoothly to the Output Player
      const playerEl = document.getElementById("sezione-output");
      if (playerEl) {
        playerEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (err: any) {
      setPipelineError(err?.message || "Errore durante la sintesi vocale.");
      setActiveRunningStage(null);
    }
  };

  // Full 5-stage pipeline execution: Input -> Lettura Interna -> Virgole, Toni & Impostazione -> Creazione Interna -> Output
  const handleRunFullPipeline = async () => {
    const analysisResult = await runAnalysisStages();
    if (!analysisResult) return;
    await runSynthesisStages(analysisResult.map, analysisResult.reading);
  };

  // Handler when a PDF is imported or a PDF section is selected
  const handleApplyPdfContent = async (
    result: ExtractedPdfResult,
    selectedText: string,
    autoRunFullPipeline: boolean
  ) => {
    setScriptTitle(result.documentTitle);
    setText(selectedText);
    if (result.detectedStylePreset) {
      setVoiceStylePreset(result.detectedStylePreset);
    }
    setPipelineError(null);
    setStatusMessage(
      `Documento PDF "${result.fileName}" importato e pulito (${selectedText.split(/\s+/).filter(Boolean).length} parole).`
    );

    if (autoRunFullPipeline && selectedText.trim()) {
      const analysisResult = await runAnalysisStages(selectedText, result.detectedStylePreset);
      if (!analysisResult) return;
      await runSynthesisStages(
        analysisResult.map,
        analysisResult.reading,
        selectedText,
        result.documentTitle
      );
    }
  };

  // Load a previous take from Session History
  const handleLoadTake = async (take: StudioTakeRecord) => {
    setScriptTitle(take.title);
    setVoiceName(take.voiceName);
    if (take.secondaryVoiceName) setSecondaryVoiceName(take.secondaryVoiceName);
    setMode(take.mode);
    setVoiceStylePreset(take.voiceStylePreset);
    setInternalReading(take.internalReading);
    setProsodyMap(take.prosodyMap);
    if (take.prosodyMap.clauses?.[0]) {
      setActiveClauseId(take.prosodyMap.clauses[0].id);
    }

    const { audioBuffer } = await decodeBase64Audio(take.audioBase64, 140);
    setRawAudioBuffer(audioBuffer);
    const mastered = await renderMasteredBuffer(audioBuffer, acousticPreset);
    setMasteredAudioBuffer(mastered);
    setWaveformPeaks(computeWaveformPeaks(mastered.getChannelData(0), 140));
    setAudioMetrics({
      sampleRate: take.sampleRate,
      durationSec: take.durationSec,
      peakDb: take.peakDb,
    });
    setCurrentStage(5);
    setStatusMessage(`Caricato Master "${take.title}" (${take.createdAt}) nel banco d'ascolto.`);
  };

  const isBusy = activeRunningStage !== null;
  const liveWordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const liveCommaCount = (text.match(/,/g) || []).length;

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F4F4F0] flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-30 bg-[#0B0C0E]/95 backdrop-blur-md border-b border-white/[0.08] px-6 py-4 flex items-center justify-between">
        {/* Zone 1: Single Text Element Brand Wordmark */}
        <a
          href="#studio-input"
          className="text-2xl font-bold tracking-tight text-[#F4F4F0] font-['Cormorant_Garamond']"
        >
          Vocalia
        </a>

        {/* Zone 2: 4 Clean Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-[#9CA3AF]">
          <a
            href="#studio-input"
            className="hover:text-[#F4F4F0] hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            01. Input & Regia
          </a>
          <a
            href="#spartito-prosodico"
            className="hover:text-[#F4F4F0] hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            02–03. Lettura & Virgole
          </a>
          <a
            href="#sezione-output"
            className="hover:text-[#F4F4F0] hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            04–05. Ascolto & Export
          </a>
          <a
            href="#archivio-master"
            className="hover:text-[#F4F4F0] hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Archivio Take ({takesHistory.length})
          </a>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleRunFullPipeline}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E07A38] hover:bg-[#d06928] disabled:opacity-40 text-[#0B0C0E] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isBusy ? "Pipeline in Corso..." : "Esegui Pipeline Completa"}</span>
          </button>
        </div>
      </header>

      {/* MAIN STUDIO WORKSPACE CONTAINER (1440px Desktop Presence) */}
      <main className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 flex-1">
        {/* STUDIO HEADER & 5-STAGE INTERACTIVE PIPELINE MONITOR */}
        <section className="flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <p className="text-xs text-[#E07A38] font-medium mb-1">
                Studio di Sintesi Vocale e Regia Prosodica in Italiano
              </p>
              <h1 className="text-3xl sm:text-4xl font-semibold text-[#F4F4F0] font-['Cormorant_Garamond'] tracking-tight max-w-2xl">
                Dalla parola scritta alla voce viva, con controllo di virgole, toni e respiro.
              </h1>
            </div>
            <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
              <span>Flusso Operativo: </span>
              <span className="text-[#F4F4F0]">
                Input → Lettura Interna → Virgole & Toni → Creazione Interna → Output
              </span>
            </div>
          </div>

          {/* 5-Stage Pipeline Chain Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 bg-[#121418] border border-white/[0.08] rounded-xl p-3">
            {PIPELINE_STEPS.map((step) => {
              const Icon = step.icon;
              const isRunning = activeRunningStage === step.stage;
              const isCompleted =
                !isRunning &&
                (currentStage > step.stage ||
                  (step.stage === 5 && masteredAudioBuffer !== null));
              const isCurrent = currentStage === step.stage;

              return (
                <div
                  key={step.stage}
                  className={`px-3.5 py-3 rounded-lg border transition-colors flex flex-col justify-between gap-2 ${
                    isRunning
                      ? "bg-[#171A20] border-[#E07A38]"
                      : isCurrent
                      ? "bg-[#171A20] border-white/[0.16]"
                      : isCompleted
                      ? "bg-[#0B0C0E]/60 border-white/[0.06]"
                      : "bg-[#0B0C0E]/30 border-transparent opacity-65"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#F4F4F0] whitespace-nowrap">
                      {step.title}
                    </span>
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#E07A38] animate-spin shrink-0" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                    <span className="truncate">{step.subtitle}</span>
                    <span className="font-mono tabular-nums ml-2 shrink-0">
                      {isRunning ? (
                        <strong className="text-[#E07A38] font-normal">Attivo</strong>
                      ) : isCompleted ? (
                        <strong className="text-[#10B981] font-normal">Pronto</strong>
                      ) : (
                        "In coda"
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Pipeline Status & Error Readout */}
          {pipelineError ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/40 text-xs text-[#F4F4F0]">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{pipelineError}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#9CA3AF]">
              <span>{statusMessage}</span>
              <span className="font-mono tabular-nums">
                {liveWordCount} parole · {liveCommaCount} virgole nel testo corrente
              </span>
            </div>
          )}
        </section>

        {/* STAGE 1: INPUT TESTUALE & IMPOSTAZIONE BASE */}
        <section
          id="studio-input"
          className="bg-[#121418] border border-white/[0.08] rounded-xl p-6"
        >
          <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-3 pb-4 border-b border-white/[0.06]">
            <div>
              <h2 className="text-xl font-semibold text-[#F4F4F0] font-['Cormorant_Garamond'] tracking-wide">
                01. Input Testuale, Documento PDF & Cabina Voci
              </h2>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Carica un file PDF (con pulizia automatica di sillabazioni e pagine), scrivi il testo o scegli un copione d'autore
              </p>
            </div>

            {/* Sample Scripts Selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[#9CA3AF] mr-1">Copioni d'esempio:</span>
              {SAMPLE_ITALIAN_SCRIPTS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    scriptTitle === sample.title
                      ? "bg-[#171A20] border-[#E07A38]/60 text-[#F4F4F0] font-medium"
                      : "bg-[#0B0C0E] border-white/[0.08] text-[#9CA3AF] hover:text-[#F4F4F0]"
                  }`}
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          {/* PDF Input & Editorial Extraction Bar */}
          <div className="pt-5">
            <PdfInputImporter
              onApplyPdfContent={handleApplyPdfContent}
              isPipelineBusy={isBusy}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
            {/* Left 7 Columns: Italian Manuscript Editor */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  placeholder="Titolo del progetto vocale..."
                  className="bg-[#0B0C0E] border border-white/[0.08] focus:border-[#E07A38] rounded-lg px-3.5 py-2 text-sm font-medium text-[#F4F4F0] outline-none sm:w-72"
                />

                {/* Mode Switcher: Voce Singola vs Dialogo a Due Voci */}
                <div className="flex items-center gap-1 bg-[#0B0C0E] p-1 rounded-lg border border-white/[0.08] self-start">
                  <button
                    type="button"
                    onClick={() => setMode("single")}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      mode === "single"
                        ? "bg-[#171A20] text-[#F4F4F0] border border-white/[0.08]"
                        : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                    }`}
                  >
                    <User className="w-3.5 h-3.5 text-[#E07A38]" />
                    <span>Voce Singola</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("dialogue")}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      mode === "dialogue"
                        ? "bg-[#171A20] text-[#F4F4F0] border border-white/[0.08]"
                        : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#E07A38]" />
                    <span>Dialogo a Due Voci</span>
                  </button>
                </div>
              </div>

              {mode === "dialogue" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0B0C0E] border border-white/[0.06] rounded-lg p-3">
                  <div>
                    <label className="text-[11px] text-[#9CA3AF] block mb-1">
                      Interlocutore 1 (es. Marco:)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={speakerA}
                        onChange={(e) => setSpeakerA(e.target.value)}
                        className="w-28 bg-[#121418] border border-white/[0.08] rounded px-2.5 py-1 text-xs text-[#F4F4F0]"
                      />
                      <select
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value as VoiceId)}
                        className="flex-1 bg-[#121418] border border-white/[0.08] rounded px-2.5 py-1 text-xs text-[#F4F4F0]"
                      >
                        {STUDIO_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.italianTitle}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#9CA3AF] block mb-1">
                      Interlocutore 2 (es. Elena:)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={speakerB}
                        onChange={(e) => setSpeakerB(e.target.value)}
                        className="w-28 bg-[#121418] border border-white/[0.08] rounded px-2.5 py-1 text-xs text-[#F4F4F0]"
                      />
                      <select
                        value={secondaryVoiceName}
                        onChange={(e) => setSecondaryVoiceName(e.target.value as VoiceId)}
                        className="flex-1 bg-[#121418] border border-white/[0.08] rounded px-2.5 py-1 text-xs text-[#F4F4F0]"
                      >
                        {STUDIO_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.italianTitle}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Italian Script Textarea */}
              <div className="relative">
                <textarea
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Scrivi o incolla qui il testo italiano da interpretare. Usa virgole, punti e virgola, due punti e incisi per guidare il respiro della voce..."
                  className="w-full bg-[#0B0C0E] border border-white/[0.08] focus:border-[#E07A38] rounded-xl p-4 text-base text-[#F4F4F0] leading-relaxed outline-none resize-y transition-colors"
                />
              </div>

              {/* Quick Punctuation & Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#9CA3AF]">
                  <span>{text.length} caratteri</span>
                  <span aria-hidden="true">·</span>
                  <span>{liveWordCount} parole</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#E07A38]">{liveCommaCount} virgole rilevate</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#10B981]">Vincolo Letterale 1:1 Attivo (zero riscrittura)</span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isBusy || !text.trim()}
                    onClick={() => runAnalysisStages()}
                    className="px-3.5 py-2 rounded-lg bg-[#171A20] hover:bg-white/[0.08] border border-white/[0.1] disabled:opacity-40 text-xs font-medium text-[#F4F4F0] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Analizza Virgole & Toni (Fasi 1–3)
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || !text.trim()}
                    onClick={handleRunFullPipeline}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E07A38] hover:bg-[#d06928] disabled:opacity-40 text-[#0B0C0E] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>Genera Voce Completa (Fasi 1–5)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Voice Persona & Prosodic Direction Controls */}
            <div className="lg:col-span-5 lg:border-l lg:border-white/[0.06] lg:pl-6 flex flex-col justify-between gap-5">
              {/* Voice Persona Selector (Pool of 7 Voices) */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-semibold text-[#F4F4F0] block">
                      Bacino Voci Studio ({STUDIO_VOICES.length} Interpreti)
                    </label>
                    <span className="text-[11px] font-mono tabular-nums text-[#9CA3AF]">
                      {selectedVoiceProfile.register} · {selectedVoiceProfile.vocalRangeHz}
                    </span>
                  </div>

                  {/* Interactive Filter Tabs for the 7 Voices */}
                  <div className="flex items-center gap-1 bg-[#0B0C0E] p-1 rounded-lg border border-white/[0.08]">
                    {(
                      [
                        { id: "all", label: "Tutte (7)" },
                        { id: "Femminile", label: "Femminili (3)" },
                        { id: "Maschile", label: "Maschili (4)" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setVoiceGenderFilter(tab.id)}
                        className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                          voiceGenderFilter === tab.id
                            ? "bg-[#171A20] text-[#E07A38] border border-white/[0.08]"
                            : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl bg-[#0B0C0E] overflow-hidden max-h-[340px] overflow-y-auto">
                  {filteredVoices.map((voice) => {
                    const isSelected = voiceName === voice.id;
                    const isAuditioning = auditioningVoiceId === voice.id;
                    return (
                      <div
                        key={voice.id}
                        onClick={() => setVoiceName(voice.id)}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isSelected ? "bg-[#171A20]" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold ${
                                isSelected ? "text-[#E07A38]" : "text-[#F4F4F0]"
                              }`}
                            >
                              {voice.italianTitle}
                            </span>
                            <span className="text-white/20" aria-hidden="true">·</span>
                            <span className="text-[11px] font-mono tabular-nums text-[#9CA3AF]">
                              {voice.genderLabel} · {voice.register}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
                            {voice.timbre} · <span className="text-[#F4F4F0]/70">{voice.recommendedFor}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={auditioningVoiceId !== null}
                            onClick={(e) => handleAuditionVoice(e, voice.id, voice.samplePhrase)}
                            title={`Ascolta campione voce ${voice.id}`}
                            className="px-2 py-1 rounded bg-[#121418] hover:bg-[#E07A38] hover:text-[#0B0C0E] border border-white/[0.08] text-[11px] font-mono tabular-nums text-[#F4F4F0] transition-colors whitespace-nowrap cursor-pointer"
                          >
                            {isAuditioning ? "Ascolto..." : "Prova"}
                          </button>
                          <span
                            className={`text-[11px] font-mono tabular-nums w-12 text-right ${
                              isSelected ? "text-[#E07A38] font-semibold" : "text-[#9CA3AF]"
                            }`}
                          >
                            {isSelected ? "Attiva" : "Scegli"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Impostazione & Stile di Regia */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold text-[#F4F4F0]">
                  Impostazione di Regia & Carattere
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {VOICE_STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectStylePreset(preset.id)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                        voiceStylePreset === preset.id
                          ? "bg-[#171A20] border-[#E07A38] text-[#F4F4F0] font-medium"
                          : "bg-[#0B0C0E] border-white/[0.08] text-[#9CA3AF] hover:text-[#F4F4F0]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comma Suspension & Speaking Speed Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-[#9CA3AF] block mb-1.5">
                    Sensibilità alle Virgole
                  </label>
                  <div className="flex bg-[#0B0C0E] p-1 rounded-lg border border-white/[0.08]">
                    {(
                      [
                        { id: "morbida", label: "Morbida" },
                        { id: "classica", label: "Classica" },
                        { id: "teatrale", label: "Teatrale" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCommaIntensity(opt.id)}
                        className={`flex-1 py-1 text-xs rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          commaIntensity === opt.id
                            ? "bg-[#171A20] text-[#E07A38] font-medium"
                            : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-[#9CA3AF] block mb-1.5">
                    Cadenza d'Elocuzione
                  </label>
                  <div className="flex bg-[#0B0C0E] p-1 rounded-lg border border-white/[0.08]">
                    {(
                      [
                        { id: "lenta", label: "Posata" },
                        { id: "naturale", label: "Naturale" },
                        { id: "dinamica", label: "Brillante" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSpeedPreset(opt.id)}
                        className={`flex-1 py-1 text-xs rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          speedPreset === opt.id
                            ? "bg-[#171A20] text-[#E07A38] font-medium"
                            : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STAGES 4 & 5 PLAYER: OUTPUT ASCOLTABILE & WAVEFORM CON VIRGOLE */}
        <section id="sezione-output" className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-[#F4F4F0] font-['Cormorant_Garamond'] tracking-wide">
                04. Creazione Interna & Ascolto Sincronizzato
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Ascolta la resa acustica in tempo reale con indicatori di virgola sul tracciato d'onda e filtri di mastering
              </p>
            </div>
            {!masteredAudioBuffer && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runSynthesisStages()}
                className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg bg-[#E07A38]/15 hover:bg-[#E07A38]/25 border border-[#E07A38]/40 text-[#E07A38] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Sintetizza Ora lo Spartito Attivo →
              </button>
            )}
          </div>

          <StudioWaveformPlayer
            audioBuffer={masteredAudioBuffer}
            peaks={waveformPeaks}
            clauses={prosodyMap.clauses}
            activeClauseId={activeClauseId}
            onActiveClauseChange={setActiveClauseId}
            acousticPreset={acousticPreset}
            onAcousticPresetChange={handleAcousticPresetChange}
            isMastering={isMastering}
            voiceLabel={selectedVoiceProfile.italianTitle}
            sampleRate={audioMetrics.sampleRate}
            peakDb={audioMetrics.peakDb}
          />
        </section>

        {/* STAGES 2 & 3: LETTURA INTERNA & INDIVIDUAZIONE DI VIRGOLE, TONI E IMPOSTAZIONE */}
        <div id="spartito-prosodico">
          <ProsodyScoreInspector
            internalReading={internalReading}
            prosodyMap={prosodyMap}
            activeClauseId={activeClauseId}
            onSelectClause={setActiveClauseId}
            onUpdateClause={handleUpdateClause}
            onUpdateGlobalSetting={handleUpdateGlobalSetting}
            onSynthesizeWithProsody={() => runSynthesisStages()}
            isSynthesizing={activeRunningStage === 4}
            isAnalyzing={activeRunningStage === 2 || activeRunningStage === 3}
          />
        </div>

        {/* STAGE 5: MULTI-FORMAT AUDIO & SCRIPT EXPORT */}
        <StudioExportSection
          masteredBuffer={masteredAudioBuffer}
          rawBuffer={rawAudioBuffer}
          acousticPreset={acousticPreset}
          scriptTitle={scriptTitle}
          voiceName={voiceName}
          internalReading={internalReading}
          prosodyMap={prosodyMap}
        />

        {/* ARCHIVIO TAKE DI SESSIONE */}
        <section
          id="archivio-master"
          className="bg-[#121418] border border-white/[0.08] rounded-xl p-6"
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <History className="w-4 h-4 text-[#E07A38]" />
              <h2 className="text-xl font-semibold text-[#F4F4F0] font-['Cormorant_Garamond'] tracking-wide">
                Archivio Take di Sessione
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
              {takesHistory.length} registrazioni generate
            </span>
          </div>

          {takesHistory.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center gap-3">
              <p className="text-xs text-[#9CA3AF] max-w-md">
                Nessuna traccia registrata in questa sessione. Avvia la pipeline vocale per generare il primo master in italiano e confrontare diverse interpretazioni.
              </p>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleRunFullPipeline}
                className="px-4 py-2 rounded-lg bg-[#171A20] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-[#F4F4F0] transition-colors cursor-pointer"
              >
                Genera Primo Take Vocale
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06] pt-2">
              {takesHistory.map((take, idx) => (
                <div
                  key={take.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.01] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono tabular-nums text-[#9CA3AF] w-6">
                      #{takesHistory.length - idx}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#F4F4F0] truncate">
                        {take.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#9CA3AF] mt-0.5">
                        <span>Ore {take.createdAt}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#E07A38]">
                          Voce {take.voiceName}
                          {take.secondaryVoiceName ? ` + ${take.secondaryVoiceName}` : ""}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{take.commasCount} virgole</span>
                        <span aria-hidden="true">·</span>
                        <span>{take.durationSec.toFixed(1)}s</span>
                        <span aria-hidden="true">·</span>
                        <span>Picco {take.peakDb.toFixed(1)} dBFS</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleLoadTake(take)}
                      className="px-3 py-1.5 rounded-lg bg-[#171A20] hover:bg-[#E07A38] hover:text-[#0B0C0E] border border-white/[0.1] text-xs font-medium text-[#F4F4F0] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Carica nel Banco d'Ascolto
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTakesHistory((prev) => prev.filter((item) => item.id !== take.id))
                      }
                      title="Rimuovi take"
                      className="p-1.5 rounded-lg bg-[#0B0C0E] hover:bg-[#DC2626]/20 border border-white/[0.08] text-[#9CA3AF] hover:text-[#DC2626] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* QUIET EDITORIAL FOOTER */}
      <footer className="border-t border-white/[0.08] px-6 py-5 mt-8">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#9CA3AF]">
          <span>Vocalia — Studio di Sintesi Vocale e Regia Prosodica Italiana</span>
          <span>
            Catena di produzione: Input · Lettura Interna · Virgole, Toni & Impostazione · Creazione Interna · Output Multi-Formato
          </span>
        </div>
      </footer>
    </div>
  );
}
