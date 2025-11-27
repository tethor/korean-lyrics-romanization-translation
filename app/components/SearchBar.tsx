"use client";
import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { searchSong } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

interface SearchBarProps {
    onSelectSong: (song: { id: number; title: string; artist: string; image: string; url: string }) => void;
}

export function SearchBar({ onSelectSong }: SearchBarProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const debouncedQuery = useDebounce(query, 500); // 500ms delay

    useEffect(() => {
        const performSearch = async () => {
            if (!debouncedQuery.trim()) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setLoading(true);
            setIsOpen(true);
            try {
                const data = await searchSong(debouncedQuery);
                setResults(data);
            } catch (error) {
                console.error("Search failed:", error);
            } finally {
                setLoading(false);
            }
        };

        performSearch();
    }, [debouncedQuery]);

    const handleManualSearch = (e: React.FormEvent) => {
        e.preventDefault();
    };

    return (
        <div className="relative w-full max-w-2xl mx-auto mb-8 z-50">
            <form onSubmit={handleManualSearch} className="relative flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 w-5 h-5 z-10" />
                    <Input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="BUSCAR CANCIÓN (ej. BTS Dynamite)..."
                        className="pl-12 py-6 bg-black/50 border-2 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-[#ff0080] focus-visible:border-[#ff0080] text-lg rounded-xl backdrop-blur-sm transition-all"
                    />
                </div>
                <Button
                    type="submit"
                    disabled={loading}
                    className="h-auto px-8 bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-[var(--primary-foreground)] font-black border-2 border-transparent hover:border-[var(--border)] rounded-[var(--radius)] transition-all shadow-[0_0_15px_var(--shadow-color)] hover:shadow-[0_0_25px_var(--shadow-color)]"
                >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "BUSCAR"}
                </Button>
            </form>

            {isOpen && results.length > 0 && (
                <Card className="absolute top-full left-0 right-0 mt-4 bg-[#1a0b2e]/95 backdrop-blur-xl border-2 border-[#ff0080]/50 shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 overflow-hidden rounded-xl">
                    <ScrollArea className="h-[400px]">
                        <div className="p-2">
                            {results.map((song) => (
                                <button
                                    key={song.id}
                                    onClick={() => {
                                        onSelectSong(song);
                                        setIsOpen(false);
                                        setQuery("");
                                        setResults([]);
                                    }}
                                    className="w-full flex items-center gap-4 p-3 hover:bg-white/10 rounded-lg transition-all text-left group"
                                >
                                    <img
                                        src={song.image}
                                        alt={song.title}
                                        className="w-14 h-14 rounded-md object-cover shadow-lg group-hover:scale-105 transition-transform"
                                    />
                                    <div>
                                        <h4 className="text-white font-bold text-base truncate group-hover:text-[#ff0080] transition-colors">{song.title}</h4>
                                        <p className="text-white/50 text-xs font-medium truncate">{song.artist}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>
            )}
        </div>
    );
}
