import React from "react";
import { Sliders, RefreshCw, ArrowUpRight, ArrowDownRight, ArrowRight, CornerDownRight } from "lucide-react";
import { InternalReadingData, ProsodicClause, ProsodyMapData } from "../data/italianStudioPresets";

interface ProsodyScoreInspectorProps {
  internalReading: InternalReadingData;
  prosodyMap: ProsodyMapData;
  activeClauseId: string | null;
  onSelectClause: (id: string) => void;
  onUpdateClause: (clauseId: string, updates: Partial<ProsodicClause>) => void;
  onUpdateGlobalSetting: (newSetting: string) => void;
  onSynthesizeWithProsody: () => void;
  isSynthesizing: boolean;
  isAnalyzing: boolean;
}

const TONE_OPTIONS = [
  "Sospensivo ascendente",
  "Caldo e narrativo",
  "Inciso confidenziale a mezza voce",
  "Asseverativo misurato",
  "Profondo e risolutivo",
  "Largo e contemplativo",
  "Incuriosito e ascendente",
  "Enfatico e vibrante",
  "Scandito e ritmico",
];

export const ProsodyScoreInspector: React.FC<ProsodyScoreInspectorProps> = ({
  internalReading,
  prosodyMap,
  activeClauseId,
  onSelectClause,
  onUpdateClause,
  onUpdateGlobalSetting,
  onSynthesizeWithProsody,
  isSynthesizing,
  isAnalyzing,
}) => {
  const selectedClause =
    prosodyMap.clauses.find((c) => c.id === activeClauseId) || prosodyMap.clauses[0] || null;

  const renderPitchIcon = (contour: ProsodicClause["pitchContour"]) => {
    switch (contour) {
      case "rising":
        return <ArrowUpRight className="w-3.5 h-3.5 text-[#E07A38] inline shrink-0" />;
      case "falling":
        return <ArrowDownRight className="w-3.5 h-3.5 text-[#10B981] inline shrink-0" />;
      case "circumflex":
        return <CornerDownRight className="w-3.5 h-3.5 text-[#F59E0B] inline shrink-0" />;
      default:
        return <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF] inline shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* SECTION: FASE 2 — LETTURA INTERNA */}
      <section className="bg-[#121418] border border-white/[0.08] rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-xl font-semibold text-[#F4F4F0] font-['Cormorant_Garamond'] tracking-wide">
              02. Lettura Interna & Analisi Lessicale
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Comprensione del sottotesto semantico, calcolo metrico delle sillabe e individuazione degli accenti tonici italiani
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#9CA3AF]">
            <span>{internalReading.wordCount} parole</span>
            <span aria-hidden="true">·</span>
            <span>{internalReading.syllableCount} sillabe</span>
            <span aria-hidden="true">·</span>
            <span>{internalReading.estimatedWpm} WPM</span>
            <span aria-hidden="true">·</span>
            <span>{internalReading.breathUnitsCount} unità di fiato</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#E07A38]">~{internalReading.estimatedDurationSec}s stimati</span>
          </div>
        </div>

        {/* Semantic & Narrative Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-5 border-b border-white/[0.06]">
          <div>
            <span className="text-xs text-[#9CA3AF] block mb-1.5">Sintesi Semantica & Sottotesto</span>
            <p className="text-sm text-[#F4F4F0] leading-relaxed">{internalReading.semanticSummary}</p>
          </div>
          <div className="lg:border-l lg:border-white/[0.06] lg:pl-6">
            <span className="text-xs text-[#9CA3AF] block mb-1.5">Registro Emotivo Rilevato</span>
            <p className="text-sm font-medium text-[#E07A38] leading-relaxed">
              {internalReading.emotionalRegister}
            </p>
            <span className="text-xs text-[#9CA3AF] block mt-3 mb-1">Impostazione Vocale Globale</span>
            <input
              type="text"
              value={prosodyMap.globalVocalSetting}
              onChange={(e) => onUpdateGlobalSetting(e.target.value)}
              className="w-full bg-[#0B0C0E] border border-white/[0.08] focus:border-[#E07A38] rounded-lg px-3 py-1.5 text-xs text-[#F4F4F0] outline-none transition-colors"
              aria-label="Impostazione vocale globale"
            />
          </div>
          <div className="lg:border-l lg:border-white/[0.06] lg:pl-6">
            <span className="text-xs text-[#9CA3AF] block mb-1.5">Arco Dinamico della Lettura</span>
            <p className="text-sm text-[#F4F4F0] leading-relaxed">{internalReading.narrativeArc}</p>
          </div>
        </div>

        {/* Tonic Accents & Homographs Table */}
        <div className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[#9CA3AF]">
              Fonetica Italiana & Accenti Tonici Rilevati (aperture vocaliche è/é, ò/ó e omografi)
            </span>
          </div>
          {internalReading.tonicAccents.length > 0 ? (
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {internalReading.tonicAccents.map((item, idx) => (
                <div
                  key={`${item.word}-${idx}`}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums text-[#9CA3AF] w-5">
                      {String(idx + 1).padStart(2, "0")}.
                    </span>
                    <span className="font-semibold text-[#F4F4F0] text-sm">{item.word}</span>
                    <span className="text-white/20" aria-hidden="true">·</span>
                    <span className="text-[#E07A38] font-mono">{item.phoneticHint}</span>
                  </div>
                  <span className="text-[#9CA3AF] sm:text-right">{item.reason}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#9CA3AF]">Nessun omografo critico rilevato nel brano corrente.</p>
          )}
        </div>
      </section>

      {/* SECTION: FASE 3 — INDIVIDUAZIONE DI VIRGOLE, TONI E IMPOSTAZIONE */}
      <section className="bg-[#121418] border border-white/[0.08] rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-3 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-xl font-semibold text-[#F4F4F0] font-['Cormorant_Garamond'] tracking-wide">
              03. Individuazione di Virgole, Toni e Impostazione
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Clicca su qualsiasi segmento o virgola nello spartito per personalizzare il tono, la pausa in millisecondi e l'impostazione vocale
            </p>
          </div>

          {/* Unboxed Punctuation Statistics */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#9CA3AF]">
            <span>
              <strong className="text-[#E07A38] font-semibold">{prosodyMap.punctuationStats.commas}</strong> virgole
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#F4F4F0] font-semibold">{prosodyMap.punctuationStats.semicolonsColons}</strong> cesure (; :)
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#10B981] font-semibold">{prosodyMap.punctuationStats.periods}</strong> punti fermi
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Pause totali: <strong className="text-[#F4F4F0]">{(prosodyMap.punctuationStats.totalPauseMs / 1000).toFixed(2)}s</strong>
            </span>
          </div>
        </div>

        {/* Two-column layout: Interactive Annotated Reading Score + Micro-Regia Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
          {/* Left 7 cols: Interactive Annotated Italian Prosody Score */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Spartito Annotato (seleziona una clausola per calibrare virgola e tono)</span>
              <span className="font-mono tabular-nums">{prosodyMap.clauses.length} clausole</span>
            </div>

            <div className="bg-[#0B0C0E] border border-white/[0.08] rounded-xl p-5 leading-loose text-base select-none space-y-2">
              {prosodyMap.clauses.map((clause, index) => {
                const isSelected = selectedClause?.id === clause.id;
                const isComma = clause.punctuationMark === ",";
                return (
                  <span
                    key={clause.id}
                    onClick={() => onSelectClause(clause.id)}
                    className={`inline-block mr-2 mb-2 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border ${
                      isSelected
                        ? "bg-[#171A20] border-[#E07A38] text-[#F4F4F0]"
                        : "bg-transparent border-transparent hover:bg-white/[0.04] hover:border-white/[0.08] text-[#F4F4F0]/90"
                    }`}
                  >
                    <span className="text-[11px] font-mono tabular-nums text-[#9CA3AF] mr-1.5">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-normal">
                      {clause.text.slice(0, Math.max(0, clause.text.length - clause.punctuationMark.length))}
                    </span>
                    <strong
                      className={`font-mono font-bold px-0.5 ${
                        isComma ? "text-[#E07A38]" : "text-[#10B981]"
                      }`}
                    >
                      {clause.punctuationMark}
                    </strong>
                    <span className="inline-flex items-center gap-1 ml-2 text-[11px] font-mono tabular-nums text-[#9CA3AF]">
                      {renderPitchIcon(clause.pitchContour)}
                      <span>{clause.pauseMs}ms</span>
                    </span>
                  </span>
                );
              })}
            </div>

            {/* Detailed Clause Table for quick scanning */}
            <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.06] max-h-72 overflow-y-auto pr-1">
              {prosodyMap.clauses.map((clause, idx) => {
                const isSelected = selectedClause?.id === clause.id;
                return (
                  <button
                    key={clause.id}
                    type="button"
                    onClick={() => onSelectClause(clause.id)}
                    className={`w-full text-left py-2.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected ? "bg-[#171A20]" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-mono tabular-nums text-[#9CA3AF] shrink-0">
                        {String(idx + 1).padStart(2, "0")}.
                      </span>
                      <span className="text-xs text-[#F4F4F0] truncate font-medium">{clause.text}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#9CA3AF] shrink-0">
                      <span className="text-[#E07A38]">{clause.punctuationFunction}</span>
                      <span aria-hidden="true">·</span>
                      <span>{clause.tone}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#F4F4F0]">{clause.pauseMs}ms</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 5 cols: Active Clause Tone, Comma Pause & Vocal Setting Calibrator */}
          <div className="lg:col-span-5 lg:border-l lg:border-white/[0.06] lg:pl-6 flex flex-col justify-between gap-5">
            {selectedClause ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#E07A38]" />
                    <h3 className="text-sm font-semibold text-[#F4F4F0]">
                      Calibrazione Clausola & Punteggiatura
                    </h3>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                    Segno rilevato: <strong className="text-[#E07A38]">{selectedClause.punctuationMark}</strong>
                  </span>
                </div>

                {/* Selected Phrase Preview */}
                <div className="bg-[#0B0C0E] border border-white/[0.06] rounded-lg p-3.5">
                  <span className="text-[11px] text-[#9CA3AF] block mb-1">
                    {selectedClause.punctuationFunction}
                  </span>
                  <p className="text-sm font-medium text-[#F4F4F0] leading-relaxed">
                    “{selectedClause.text}”
                  </p>
                </div>

                {/* Tone Selector */}
                <div>
                  <label className="text-xs text-[#9CA3AF] block mb-1.5">
                    Tono & Intonazione della Clausola
                  </label>
                  <select
                    value={selectedClause.tone}
                    onChange={(e) =>
                      onUpdateClause(selectedClause.id, { tone: e.target.value })
                    }
                    className="w-full bg-[#0B0C0E] border border-white/[0.08] focus:border-[#E07A38] rounded-lg px-3 py-2 text-xs text-[#F4F4F0] outline-none"
                  >
                    {!TONE_OPTIONS.includes(selectedClause.tone) && (
                      <option value={selectedClause.tone}>{selectedClause.tone}</option>
                    )}
                    {TONE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pitch Contour Selector */}
                <div>
                  <label className="text-xs text-[#9CA3AF] block mb-1.5">
                    Curva Melodica sulla Punteggiatura ({selectedClause.punctuationMark})
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[#0B0C0E] p-1 rounded-lg border border-white/[0.08]">
                    {(
                      [
                        { id: "rising", label: "↗ Sospensiva" },
                        { id: "sustained", label: "→ Tenuta" },
                        { id: "circumflex", label: "⌒ Inciso" },
                        { id: "falling", label: "↘ Conclusiva" },
                      ] as { id: ProsodicClause["pitchContour"]; label: string }[]
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onUpdateClause(selectedClause.id, { pitchContour: item.id })
                        }
                        className={`px-2 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          selectedClause.pitchContour === item.id
                            ? "bg-[#171A20] text-[#E07A38] font-medium border border-white/[0.08]"
                            : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pause Duration Slider in ms */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[#9CA3AF]">
                      Durata Pausa dopo "{selectedClause.punctuationMark}"
                    </span>
                    <span className="font-mono tabular-nums text-[#E07A38] font-semibold">
                      {selectedClause.pauseMs} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={1000}
                    step={10}
                    value={selectedClause.pauseMs}
                    onChange={(e) =>
                      onUpdateClause(selectedClause.id, { pauseMs: Number(e.target.value) })
                    }
                    className="w-full accent-[#E07A38] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-[#9CA3AF] mt-1">
                    <span>80ms (Legato)</span>
                    <span>250ms (Virgola)</span>
                    <span>600ms+ (Punto)</span>
                  </div>
                </div>

                {/* Vocal Setting Micro-Regia */}
                <div>
                  <label className="text-xs text-[#9CA3AF] block mb-1.5">
                    Impostazione Vocale Specifica (Micro-Regia)
                  </label>
                  <input
                    type="text"
                    value={selectedClause.vocalSetting}
                    onChange={(e) =>
                      onUpdateClause(selectedClause.id, { vocalSetting: e.target.value })
                    }
                    className="w-full bg-[#0B0C0E] border border-white/[0.08] focus:border-[#E07A38] rounded-lg px-3 py-2 text-xs text-[#F4F4F0] outline-none"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#9CA3AF]">
                Seleziona una clausola dallo spartito per modificarne l'impostazione.
              </p>
            )}

            {/* Action to trigger Stage 4 Synthesis with the current Prosody Map */}
            <div className="pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onSynthesizeWithProsody}
                disabled={isSynthesizing || isAnalyzing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#171A20] hover:bg-white/[0.08] border border-[#E07A38]/40 text-[#F4F4F0] text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#E07A38] ${isSynthesizing ? "animate-spin" : ""}`} />
                <span>
                  {isSynthesizing
                    ? "Creazione Interna dell'Audio in Corso..."
                    : "Applica Modifiche Prosodiche & Sintetizza Audio (Fase 4)"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
