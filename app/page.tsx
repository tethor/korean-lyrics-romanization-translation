"use client";

import { useCallback, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  Heart,
  Music2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Type,
} from "lucide-react";

import TranslationSkeleton from "@/components/TranslationSkeleton";
import FullPanelLoader from "@/components/FullPanelLoader";
import { translateBatch } from "@/app/actions";

// ── Dynamic import aromanize (keep out of main bundle) ──
let aromanizePromise: Promise<typeof import("aromanize")> | null = null;
function getAromanize() {
  if (!aromanizePromise) aromanizePromise = import("aromanize");
  return aromanizePromise;
}

type LyricLine = {
  id: string;
  original: string;
  romanized: string;
  translationEn: string | null;
  translationEs: string | null;
  error?: boolean;
};

type TargetLang = "en" | "es";
type ViewMode = "table" | "furigana";

const SUPPORTED_LANGS: { code: TargetLang; label: string; flag: string }[] = [
  { code: "en", label: "ENG", flag: "🇬🇧" },
  { code: "es", label: "ESP", flag: "🇪🇸" },
];

function makeId(text: string, idx: number): string {
  return `${idx}-${text.slice(0, 8).replace(/\s/g, "")}`;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetLang, setTargetLang] = useState<TargetLang>("en");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef(false);

  // ── Main processing ──
  const handleProcess = async () => {
    if (!input.trim() || loading) return;
    abortRef.current = false;
    setLoading(true);
    setProgress({ done: 0, total: 0 });

    const rawLines = input.split("\n");

    // 1. Romanize locally (instant)
    const aromanize = await getAromanize();
    const initialLines: LyricLine[] = rawLines.map((line, idx) => {
      if (!line.trim()) {
        return {
          id: makeId("", idx),
          original: "",
          romanized: "",
          translationEn: "",
          translationEs: "",
        };
      }
      return {
        id: makeId(line, idx),
        original: line,
        romanized: aromanize.romanize(line),
        translationEn: null,
        translationEs: null,
      };
    });

    setLyrics(initialLines);

    // 2. Translate in batch (only the visible language)
    const nonEmptyCount = initialLines.filter((l) => l.original.trim()).length;
    setProgress({ done: 0, total: nonEmptyCount });

    try {
      const texts = initialLines.map((l) => l.original);
      const translations = await translateBatch(texts, targetLang);

      if (abortRef.current) return;

      setLyrics((prev) =>
        prev.map((line, i) => ({
          ...line,
          ...(targetLang === "en"
            ? { translationEn: translations[i] }
            : { translationEs: translations[i] }),
        }))
      );
      setProgress({ done: nonEmptyCount, total: nonEmptyCount });
    } catch (error) {
      console.error("Translation failed:", error);
      setLyrics((prev) =>
        prev.map((line) => ({
          ...line,
          translationEn: targetLang === "en" ? line.original : line.translationEn,
          translationEs: targetLang === "es" ? line.original : line.translationEs,
          error: true,
        }))
      );
    }

    setLoading(false);
  };

  // ── Translate a specific language on demand ──
  const handleTranslateLang = async (lang: TargetLang) => {
    const texts = lyrics.map((l) => l.original);
    const hasLang = lyrics.some((l) =>
      lang === "en" ? l.translationEn !== null : l.translationEs !== null
    );
    if (hasLang) return;

    try {
      const translations = await translateBatch(texts, lang);
      setLyrics((prev) =>
        prev.map((line, i) => ({
          ...line,
          ...(lang === "en"
            ? { translationEn: translations[i] }
            : { translationEs: translations[i] }),
        }))
      );
    } catch {}
  };

  // ── Copy all to clipboard ──
  const handleCopy = useCallback(async () => {
    const langKey = targetLang === "en" ? "translationEn" : "translationEs";
    const text = lyrics
      .filter((l) => l.original.trim())
      .map((l) => `${l.original}\n${l.romanized}\n${l[langKey] || ""}`)
      .join("\n\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [lyrics, targetLang]);

  // ── Export as .txt ──
  const handleExportTxt = useCallback(() => {
    const langKey = targetLang === "en" ? "translationEn" : "translationEs";
    const text = lyrics
      .filter((l) => l.original.trim())
      .map((l) => `${l.original}\n${l.romanized}\n${l[langKey] || ""}`)
      .join("\n\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "k-lyric-neo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [lyrics, targetLang]);

  // ── Export as .srt (subtitles) ──
  const handleExportSrt = useCallback(() => {
    const langKey = targetLang === "en" ? "translationEn" : "translationEs";
    const nonEmpty = lyrics.filter((l) => l.original.trim());
    let srt = "";
    nonEmpty.forEach((l, i) => {
      const start = `00:00:${String(i * 3).padStart(2, "0")},000`;
      const end = `00:00:${String(i * 3 + 2).padStart(2, "0")},500`;
      srt += `${i + 1}\n${start} --> ${end}\n${l.romanized}\n${l[langKey] || ""}\n\n`;
    });

    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "k-lyric-neo.srt";
    a.click();
    URL.revokeObjectURL(url);
  }, [lyrics, targetLang]);

  // ── Retry failed line ──
  const handleRetryLine = async (idx: number) => {
    const line = lyrics[idx];
    if (!line.original.trim()) return;

    setLyrics((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, error: false } : l))
    );

    try {
      const [trans] = await translateBatch([line.original], targetLang);
      setLyrics((prev) =>
        prev.map((l, i) => {
          if (i !== idx) return l;
          return targetLang === "en"
            ? { ...l, translationEn: trans }
            : { ...l, translationEs: trans };
        })
      );
    } catch {
      setLyrics((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, error: true } : l))
      );
    }
  };

  const handleClear = () => {
    abortRef.current = true;
    setInput("");
    setLyrics([]);
    setLoading(false);
    setProgress({ done: 0, total: 0 });
  };

  const hasResults = lyrics.length > 0;
  const langKey = targetLang === "en" ? "translationEn" : "translationEs";

  return (
    <main className="min-h-screen bg-[#8B5CF6] text-black font-sans selection:bg-[#F472B6] selection:text-white p-4 md:p-8">
      {/* ── HEADER ── */}
      <header className="max-w-5xl mx-auto mb-8 md:mb-12 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rotate-[-2deg] hover:rotate-0 transition-transform duration-300">
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter flex items-center gap-3">
            <Music2 className="w-8 h-8 md:w-10 md:h-10 text-[#F472B6]" />
            K-Lyric <span className="text-[#8B5CF6]">Neo</span>
          </h1>
        </div>
        <div className="bg-[#A78BFA] border-4 border-black px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold text-white rounded-full text-sm md:text-base">
          v3.0 // BATCH + FURIGANA
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* ── INPUT PANEL ── */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white border-4 border-black p-4 md:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <label className="flex items-center gap-2 font-black text-lg md:text-xl mb-4 uppercase">
              <Type className="w-5 h-5 md:w-6 md:h-6" />
              Pegar Hangul
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pega la letra en coreano aquí..."
              className="w-full h-48 md:h-64 bg-slate-100 border-4 border-black p-4 font-medium focus:outline-none focus:ring-4 focus:ring-[#F472B6] resize-none text-base md:text-lg"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleProcess();
                }
              }}
            />

            <div className="mt-4 flex flex-col gap-3">
              <button
                onClick={handleProcess}
                disabled={loading || !input.trim()}
                className="w-full bg-[#F472B6] border-4 border-black py-3 px-6 font-black text-white text-lg md:text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#ec4899]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin w-5 h-5" /> Procesando...
                  </>
                ) : (
                  <>
                    ROMANIZAR <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <button
                onClick={handleClear}
                className="w-full bg-white border-4 border-black py-3 font-bold text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all text-sm md:text-base"
              >
                LIMPIAR
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2 text-center">
              Ctrl+Enter para procesar
            </p>
          </div>

          {/* Sticker */}
          <div className="hidden lg:flex bg-[#FEF08A] border-4 border-black p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rotate-3 justify-center items-center gap-2 font-bold text-sm">
            <Heart className="w-5 h-5 text-black" />
            POWERED BY POCAPAY GO
            <Heart className="w-5 h-5 text-black" />
          </div>
        </section>

        {/* ── OUTPUT PANEL ── */}
        <section className="lg:col-span-8">
          <div className="bg-white border-4 border-black h-[75vh] md:h-[80vh] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden">
            {loading && !hasResults ? (
              <FullPanelLoader progress={progress} />
            ) : !hasResults ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 md:p-10 text-center">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-200 border-4 border-slate-300 rounded-full mb-4 flex items-center justify-center">
                  <Music2 className="w-8 h-8 md:w-10 md:h-10 text-slate-400" />
                </div>
                <p className="font-bold text-lg md:text-xl">Esperando tu música...</p>
                <p className="text-sm md:text-base">Pega el texto a la izquierda para comenzar.</p>
              </div>
            ) : (
              <>
                {/* ── Toolbar ── */}
                <div className="border-b-4 border-black bg-black text-white p-3 md:p-4 flex flex-wrap items-center gap-2 md:gap-4">
                  {/* Language toggle */}
                  <div className="flex border-2 border-white overflow-hidden shadow-[2px_2px_0px_0px_rgba(255,255,255,0.3)]">
                    {SUPPORTED_LANGS.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setTargetLang(lang.code);
                          handleTranslateLang(lang.code);
                        }}
                        className={`px-3 md:px-4 py-1 font-bold transition-colors text-sm ${
                          targetLang === lang.code
                            ? "bg-[#F472B6] text-white"
                            : "bg-black text-white hover:bg-gray-800"
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>

                  {/* View mode toggle */}
                  <div className="flex border-2 border-white overflow-hidden shadow-[2px_2px_0px_0px_rgba(255,255,255,0.3)]">
                    <button
                      onClick={() => setViewMode("table")}
                      className={`px-3 py-1 font-bold transition-colors text-sm ${
                        viewMode === "table"
                          ? "bg-[#8B5CF6] text-white"
                          : "bg-black text-white hover:bg-gray-800"
                      }`}
                    >
                      TABLA
                    </button>
                    <button
                      onClick={() => setViewMode("furigana")}
                      className={`px-3 py-1 font-bold transition-colors text-sm ${
                        viewMode === "furigana"
                          ? "bg-[#8B5CF6] text-white"
                          : "bg-black text-white hover:bg-gray-800"
                      }`}
                    >
                      FURIGANA
                    </button>
                  </div>

                  <div className="flex-1" />

                  {/* Action buttons */}
                  <button
                    onClick={handleCopy}
                    title="Copiar todo"
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={handleExportTxt}
                    title="Exportar .txt"
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleExportSrt}
                    title="Exportar .srt (subtítulos)"
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>

                {/* ── Progress bar ── */}
                {loading && progress.total > 0 && (
                  <div className="h-1 bg-slate-200">
                    <div
                      className="h-full bg-[#F472B6] transition-all duration-300"
                      style={{
                        width: `${Math.round((progress.done / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                )}

                {/* ── Content ── */}
                <div className="relative flex-1 overflow-hidden">
                  <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                    {viewMode === "table" ? (
                      <TableView
                        lyrics={lyrics}
                        langKey={langKey}
                        onRetry={handleRetryLine}
                      />
                    ) : (
                      <FuriganaView
                        lyrics={lyrics}
                        langKey={langKey}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

// ─── TABLE VIEW ───
function TableView({
  lyrics,
  langKey,
  onRetry,
}: {
  lyrics: LyricLine[];
  langKey: "translationEn" | "translationEs";
  onRetry: (idx: number) => void;
}) {
  return (
    <div className="divide-y-2 divide-black">
      {/* Header */}
      <div className="grid grid-cols-12 p-3 md:p-4 bg-black text-white font-black uppercase tracking-wider text-xs md:text-base sticky top-0 z-10">
        <div className="col-span-4">Original</div>
        <div className="col-span-4 text-[#F472B6]">Romanización</div>
        <div className="col-span-4">Traducción</div>
      </div>

      {lyrics.map((line, idx) => (
        <div
          key={line.id}
          className="grid grid-cols-12 p-3 md:p-5 gap-2 md:gap-4 hover:bg-[#FDF2F8] transition-colors"
        >
          {/* Hangul */}
          <div className="col-span-12 md:col-span-4 font-bold text-base md:text-lg break-words leading-tight">
            {line.original || <span className="text-slate-300">&nbsp;</span>}
          </div>

          {/* Romanization */}
          <div className="col-span-12 md:col-span-4 font-mono font-bold text-[#DB2777] break-words text-sm md:text-base leading-snug">
            {line.romanized || <span className="text-slate-300">&nbsp;</span>}
          </div>

          {/* Translation */}
          <div className="col-span-12 md:col-span-4 font-medium text-slate-600 italic text-sm md:text-base border-t-2 border-dashed border-slate-300 md:border-0 pt-2 md:pt-0 mt-1 md:mt-0 flex items-start gap-2">
            <span className="flex-1">
              {line[langKey] === null ? (
                <TranslationSkeleton />
              ) : line.error ? (
                <span className="text-red-500 not-italic flex items-center gap-2">
                  Error
                  <button
                    onClick={() => onRetry(idx)}
                    className="text-xs underline hover:text-red-700"
                  >
                    Reintentar
                  </button>
                </span>
              ) : (
                line[langKey]
              )}
            </span>
          </div>
        </div>
      ))}
      <div className="h-16" />
    </div>
  );
}

// ─── FURIGANA VIEW ───
function FuriganaView({
  lyrics,
  langKey,
}: {
  lyrics: LyricLine[];
  langKey: "translationEn" | "translationEs";
}) {
  return (
    <div className="p-4 md:p-8 space-y-6">
      {lyrics
        .filter((l) => l.original.trim())
        .map((line) => (
          <div key={line.id} className="space-y-1">
            <ruby className="text-xl md:text-2xl font-bold leading-relaxed">
              {line.original}
              <rt>{line.romanized}</rt>
            </ruby>
            <div className="text-sm md:text-base text-slate-500 italic pl-1">
              {line[langKey] === null ? (
                <TranslationSkeleton />
              ) : (
                line[langKey]
              )}
            </div>
          </div>
        ))}
      <div className="h-16" />
    </div>
  );
}
