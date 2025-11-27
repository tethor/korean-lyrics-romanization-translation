"use client";

import { useState, useEffect } from "react";

import {
  Loader2, ArrowRight, Sparkles, RefreshCw, Music2, Type,
  Heart, Flame, TrendingUp, Info, X, ShoppingBag, Disc, CircleStar
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Asegúrate de que estos imports apunten a tus componentes reales
import FullPanelLoader from "@/components/FullPanelLoader";
import { LibraryView } from "@/app/components/LibraryView";
import {
  translateBatch,
  fetchLyrics,
  findGeniusTranslation,
  saveSong,
  getSongBySlug,
  findSavedSongMatch,
  generateRomanization
} from "./actions";
import { SearchBar } from "@/app/components/SearchBar";
import { ThemeSwitcher } from "@/app/components/ThemeSwitcher";

// Shadcn Imports
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// utils
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tipado para nuestras líneas de letra
type LyricLine = {
  original: string;
  romanized: string;
  translationEn: string;
  translationEs: string;
};

type Theme = "neo" | "dream" | "editorial";

export default function Home() {
  const [input, setInput] = useState("");
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [language, setLanguage] = useState<'rom' | 'en' | 'es'>('en');
  const [showLibrary, setShowLibrary] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>("neo");
  const [currentSongMeta, setCurrentSongMeta] = useState<{ title: string; artist: string } | null>(null);

  // --- MARKETING POP-UP STATE ---
  const [showPromoPopup, setShowPromoPopup] = useState(false);

  // Activar Pop-up a los 8 segundos si no está cargando
  useEffect(() => {
    const timer = setTimeout(() => {
      // Verificamos si ya hay interacción para no interrumpir demasiado, 
      // o simplemente lo mostramos por tiempo.
      if (!loading) {
        setShowPromoPopup(true);
      }
    }, 8000); // 8000ms = 8 segundos
    return () => clearTimeout(timer);
  }, [loading]);

  const trendingSongs = [
    { title: "APT.", artist: "ROSÉ & Bruno Mars" },
    { title: "Whiplash", artist: "aespa" },
    { title: "Mantra", artist: "JENNIE" },
    { title: "Chk Chk Boom", artist: "Stray Kids" },
    { title: "Cherish (My Love)", artist: "ILLIT" }
  ];

  // --- HELPER: Calcular similitud entre dos strings (Levenshtein simplificado) ---
  const calculateSimilarity = (s1: string, s2: string): number => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;

    const costs = new Array();
    for (let i = 0; i <= longer.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= shorter.length; j++) {
        if (i == 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[shorter.length] = lastValue;
    }
    return (longer.length - costs[shorter.length]) / longer.length;
  };

  // --- HELPER: Alineación Inteligente (Dynamic Programming) ---
  const alignLyricsSequence = (
    originalLines: string[],
    targetLines: string[],
    referenceLines: string[] // Auto-romanización para comparar
  ): string[] => {
    if (!targetLines || targetLines.length === 0) return new Array(originalLines.length).fill("");

    const n = originalLines.length;
    const m = targetLines.length;

    // Matriz de DP
    // dp[i][j] = mejor score alineando original[0..i] con target[0..j]
    const dp: number[][] = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
    const path: number[][] = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0)); // 0: diag, 1: up, 2: left

    // Inicialización
    for (let i = 0; i <= n; i++) dp[i][0] = i * -1; // Penalización por gap
    for (let j = 0; j <= m; j++) dp[0][j] = j * -1;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        // Calcular similitud entre la línea de referencia (auto-rom) y la línea target (genius-rom)
        // O si es metadata, comparar directamente
        const isMeta = /^\[.*\]$/.test(originalLines[i - 1]);
        let matchScore = 0;

        if (isMeta) {
          // Si ambos son metadata, similitud directa
          matchScore = calculateSimilarity(originalLines[i - 1], targetLines[j - 1]) > 0.4 ? 2 : -1;
        } else {
          // Comparar contenido (usando referencia romanizada)
          const sim = calculateSimilarity(referenceLines[i - 1].toLowerCase(), targetLines[j - 1].toLowerCase());
          matchScore = sim > 0.3 ? (sim * 5) : -2; // Bonificar matches fuertes
        }

        const scoreDiag = dp[i - 1][j - 1] + matchScore;
        const scoreUp = dp[i - 1][j] - 1;   // Skip original (gap en target)
        const scoreLeft = dp[i][j - 1] - 1; // Skip target (gap en original)

        if (scoreDiag >= scoreUp && scoreDiag >= scoreLeft) {
          dp[i][j] = scoreDiag;
          path[i][j] = 0;
        } else if (scoreUp >= scoreLeft) {
          dp[i][j] = scoreUp;
          path[i][j] = 1;
        } else {
          dp[i][j] = scoreLeft;
          path[i][j] = 2;
        }
      }
    }

    // Reconstruir el camino (Backtracking)
    const alignedTarget: string[] = new Array(n).fill("");
    let i = n, j = m;

    while (i > 0 && j > 0) {
      if (path[i][j] === 0) {
        // Match: Asignar target[j-1] a original[i-1]
        alignedTarget[i - 1] = targetLines[j - 1];
        i--; j--;
      } else if (path[i][j] === 1) {
        // Skip original: No hay target para este original
        alignedTarget[i - 1] = "";
        i--;
      } else {
        // Skip target: Este target sobra
        j--;
      }
    }

    return alignedTarget;
  };

  // --- LÓGICA DE PROCESAMIENTO ---
  const handleProcess = async (textToProcess?: string, meta?: { title: string; artist: string }) => {
    const text = textToProcess || input;
    if (!text.trim()) return;

    setLoading(true);
    setLyrics([]);
    const songMeta = meta || currentSongMeta;
    const rawLines = text.split("\n").map(l => l.trim());

    setLoadingStep("Buscando traducciones oficiales en ...");
    let geniusRomanized: string[] | null = null;
    let geniusEn: string[] | null = null;
    let geniusEs: string[] | null = null;

    if (songMeta) {
      const [rom, en, es] = await Promise.all([
        findGeniusTranslation(songMeta.title, songMeta.artist, 'romanized'),
        findGeniusTranslation(songMeta.title, songMeta.artist, 'english'),
        findGeniusTranslation(songMeta.title, songMeta.artist, 'spanish')
      ]);

      // 1. Generar Auto-Romanización de referencia (EN EL SERVIDOR)
      // Procesamos todas las líneas en paralelo para rapidez
      const referenceRomanized = await Promise.all(
        rawLines.map(line => generateRomanization(line))
      );

      // 2. Alinear Romanización de Genius usando la referencia
      const geniusRomLines = rom ? rom.split('\n').map(l => l.trim()) : [];
      const alignedRom = alignLyricsSequence(rawLines, geniusRomLines, referenceRomanized);

      // 3. Alinear Traducciones (Intentar usar la misma estructura)
      // Nota: Si la estructura de Genius English difiere mucho de Genius Romanized, 
      // el algoritmo intentará alinearlo independientemente usando metadata como anclas.
      const geniusEnLines = en ? en.split('\n').map(l => l.trim()) : [];
      const alignedEn = alignLyricsSequence(rawLines, geniusEnLines, referenceRomanized); // Usamos refRom también como guía estructural

      const geniusEsLines = es ? es.split('\n').map(l => l.trim()) : [];
      const alignedEs = alignLyricsSequence(rawLines, geniusEsLines, referenceRomanized);

      // Asignar resultados alineados
      geniusRomanized = alignedRom;
      geniusEn = alignedEn;
      geniusEs = alignedEs;

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Smart Alignment Completed');
      }
    }

    setLoadingStep("Procesando (Romanización + Traducción)...");
    const linesToTranslateEn: string[] = [];
    const linesToTranslateEs: string[] = [];
    const indicesForEn: number[] = [];
    const indicesForEs: number[] = [];

    // Pre-calcular romanización fallback para líneas que no tengan match en Genius
    // Ya tenemos referenceRomanized calculado arriba si songMeta existe, pero si no, necesitamos calcularlo
    // Para simplificar, si no hay match de Genius, pediremos romanización al servidor bajo demanda o usamos la referencia ya calculada.

    // Nota: referenceRomanized solo existe dentro del if(songMeta). 
    // Vamos a necesitar esas referencias fuera.

    // REFACTOR RÁPIDO: Mover referenceRomanized fuera del scope o recalcularlo es costoso.
    // Mejor estrategia: Guardar el fallback en un array paralelo.

    const fallbackRomanized = songMeta
      ? await Promise.all(rawLines.map(line => generateRomanization(line)))
      : rawLines; // Si no hay meta, no podemos romanizar bien aun, devolvemos original como placeholder

    const processedLyrics = rawLines.map((line, i) => {
      if (!line) return { original: "", romanized: "", translationEn: "", translationEs: "" };

      const romanized = geniusRomanized && geniusRomanized[i] ? geniusRomanized[i] : fallbackRomanized[i];
      let translationEn = "";
      if (geniusEn && geniusEn[i]) {
        translationEn = geniusEn[i];
      } else {
        linesToTranslateEn.push(line);
        indicesForEn.push(i);
      }
      let translationEs = "";
      if (geniusEs && geniusEs[i]) {
        translationEs = geniusEs[i];
      } else {
        linesToTranslateEs.push(line);
        indicesForEs.push(i);
      }
      return { original: line, romanized, translationEn, translationEs };
    });

    if (linesToTranslateEn.length > 0 || linesToTranslateEs.length > 0) {
      setLoadingStep("Traduciendo líneas restantes...");
      const [batchEn, batchEs] = await Promise.all([
        linesToTranslateEn.length > 0 ? translateBatch(linesToTranslateEn, 'en') : Promise.resolve([]),
        linesToTranslateEs.length > 0 ? translateBatch(linesToTranslateEs, 'es') : Promise.resolve([])
      ]);
      batchEn.forEach((trans, idx) => {
        const originalIdx = indicesForEn[idx];
        if (processedLyrics[originalIdx]) processedLyrics[originalIdx].translationEn = trans;
      });
      batchEs.forEach((trans, idx) => {
        const originalIdx = indicesForEs[idx];
        if (processedLyrics[originalIdx]) processedLyrics[originalIdx].translationEs = trans;
      });
    }

    setLyrics(processedLyrics);

    if (songMeta) {
      setLoadingStep("Guardando en Biblioteca...");
      try {
        await saveSong({
          title: songMeta.title,
          artist: songMeta.artist,
          original: text,
          romanized: processedLyrics.map((l: any) => l.romanized).join("\n"),
          translationEn: processedLyrics.map((l: any) => l.translationEn).join("\n"),
          translationEs: processedLyrics.map((l: any) => l.translationEs).join("\n"),
        });
      } catch (e) {
        console.error("Error guardando en DB:", e);
      }
    }
    setLoading(false);
  };

  const handleSelectLibrarySong = async (song: { slug: string }) => {
    setLoading(true);
    setLoadingStep("Cargando de Biblioteca...");
    setShowLibrary(false);
    try {
      const fullSong = await getSongBySlug(song.slug);
      if (fullSong) {
        setInput(fullSong.original);
        setCurrentSongMeta({ title: fullSong.title, artist: fullSong.artist });

        // Split text fields back into lines
        const originals = fullSong.original.split('\n');
        const romanized = fullSong.romanized.split('\n');
        const en = fullSong.translationEn.split('\n');
        const es = fullSong.translationEs.split('\n');

        setLyrics(originals.map((line: any, i: number) => ({
          original: line,
          romanized: romanized[i] || "",
          translationEn: en[i] || "",
          translationEs: es[i] || ""
        })));
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSelectSong = async (song: { id: number; title: string; artist: string; url: string }) => {
    setLoading(true);
    setLoadingStep("Verificando biblioteca...");
    try {
      const savedMatch = await findSavedSongMatch(song.title, song.artist);
      if (savedMatch) {
        setInput(savedMatch.original);
        setCurrentSongMeta({ title: savedMatch.title, artist: savedMatch.artist });

        // Split text fields back into lines
        const originals = savedMatch.original.split('\n');
        const romanized = savedMatch.romanized.split('\n');
        const en = savedMatch.translationEn.split('\n');
        const es = savedMatch.translationEs.split('\n');

        setLyrics(originals.map((line: any, i: number) => ({
          original: line,
          romanized: romanized[i] || "",
          translationEn: en[i] || "",
          translationEs: es[i] || ""
        })));
        setLoading(false);
        return;
      }
      setLoadingStep("Obteniendo letra...");
      const lyricsText = await fetchLyrics(song.url);
      if (lyricsText) {
        setInput(lyricsText);
        setCurrentSongMeta({ title: song.title, artist: song.artist });
        await handleProcess(lyricsText, { title: song.title, artist: song.artist });
      }
    } catch (error) { console.error(error); setLoading(false); }
  };

  const handleTrendingClick = (title: string, artist: string) => {
    setInput(`${title} - ${artist}`);
    // Simula un "efecto" visual en el input si quisieras
  };

  return (
    <main
      className="min-h-screen p-4 md:p-8 font-sans selection:bg-[var(--primary)] selection:text-[var(--primary-foreground)] overflow-x-hidden transition-colors duration-500 relative"
      data-theme={currentTheme}
      style={{
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))'
      } as React.CSSProperties}
    >

      {/* ================================================================== */}
      {/* MARKETING POP-UP (Usa tailwindcss-animate)                         */}
      {/* ================================================================== */}
      {showPromoPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-500">
          <div className="bg-[var(--card)] border-2 border-[var(--primary)] rounded-[var(--radius)] max-w-md w-full shadow-[0_0_50px_var(--shadow-color)] relative overflow-hidden animate-in zoom-in-95 duration-500">

            {/* Botón Cerrar */}
            <button
              onClick={() => setShowPromoPopup(false)}
              className="absolute top-3 right-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors z-20 bg-[var(--background)]/50 rounded-full p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative">
              {/* Background Effect Decorativo */}
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/10 via-transparent to-transparent pointer-events-none" />

              <div className="p-8 text-center flex flex-col items-center gap-4 relative z-10">
                {/* Icono Animado */}
                <div className="w-20 h-20 bg-[var(--background)] rounded-full flex items-center justify-center border-2 border-[var(--primary)] mb-2 shadow-xl">
                  <Disc className="w-10 h-10 text-[var(--primary)] animate-[spin_3s_linear_infinite]" />
                </div>

                {/* Títulos con gancho */}
                <div className="space-y-1">
                  <h3 className="text-2xl font-black italic tracking-tighter text-[var(--foreground)]">
                    ¿AMAS ESTA CANCIÓN?
                  </h3>
                  <p className="text-sm font-bold text-[var(--primary)] uppercase tracking-widest">
                    HÁZLO REALIDAD
                  </p>
                </div>

                <p className="text-[var(--muted-foreground)] text-sm leading-relaxed">
                  No solo escuches la música. Ten en tus manos los álbumes oficiales, Lightsticks y Photocards de tus grupos favoritos.
                </p>

                {/* Caja de escasez/urgencia */}
                <div className="w-full bg-[var(--muted)]/50 p-3 rounded-lg border border-[var(--border)] my-2">
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-[var(--primary)]">
                    <Sparkles className="w-4 h-4" />
                    <span>POCAPAY GO</span>
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mt-1">
                    La tienda #1 de K-POP llega a México
                  </p>
                </div>

                {/* CTA Principal */}
                <a
                  href="https://instagram.com/pocapay_mx"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full"
                >
                  <Button className="w-full h-14 text-lg font-black uppercase tracking-widest bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 shadow-lg group relative overflow-hidden transition-all hover:scale-105">
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <ShoppingBag className="w-5 h-5 group-hover:animate-bounce" />
                      CONSEGUIR ÁLBUM
                    </span>
                  </Button>
                </a>

                <p className="text-xs text-[var(--muted-foreground)] mt-2 hover:text-[var(--primary)] cursor-pointer transition-colors" onClick={() => setShowPromoPopup(false)}>
                  No gracias, solo quiero traducir
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ================================================================== */}

      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row items-center justify-between border-b border-[var(--border)] pb-6 gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-black tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
            ARAGO LYRICS
          </h1>
        </div>
        <ThemeSwitcher currentTheme={currentTheme} onThemeChange={setCurrentTheme} />
      </header>

      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Input + Info Panel */}
        <div className="flex flex-col gap-6">
          {showLibrary ? (
            <LibraryView onSelect={handleSelectLibrarySong} onClose={() => setShowLibrary(false)} />
          ) : (
            <>
              {/* Card Principal de Input */}
              <Card className="bg-[var(--card)] border-[var(--border)] shadow-2xl overflow-hidden transition-all duration-500">
                <CardHeader className="border-b border-[var(--border)] pb-4">
                  <CardTitle className="text-2xl font-black flex items-center gap-3">
                    <Heart className="text-[var(--primary)] w-6 h-6 fill-[var(--primary)]" />
                    BUSCAR O PEGAR LETRA
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex gap-4 mb-6">
                    <Badge variant="outline" className="bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)] px-3 py-1 text-xs uppercase tracking-widest">
                      <Music2 className="w-3 h-3 mr-2 text-[var(--primary)]" />
                      GENIUS INTEGRATION
                    </Badge>
                  </div>
                  <SearchBar onSelectSong={handleSelectSong} />
                  <div className="relative">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="PEGA LA LETRA EN COREANO AQUÍ..."
                      className="w-full h-[250px] bg-[var(--input)] border-2 border-[var(--border)] rounded-[var(--radius)] p-6 text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] resize-none font-mono text-base leading-relaxed transition-all mb-6"
                    />
                    <div className="absolute bottom-8 right-4 text-xs text-[var(--muted-foreground)] font-mono pointer-events-none">
                      {input.length} chars
                    </div>
                  </div>
                  <Button
                    onClick={() => handleProcess()}
                    disabled={loading || !input.trim()}
                    className="w-full h-16 text-lg font-black bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/80 transition-all rounded-[var(--radius)] shadow-[0_0_20px_var(--shadow-color)]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin w-6 h-6 mr-2" />
                        {loadingStep || "PROCESANDO..."}
                      </>
                    ) : (
                      <>
                        ROMANIZAR & TRADUCIR <ArrowRight className="w-6 h-6 ml-2" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* === NUEVO PANEL DE DESCRIPCIÓN (INFO PANEL) === */}
              <Card className="bg-[var(--card)]/50 border border-[var(--border)] shadow-none animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-[var(--muted-foreground)]">
                    <Info className="w-5 h-5 text-[var(--primary)]" />
                    SOBRE ESTA HERRAMIENTA
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[var(--muted-foreground)] space-y-3">
                  <p>
                    <strong className="text-[var(--foreground)]">ARAGO LYRICS</strong> elimina la barrera del idioma.
                    Transforma cualquier letra de Hangul (Coreano) a <span className="text-[var(--primary)] font-bold">Romanización</span> legible y
                    traducción precisa al Español o Inglés al instante.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="flex items-center gap-2 bg-[var(--muted)]/50 p-2 rounded border border-[var(--border)]">
                      <CircleStar className="w-4 h-4 text-[var(--secondary)]" />
                      <span className="text-xs font-mono font-bold">100% GRATIS</span>
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--muted)]/50 p-2 rounded border border-[var(--border)]">
                      <Type className="w-4 h-4 text-[var(--secondary)]" />
                      <span className="text-xs font-mono font-bold">ROMANIZACIÓN & TRADUCCIÓN</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Results Section */}
        <div className="relative min-h-[600px]">
          {loading ? (
            <FullPanelLoader step={loadingStep} />
          ) : (
            <Card className="h-[80vh] bg-[var(--card)] border-[var(--border)] shadow-2xl overflow-hidden flex flex-col transition-all duration-500">
              <CardHeader className="border-b border-[var(--border)] pb-4 shrink-0 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <RefreshCw className="text-[var(--secondary)] w-5 h-5" />
                  RESULTADOS
                </CardTitle>
                <Tabs value={language} onValueChange={(v) => setLanguage(v as 'rom' | 'en' | 'es')} className="w-auto">
                  <TabsList className="bg-[var(--muted)] border border-[var(--border)]">
                    <TabsTrigger value="rom" className="data-[state=active]:bg-[var(--secondary)] data-[state=active]:text-[var(--secondary-foreground)] font-bold">ROM</TabsTrigger>
                    <TabsTrigger value="en" className="data-[state=active]:bg-[var(--background)] data-[state=active]:text-[var(--foreground)] font-bold">ING</TabsTrigger>
                    <TabsTrigger value="es" className="data-[state=active]:bg-[var(--primary)] data-[state=active]:text-[var(--primary-foreground)] font-bold">ESP</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden relative">
                <ScrollArea className="h-full w-full">
                  {lyrics.length > 0 ? (
                    <div className="w-full">
                      {/* Table Header */}
                      <div className="sticky top-0 z-10 bg-[var(--primary)] border-b-2 border-[var(--primary)] grid grid-cols-2 gap-4 p-4 font-black text-sm uppercase tracking-wider shadow-lg">
                        <div className="text-[var(--primary-foreground)]">한국어 (Coreano)</div>
                        <div className="text-[var(--primary-foreground)] opacity-90">
                          {language === 'rom' ? 'Romanización' : (language === 'en' ? 'Traducción (Inglés)' : 'Traducción (Español)')}
                        </div>
                      </div>

                      {/* Table Body */}
                      <div className="p-4">
                        {lyrics.map((line, idx) => (
                          <div
                            key={idx}
                            className={`
                              grid grid-cols-2 gap-4 py-3 px-2
                              border-b border-[var(--border)]/30
                              hover:bg-[var(--muted)]/30 
                              transition-all duration-200
                              ${!line.original ? 'opacity-30' : ''}
                            `}
                          >
                            {/* Korean Column */}
                            <div className="text-base font-medium leading-relaxed text-[var(--foreground)]">
                              {line.original || '—'}
                            </div>

                            {/* Dynamic Column (Rom/En/Es) */}
                            <div className={`text-sm leading-relaxed ${language === 'rom' ? 'font-mono text-[var(--primary)]' : 'font-semibold text-[var(--secondary)]'}`}>
                              {language === 'rom' && (line.romanized || '—')}
                              {language === 'en' && (line.translationEn || '—')}
                              {language === 'es' && (line.translationEs || '—')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // === EMPTY STATE CON TRENDING ===
                    <div className="h-full flex flex-col items-center justify-center p-8 space-y-8 min-h-[400px]">
                      <div className="text-center space-y-2">
                        <div className="inline-flex items-center gap-2 text-[var(--primary)] font-black text-xl tracking-widest uppercase">
                          <Flame className="w-6 h-6 animate-pulse" /> Trending Now
                        </div>
                        <p className="text-sm text-[var(--muted-foreground)] font-mono">LO QUE LOS FANS ESTÁN TRADUCIENDO</p>
                      </div>
                      <div className="grid grid-cols-1 w-full max-w-sm gap-3">
                        {trendingSongs.map((song, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            onClick={() => handleTrendingClick(song.title, song.artist)}
                            className="group relative h-16 w-full justify-between px-6 border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all duration-300"
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-bold text-base text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">{song.title}</span>
                              <span className="text-xs text-[var(--muted-foreground)] font-mono">{song.artist}</span>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center group-hover:bg-[var(--primary)] transition-colors">
                              <TrendingUp className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--primary-foreground)]" />
                            </div>
                          </Button>
                        ))}
                      </div>
                      <div className="pt-4 flex items-center gap-2 opacity-50 text-[var(--muted-foreground)] text-xs font-mono">
                        <Music2 className="w-4 h-4" /> POWERED BY POCAPAY GO
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main >
  );
}