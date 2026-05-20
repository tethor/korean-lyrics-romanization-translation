"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, Music2, Loader2 } from "lucide-react";

type SearchResult = {
  id: number;
  title: string;
  artist: string;
  thumbnail: string;
  url: string;
};

type Props = {
  onLyricsLoaded: (lyrics: string) => void;
};

export default function GeniusSearch({ onLyricsLoaded }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchGenius = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Search failed");
      }

      setResults(data.results || []);
      setIsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      searchGenius(value);
    }, 400);
  };

  const handleSelectResult = async (result: SearchResult) => {
    setLoadingLyrics(result.id);
    setError(null);
    setIsOpen(false);

    try {
      const res = await fetch(
        `/api/lyrics?url=${encodeURIComponent(result.url)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load lyrics");
      }

      onLyricsLoaded(data.lyrics);
      setQuery(`${result.title} - ${result.artist}`);
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lyrics");
    } finally {
      setLoadingLyrics(null);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setError(null);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder='Buscar canción... (ej: "Ditto NewJeans")'
            className="w-full pl-9 pr-8 py-2.5 bg-slate-100 border-4 border-black font-medium focus:outline-none focus:ring-4 focus:ring-[#F472B6] text-sm"
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {searching && (
          <Loader2 className="w-5 h-5 animate-spin text-[#F472B6]" />
        )}
      </div>

      {error && (
        <p className="text-red-500 text-xs mt-1 font-medium">{error}</p>
      )}

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-h-64 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => handleSelectResult(result)}
              disabled={loadingLyrics !== null}
              className="w-full flex items-center gap-3 p-3 hover:bg-[#FDF2F8] transition-colors border-b-2 border-slate-100 last:border-b-0 text-left"
            >
              {result.thumbnail ? (
                <img
                  src={result.thumbnail}
                  alt=""
                  className="w-10 h-10 object-cover border-2 border-black"
                />
              ) : (
                <div className="w-10 h-10 bg-slate-200 border-2 border-black flex items-center justify-center">
                  <Music2 className="w-4 h-4 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{result.title}</p>
                <p className="text-xs text-slate-500 truncate">
                  {result.artist}
                </p>
              </div>
              {loadingLyrics === result.id && (
                <Loader2 className="w-4 h-4 animate-spin text-[#F472B6]" />
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query.length >= 2 && !searching && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4 text-center text-slate-500 text-sm">
          No se encontraron resultados
        </div>
      )}
    </div>
  );
}
