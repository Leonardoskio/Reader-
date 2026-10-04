import React, { useState } from "react";
import { Download, Check, FileAudio, FileText } from "lucide-react";
import {
  EXPORT_FORMATS,
  ExportFormatId,
  encodeWavBlob,
  encodeMp3Blob,
  encodeFlacBlob,
  encodeWebmOpusBlob,
  renderMasteredBuffer,
  triggerBlobDownload,
  AcousticPresetId,
} from "../utils/audioExporter";
import { InternalReadingData, ProsodyMapData } from "../data/italianStudioPresets";

interface StudioExportSectionProps {
  masteredBuffer: AudioBuffer | null;
  rawBuffer: AudioBuffer | null;
  acousticPreset: AcousticPresetId;
  scriptTitle: string;
  voiceName: string;
  internalReading: InternalReadingData;
  prosodyMap: ProsodyMapData;
}

export const StudioExportSection: React.FC<StudioExportSectionProps> = ({
  masteredBuffer,
  rawBuffer,
  acousticPreset,
  scriptTitle,
  voiceName,
  internalReading,
  prosodyMap,
}) => {
  const [exportingFormat, setExportingFormat] = useState<ExportFormatId | null>(null);
  const [completedFormat, setCompletedFormat] = useState<ExportFormatId | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const activeBuffer = masteredBuffer || rawBuffer;

  const sanitizeFilename = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9àèéìòù]+/g, "-")
      .replace(/^-+|-+$/g, "") || "vocalia-master";

  const estimateFileSizeLabel = (formatId: ExportFormatId, durationSec: number): string => {
    if (!durationSec || durationSec <= 0) return "—";
    let bytes = 0;
    switch (formatId) {
      case "wav-16":
        bytes = 44 + durationSec * 24000 * 2;
        break;
      case "wav-24-48k":
        bytes = 44 + durationSec * 48000 * 3;
        break;
      case "mp3-192":
        bytes = (durationSec * 192000) / 8;
        break;
      case "flac-16":
        bytes = 42 + durationSec * 24000 * 2.01;
        break;
      case "webm-opus":
        bytes = (durationSec * 96000) / 8;
        break;
      case "prosody-txt":
        bytes = 2400;
        break;
      case "prosody-json":
        bytes = 4800;
        break;
    }
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleExport = async (formatId: ExportFormatId) => {
    setExportError(null);
    setExportingFormat(formatId);

    const baseName = `${sanitizeFilename(scriptTitle)}-${voiceName.toLowerCase()}-${acousticPreset}`;

    try {
      if (formatId === "prosody-json") {
        const payload = {
          studio: "Vocalia — Studio Italiano Text-to-Speech & Regia Prosodica",
          exportedAt: new Date().toISOString(),
          voiceName,
          acousticPreset,
          internalReading,
          prosodyMap,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        triggerBlobDownload(blob, `${baseName}-spartito.json`);
      } else if (formatId === "prosody-txt") {
        const lines: string[] = [
          `VOCALIA — SPARTITO DI REGIA PROSODICA ITALIANA`,
          `Titolo: ${scriptTitle}`,
          `Voce: ${voiceName} · Mastering: ${acousticPreset.toUpperCase()}`,
          `Registro Emotivo: ${internalReading.emotionalRegister}`,
          `Impostazione Globale: ${prosodyMap.globalVocalSetting}`,
          `Metriche: ${internalReading.wordCount} parole · ${internalReading.syllableCount} sillabe · ${internalReading.estimatedWpm} WPM`,
          ``,
          `--- MAPPATURA VIRGOLE, TONI E PAUSE ---`,
          ...prosodyMap.clauses.map(
            (c, i) =>
              `${String(i + 1).padStart(2, "0")}. "${c.text}"\n    Segno: [${c.punctuationMark}] (${c.punctuationFunction}) · Pausa: ${c.pauseMs}ms · Tono: ${c.tone}\n    Impostazione: ${c.vocalSetting}`
          ),
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        triggerBlobDownload(blob, `${baseName}-copione-regia.txt`);
      } else {
        if (!activeBuffer) {
          throw new Error("Genera prima la traccia vocale per esportare il file audio.");
        }

        if (formatId === "wav-16") {
          const blob = encodeWavBlob(activeBuffer, 16);
          triggerBlobDownload(blob, `${baseName}-24khz-16bit.wav`);
        } else if (formatId === "wav-24-48k") {
          const hdBuffer = await renderMasteredBuffer(rawBuffer || activeBuffer, acousticPreset, 48000);
          const blob = encodeWavBlob(hdBuffer, 24);
          triggerBlobDownload(blob, `${baseName}-48khz-24bit-hd.wav`);
        } else if (formatId === "mp3-192") {
          const blob = encodeMp3Blob(activeBuffer, 192);
          triggerBlobDownload(blob, `${baseName}-192kbps.mp3`);
        } else if (formatId === "flac-16") {
          const blob = encodeFlacBlob(activeBuffer);
          triggerBlobDownload(blob, `${baseName}-lossless.flac`);
        } else if (formatId === "webm-opus") {
          const { blob, ext } = await encodeWebmOpusBlob(activeBuffer);
          triggerBlobDownload(blob, `${baseName}-stream.${ext}`);
        }
      }

      setCompletedFormat(formatId);
      setTimeout(() => {
        setCompletedFormat((prev) => (prev === formatId ? null : prev));
      }, 2800);
    } catch (err: any) {
      setExportError(err?.message || "Errore durante l'esportazione del formato selezionato.");
    } finally {
      setExportingFormat(null);
    }
  };

  const durationSec = activeBuffer ? activeBuffer.duration : internalReading.estimatedDurationSec;

  return (
    <section className="bg-[#121418] border border-white/[0.08] rounded-xl p-6">
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2 pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xl font-semibold text-[#F4F4F0] font-['Cormorant_Garamond'] tracking-wide">
            05. Esportazione Audio Multi-Formato & Spartito
          </h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Esporta il master vocale con il profilo di equalizzazione attivo ({acousticPreset}) in formato non compresso, compresso o d'archivio
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-[#9CA3AF]">
          <span>Stato Master: </span>
          <strong className={activeBuffer ? "text-[#10B981]" : "text-[#E07A38]"}>
            {activeBuffer ? `Pronto per l'esportazione (${activeBuffer.duration.toFixed(1)}s)` : "In attesa di sintesi audio"}
          </strong>
        </div>
      </div>

      {exportError && (
        <div className="mt-4 p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#F4F4F0]">
          {exportError}
        </div>
      )}

      {/* Format Matrix Table / Grid */}
      <div className="divide-y divide-white/[0.06] pt-2">
        {EXPORT_FORMATS.map((fmt) => {
          const isAudio = fmt.category === "audio";
          const isDisabled = isAudio && !activeBuffer;
          const isBusy = exportingFormat === fmt.id;
          const isDone = completedFormat === fmt.id;

          return (
            <div
              key={fmt.id}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="mt-0.5 p-2 rounded-lg bg-[#0B0C0E] border border-white/[0.08] text-[#E07A38] shrink-0">
                  {isAudio ? <FileAudio className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#F4F4F0]">{fmt.label}</span>
                    <span className="text-white/20" aria-hidden="true">·</span>
                    <span className="text-xs font-mono tabular-nums text-[#E07A38] uppercase">
                      .{fmt.extension}
                    </span>
                    <span className="text-white/20" aria-hidden="true">·</span>
                    <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                      {fmt.codecDetails}
                    </span>
                  </div>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">{fmt.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-4 shrink-0">
                <span className="text-xs font-mono tabular-nums text-[#9CA3AF] w-16 text-right">
                  ~{estimateFileSizeLabel(fmt.id, durationSec)}
                </span>

                <button
                  type="button"
                  disabled={isDisabled || isBusy}
                  onClick={() => handleExport(fmt.id)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap w-40 cursor-pointer ${
                    isDone
                      ? "bg-[#10B981]/20 border border-[#10B981]/50 text-[#10B981]"
                      : isAudio
                      ? "bg-[#171A20] hover:bg-[#E07A38] hover:text-[#0B0C0E] border border-white/[0.1] text-[#F4F4F0] disabled:opacity-35 disabled:pointer-events-none"
                      : "bg-[#0B0C0E] hover:bg-white/[0.08] border border-white/[0.1] text-[#F4F4F0]"
                  }`}
                >
                  {isDone ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Esportato</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {isBusy ? "Codifica..." : `Scarica .${fmt.extension.toUpperCase()}`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
