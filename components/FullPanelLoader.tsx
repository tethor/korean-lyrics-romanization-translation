import { RefreshCw, Music2 } from "lucide-react";

export default function FullPanelLoader() {
    return (
        <div className="h-full flex flex-col items-center justify-center bg-white p-10 text-center animate-pulse">
            <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#F472B6] rounded-full blur-xl opacity-50 animate-pulse"></div>
                <div className="relative w-24 h-24 bg-black border-4 border-black rounded-full flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(244,114,182,1)]">
                    <RefreshCw className="w-10 h-10 text-white animate-spin" />
                </div>
            </div>
            <h3 className="font-black text-2xl uppercase tracking-tighter mb-2">
                Traduciendo tu K-Pop...
            </h3>
            <p className="font-medium text-slate-500">
                Preparando romanización y letras
            </p>
        </div>
    );
}
