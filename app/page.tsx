"use client";

import { useState } from "react";
import aromanize from "aromanize";
import { Sparkles, ArrowRight, RefreshCw, Music2, Type, Heart } from "lucide-react";

import TranslationSkeleton from "@/components/TranslationSkeleton";
import FullPanelLoader from "@/components/FullPanelLoader";
import { translateText } from "@/app/actions";

// Tipado para nuestras líneas de letra
type LyricLine = {
  original: string;
  romanized: string;
  translationEn: string | null;
  translationEs: string | null;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetLang, setTargetLang] = useState<'en' | 'es'>('en');

  // Función principal de procesamiento
  const handleProcess = async () => {
    if (!input.trim()) return;
    setLoading(true);

    const rawLines = input.split("\n");

    // 1. Pre-procesamiento: Romanización instantánea (Local)
    // Inicializamos el estado con todo lo que podemos hacer síncronamente
    const initialProcessedLines: LyricLine[] = rawLines.map((line) => {
      if (!line.trim()) {
        return { original: "", romanized: "", translationEn: "", translationEs: "" };
      }
      return {
        original: line,
        romanized: aromanize.romanize(line),
        translationEn: null, // Loading state
        translationEs: null, // Loading state
      };
    });

    setLyrics(initialProcessedLines);

    // 2. Procesamiento Renglón por Renglón (Robusto)
    // Volvemos a procesar línea por línea para evitar errores de batching,
    // pero usamos concurrencia para mantener la velocidad.
    const indicesToTranslate = initialProcessedLines
      .map((line, idx) => (line.original.trim() ? idx : -1))
      .filter((idx) => idx !== -1);

    const CONCURRENCY_LIMIT = 5; // Ajustado a 5 para mayor estabilidad
    let currentIndex = 0;
    const resultsMap = new Map<number, { en: string; es: string }>();

    const processNext = async () => {
      while (currentIndex < indicesToTranslate.length) {
        const idx = indicesToTranslate[currentIndex];
        currentIndex++; // Tomar el siguiente índice atómicamente

        const lineObj = initialProcessedLines[idx];

        try {
          // Llamada a la Server Action (que tiene Retry + DeepL Backup)
          const [transEn, transEs] = await Promise.all([
            translateText(lineObj.original, 'en'),
            translateText(lineObj.original, 'es')
          ]);

          resultsMap.set(idx, { en: transEn, es: transEs });
        } catch (error) {
          console.error(`Error processing line ${idx}:`, error);
          resultsMap.set(idx, { en: lineObj.original, es: lineObj.original }); // Fallback al original
        }
      }
    };

    // Iniciar el pool de workers
    const workers = Array(Math.min(CONCURRENCY_LIMIT, indicesToTranslate.length))
      .fill(null)
      .map(() => processNext());

    await Promise.all(workers);

    // Actualizar el estado con todos los resultados
    setLyrics((prevLyrics) => {
      const newLyrics = [...prevLyrics];
      resultsMap.forEach((translations, idx) => {
        newLyrics[idx] = {
          ...newLyrics[idx],
          translationEn: translations.en,
          translationEs: translations.es
        };
      });
      return newLyrics;
    });

    setLoading(false);
  };

  const toggleLanguage = () => {
    const newLang = targetLang === 'en' ? 'es' : 'en';
    setTargetLang(newLang);
    // No es necesario reprocesar, ya tenemos ambos idiomas
  };

  return (
    <main className="min-h-screen bg-[#8B5CF6] text-black font-sans selection:bg-[#F472B6] selection:text-white p-4 md:p-8">

      {/* --- HEADER --- */}
      <header className="max-w-5xl mx-auto mb-12 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rotate-[-2deg] hover:rotate-0 transition-transform duration-300">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter flex items-center gap-3">
            <Music2 className="w-10 h-10 text-[#F472B6]" />
            K-Lyric <span className="text-[#8B5CF6]">Neo</span>
          </h1>
        </div>
        <div className="bg-[#A78BFA] border-4 border-black px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold text-white rounded-full">
          v2.0 // ESTILO K-POP
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* --- INPUT PANEL (Izquierda) --- */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <label className="flex items-center gap-2 font-black text-xl mb-4 uppercase">
              <Type className="w-6 h-6" />
              Pegar Hangul
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pega la letra en coreano aquí..."
              className="w-full h-64 bg-slate-100 border-4 border-black p-4 font-medium focus:outline-none focus:ring-4 focus:ring-[#F472B6] resize-none text-lg"
            />

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleProcess}
                disabled={loading}
                className="w-full bg-[#F472B6] border-4 border-black py-3 px-6 font-black text-white text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#ec4899]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin w-6 h-6" /> Procesando...
                  </>
                ) : (
                  <>
                    ROMANIZAR <ArrowRight className="w-6 h-6" />
                  </>
                )}
              </button>

              <button
                onClick={() => { setInput(""); setLyrics([]) }}
                className="w-full bg-white border-4 border-black py-3 font-bold text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
              >
                LIMPIAR
              </button>
            </div>
          </div>

          {/* Decoración estilo Sticker */}
          <div className="hidden lg:flex bg-[#FEF08A] border-4 border-black p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rotate-3 justify-center items-center gap-2 font-bold text-sm">
            <Heart className="w-5 h-5 text-black" />
            POWERED BY POCAPAY GO
            <Heart className="w-5 h-5 text-black" />
          </div>
        </section>

        {/* --- OUTPUT PANEL (Derecha) --- */}
        <section className="lg:col-span-8">
          <div className="bg-white border-4 border-black h-[80vh] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden">

            {loading ? (
              <FullPanelLoader />
            ) : lyrics.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-10 text-center">
                <div className="w-24 h-24 bg-slate-200 border-4 border-slate-300 rounded-full mb-4 flex items-center justify-center">
                  <Music2 className="w-10 h-10 text-slate-400" />
                </div>
                <p className="font-bold text-xl">Esperando tu música...</p>
                <p>Pega el texto a la izquierda para comenzar.</p>
              </div>
            ) : (
              <>
                {/* Cabecera de Resultados */}
                <div className="border-b-4 border-black bg-black text-white p-4 grid grid-cols-1 md:grid-cols-12 font-black uppercase tracking-wider text-sm md:text-base items-center gap-4 md:gap-0">
                  <div className="md:col-span-4">Original</div>
                  <div className="md:col-span-4 text-[#F472B6]">Romanización</div>

                  {/* Toggle de Idioma Estilo Neo-Brutalist */}
                  <div className="md:col-span-4 flex justify-start md:justify-start">
                    <div className="flex border-2 border-white square overflow-hidden shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)]">
                      <button
                        onClick={() => setTargetLang('en')}
                        className={`px-4 py-1 font-bold transition-colors ${targetLang === 'en' ? 'bg-[#F472B6] text-white' : 'bg-black text-white hover:bg-gray-800'}`}
                      >
                        ENG
                      </button>
                      <div className="w-0.5 bg-white"></div>
                      <button
                        onClick={() => setTargetLang('es')}
                        className={`px-4 py-1 font-bold transition-colors ${targetLang === 'es' ? 'bg-[#F472B6] text-white' : 'bg-black text-white hover:bg-gray-800'}`}
                      >
                        ESP
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lista de Líneas */}
                <div className="relative flex-1 overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-full overflow-y-auto custom-scrollbar p-0 divide-y-2 divide-black">
                    {lyrics.map((line, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-12 p-4 md:p-6 gap-2 md:gap-4 hover:bg-[#FDF2F8] transition-colors group"
                      >
                        {/* Hangul */}
                        <div className="md:col-span-4 font-bold text-lg md:text-xl break-words leading-tight">
                          {line.original}
                        </div>

                        {/* Romanización */}
                        <div className="md:col-span-4 font-mono font-bold text-[#DB2777] break-words text-sm md:text-base leading-snug">
                          {line.romanized}
                        </div>

                        {/* Traducción */}
                        <div className="md:col-span-4 font-medium text-slate-600 italic text-sm md:text-base border-t-2 border-dashed border-slate-300 md:border-0 pt-2 md:pt-0 mt-2 md:mt-0">
                          {targetLang === 'en'
                            ? (line.translationEn === null ? <TranslationSkeleton /> : line.translationEn)
                            : (line.translationEs === null ? <TranslationSkeleton /> : line.translationEs)
                          }
                        </div>
                      </div>
                    ))}
                    {/* Espacio extra al final para que no se corte con el indicador */}
                    <div className="h-16"></div>
                  </div>

                  {/* Indicador Visual de Scroll */}
                  <div className="absolute bottom-4 right-6 pointer-events-none animate-bounce">
                    <div className="bg-black text-white font-black text-xs px-3 py-1 border-2 border-white shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                      SCROLL ▼
                    </div>
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