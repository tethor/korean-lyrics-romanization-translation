import { RefreshCw, Music2 } from "lucide-react";

export default function FullPanelLoader({ step }: { step?: string }) {
    return (
        <div className="h-full flex flex-col items-center justify-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center animate-pulse">
            <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#ff0080] rounded-full blur-xl opacity-50 animate-pulse"></div>
                <div className="relative w-24 h-24 bg-black border-4 border-black rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,0,128,0.5)]">
                    <RefreshCw className="w-10 h-10 text-white animate-spin" />
                </div>
            </div>
            <h3 className="font-black text-2xl uppercase tracking-tighter mb-2 text-white">
                {step || "PROCESANDO..."}
            </h3>
            <p className="font-medium text-white/50">
                Preparando tu experiencia K-Pop
            </p>
        </div>
    );
}
