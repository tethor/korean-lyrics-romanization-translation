"use client";

import { useState, useEffect } from "react";
import { getSavedSongs, deleteSong } from "@/app/actions";
import { Music2, Trash2, Calendar, PlayCircle, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type SavedSong = {
    id: number;
    title: string;
    artist: string;
    slug: string;
    createdAt: Date;
};

interface LibraryViewProps {
    onSelect: (song: SavedSong) => void;
    onClose: () => void;
}

export function LibraryView({ onSelect, onClose }: LibraryViewProps) {
    const [songs, setSongs] = useState<SavedSong[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSongs();
    }, []);

    const loadSongs = async () => {
        setLoading(true);
        try {
            const data = await getSavedSongs();
            setSongs(data);
        } catch (error) {
            console.error("Error loading library:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!confirm("¿Estás seguro de eliminar esta canción?")) return;

        try {
            await deleteSong(id);
            setSongs(songs.filter(s => s.id !== id));
        } catch (error) {
            console.error("Error deleting song:", error);
        }
    };

    return (
        <div className="bg-[#1a0b2e] border-4 border-white p-8 shadow-[8px_8px_0px_0px_#ff0080] h-[80vh] flex flex-col relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 border-b-4 border-white pb-4">
                <h2 className="text-3xl font-black text-white flex items-center gap-3 uppercase tracking-wide">
                    <Music2 className="text-[#ff0080] w-8 h-8" />
                    MI BIBLIOTECA
                    <span className="text-lg bg-[#ff0080] text-white px-3 py-1 border-2 border-white shadow-[2px_2px_0px_0px_#ffffff]">
                        {songs.length}
                    </span>
                </h2>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-[var(--primary)] border-2 border-transparent hover:border-[var(--border)] transition-all text-[var(--foreground)] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]"
                >
                    <X className="w-8 h-8" />
                </button>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-32 bg-white/5 border-2 border-white/10 animate-pulse" />
                        ))}
                    </div>
                ) : songs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-white/30 gap-6">
                        <Music2 className="w-24 h-24 opacity-20" />
                        <p className="text-2xl font-black uppercase">Tu biblioteca está vacía</p>
                        <p className="text-sm font-bold">Busca y traduce canciones para guardarlas aquí.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
                        {songs.map((song) => (
                            <div
                                key={song.id}
                                onClick={() => onSelect(song)}
                                className="group bg-[var(--muted)] hover:bg-[var(--primary)] border-4 border-[var(--border)] p-5 cursor-pointer transition-all hover:translate-x-[2px] hover:translate-y-[2px] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] relative"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-black text-xl text-white group-hover:text-white transition-colors line-clamp-1 uppercase">
                                        {song.title}
                                    </h3>
                                    <button
                                        onClick={(e) => handleDelete(e, song.id)}
                                        className="text-white/40 hover:text-white transition-colors p-1"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>

                                <p className="text-white/80 text-sm font-bold mb-4 flex items-center gap-2 uppercase">
                                    <Music2 className="w-4 h-4" />
                                    {song.artist}
                                </p>

                                <div className="flex items-center justify-between text-xs text-white/60 group-hover:text-white/80 font-mono">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {format(new Date(song.createdAt), "d MMM yyyy", { locale: es })}
                                    </span>
                                    <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-white font-black bg-black px-2 py-1 border border-white">
                                        <PlayCircle className="w-3 h-3" />
                                        ABRIR
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

}
