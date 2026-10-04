import React, { useRef, useState } from "react";
import { FileUp, FileText, Loader2, CheckCircle2, Play, X, AlertCircle } from "lucide-react";

export interface ExtractedPdfSection {
  id: string;
  label: string;
  text: string;
  wordCount: number;
}

export interface ExtractedPdfResult {
  fileName: string;
  fileSizeKb: number;
  documentTitle: string;
  detectedStylePreset: string;
  totalPagesDetected: number;
  editorialNotes: string;
  fullText: string;
  sections: ExtractedPdfSection[];
}

interface PdfInputImporterProps {
  onApplyPdfContent: (
    result: ExtractedPdfResult,
    selectedText: string,
    autoRunFullPipeline: boolean
  ) => void;
  isPipelineBusy: boolean;
}

export const PdfInputImporter: React.FC<PdfInputImporterProps> = ({
  onApplyPdfContent,
  isPipelineBusy,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [pageFilter, setPageFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [extractedPdf, setExtractedPdf] = useState<ExtractedPdfResult | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>("full");

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => reject(new Error("Impossibile leggere il file selezionato."));
      reader.readAsDataURL(file);
    });

  const processFile = async (file: File, autoRunFullPipeline = false) => {
    setErrorMsg(null);

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isText =
      file.type.startsWith("text/") ||
      file.name.toLowerCase().endsWith(".txt") ||
      file.name.toLowerCase().endsWith(".md");

    if (!isPdf && !isText) {
      setErrorMsg("Seleziona un documento in formato .PDF (oppure .TXT / .MD).");
      return;
    }

    if (file.size > 24 * 1024 * 1024) {
      setErrorMsg("Il file supera il limite di 24 MB. Usa un PDF più leggero o diviso in capitoli.");
      return;
    }

    setIsExtracting(true);

    try {
      if (isText) {
        const rawText = await file.text();
        const cleaned = rawText.trim();
        const words = cleaned.split(/\s+/).filter(Boolean).length;
        const result: ExtractedPdfResult = {
          fileName: file.name,
          fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
          documentTitle: file.name.replace(/\.(txt|md)$/i, ""),
          detectedStylePreset: "narrativa",
          totalPagesDetected: 1,
          editorialNotes: "Importazione diretta da file di testo UTF-8.",
          fullText: cleaned,
          sections: [
            {
              id: "sec-1",
              label: "Testo Integrale",
              text: cleaned,
              wordCount: words,
            },
          ],
        };
        setExtractedPdf(result);
        setActiveSectionId("full");
        onApplyPdfContent(result, cleaned, autoRunFullPipeline);
        return;
      }

      // Extract & clean PDF via backend Gemini 3.8 Flash endpoint
      const pdfBase64 = await readFileAsBase64(file);
      const response = await fetch("/api/pipeline/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          fileName: file.name,
          pageFilter,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante l'estrazione del testo dal PDF.");
      }

      const result: ExtractedPdfResult = {
        fileName: file.name,
        fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
        documentTitle: data.documentTitle || file.name.replace(/\.pdf$/i, ""),
        detectedStylePreset: data.detectedStylePreset || "narrativa",
        totalPagesDetected: data.totalPagesDetected || data.sections?.length || 1,
        editorialNotes:
          data.editorialNotes ||
          "Sillabazioni a capo ricomposte e intestazioni rimosse per lettura fluida.",
        fullText: data.fullText || "",
        sections: Array.isArray(data.sections) ? data.sections : [],
      };

      setExtractedPdf(result);
      setActiveSectionId("full");
      onApplyPdfContent(result, result.fullText, autoRunFullPipeline);
    } catch (err: any) {
      setErrorMsg(err?.message || "Errore durante l'analisi del documento PDF.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file, false);
    }
  };

  const handleSelectSection = (sectionId: string) => {
    if (!extractedPdf) return;
    setActiveSectionId(sectionId);
    if (sectionId === "full") {
      onApplyPdfContent(extractedPdf, extractedPdf.fullText, false);
    } else {
      const found = extractedPdf.sections.find((s) => s.id === sectionId);
      if (found) {
        onApplyPdfContent(
          {
            ...extractedPdf,
            documentTitle: `${extractedPdf.documentTitle} — ${found.label}`,
          },
          found.text,
          false
        );
      }
    }
  };

  return (
    <div className="bg-[#0B0C0E] border border-white/[0.08] rounded-xl p-4 flex flex-col gap-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#E07A38] shrink-0" />
          <span className="text-xs font-semibold text-[#F4F4F0]">
            Importazione Documento PDF & Pulizia Editoriale
          </span>
          <span className="text-white/20" aria-hidden="true">·</span>
          <span className="text-xs text-[#9CA3AF]">
            Ricompone sillabazioni a capo e rimuove numeri di pagina
          </span>
        </div>

        {/* Optional Page/Chapter Filter Input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={pageFilter}
            onChange={(e) => setPageFilter(e.target.value)}
            placeholder="Filtro opzionale (es. Pag. 1-3, Cap. 1)"
            className="bg-[#121418] border border-white/[0.08] focus:border-[#E07A38] rounded-lg px-2.5 py-1 text-xs text-[#F4F4F0] outline-none w-52"
          />
        </div>
      </div>

      {/* Drag & Drop or File Select Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-lg border border-dashed px-4 py-3.5 transition-colors flex flex-col sm:flex-row items-center justify-between gap-3 ${
          isDragging
            ? "border-[#E07A38] bg-[#E07A38]/10"
            : "border-white/[0.12] bg-[#121418]/60 hover:border-white/[0.2]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf,.txt,.md"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file, false);
          }}
          className="hidden"
        />

        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-[#171A20] border border-white/[0.08] text-[#E07A38] shrink-0">
            {isExtracting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileUp className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#F4F4F0]">
              {isExtracting
                ? "Lettura del PDF, pulizia delle sillabazioni e analisi delle sezioni in corso..."
                : "Trascina qui un file .PDF (libri, dispense, articoli, copioni) oppure sfoglia"}
            </p>
            <p className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
              Supporta PDF digitali e scansioni · Mantiene intatte virgole, incisi e punteggiatura italiana
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isExtracting || isPipelineBusy}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 rounded-lg bg-[#171A20] hover:bg-[#E07A38] hover:text-[#0B0C0E] border border-white/[0.1] disabled:opacity-40 text-xs font-semibold text-[#F4F4F0] transition-colors whitespace-nowrap cursor-pointer"
          >
            {isExtracting ? "Estrazione PDF..." : "Carica File PDF"}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#F4F4F0]">
          <AlertCircle className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loaded PDF Metadata & Section Selector */}
      {extractedPdf && (
        <div className="bg-[#121418] border border-white/[0.08] rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
              <span className="font-semibold text-[#F4F4F0]">{extractedPdf.fileName}</span>
              <span className="text-white/20" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#9CA3AF]">
                {extractedPdf.fileSizeKb} KB
              </span>
              <span className="text-white/20" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#E07A38]">
                {extractedPdf.totalPagesDetected} {extractedPdf.totalPagesDetected === 1 ? "sezione" : "pagine/sezioni"}
              </span>
              <span className="text-white/20" aria-hidden="true">·</span>
              <span className="text-[#9CA3AF]">{extractedPdf.editorialNotes}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isPipelineBusy || isExtracting}
                onClick={() =>
                  onApplyPdfContent(
                    extractedPdf,
                    activeSectionId === "full"
                      ? extractedPdf.fullText
                      : extractedPdf.sections.find((s) => s.id === activeSectionId)?.text ||
                        extractedPdf.fullText,
                    true
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#E07A38] hover:bg-[#d06928] text-[#0B0C0E] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Avvia Pipeline sul PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setExtractedPdf(null)}
                title="Chiudi scheda PDF"
                className="p-1 rounded hover:bg-white/[0.08] text-[#9CA3AF] hover:text-[#F4F4F0] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Section / Page Switcher if multiple sections exist */}
          {extractedPdf.sections.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.06]">
              <span className="text-[11px] text-[#9CA3AF] mr-1">Seleziona parte da leggere:</span>
              <button
                type="button"
                onClick={() => handleSelectSection("full")}
                className={`px-2.5 py-1 rounded text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                  activeSectionId === "full"
                    ? "bg-[#171A20] text-[#E07A38] border border-white/[0.1]"
                    : "bg-[#0B0C0E] text-[#9CA3AF] hover:text-[#F4F4F0]"
                }`}
              >
                Documento Completo
              </button>
              {extractedPdf.sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => handleSelectSection(sec.id)}
                  className={`px-2.5 py-1 rounded text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                    activeSectionId === sec.id
                      ? "bg-[#171A20] text-[#E07A38] border border-white/[0.1]"
                      : "bg-[#0B0C0E] text-[#9CA3AF] hover:text-[#F4F4F0]"
                  }`}
                >
                  {sec.label} ({sec.wordCount}p)
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
