import { RefreshCw, Music2 } from "lucide-react";

interface FullPanelLoaderProps {
  progress?: { done: number; total: number };
}

export default function FullPanelLoader({ progress }: FullPanelLoaderProps) {
  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col items-center justify-center bg-white p-6 md:p-10 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-[#F472B6] rounded-full blur-xl opacity-50 animate-pulse" />
        <div className="relative w-20 h-20 md:w-24 md:h-24 bg-black border-4 border-black rounded-full flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(244,114,182,1)]">
          <RefreshCw className="w-8 h-8 md:w-10 md:h-10 text-white animate-spin" />
        </div>
      </div>
      <h3 className="font-black text-xl md:text-2xl uppercase tracking-tighter mb-2">
        Traduciendo tu K-Pop...
      </h3>
      <p className="font-medium text-slate-500 text-sm md:text-base">
        {progress && progress.total > 0
          ? `${progress.done} / ${progress.total} líneas (${pct}%)`
          : "Preparando romanización y letras"}
      </p>

      {progress && progress.total > 0 && (
        <div className="w-48 h-2 bg-slate-200 rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-[#F472B6] transition-all duration-300 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
