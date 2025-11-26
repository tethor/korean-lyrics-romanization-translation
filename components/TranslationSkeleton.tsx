import { Loader2 } from "lucide-react";

export default function TranslationSkeleton() {
    return (
        <div className="flex items-center gap-2 text-slate-400 animate-pulse select-none">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-mono text-sm">TRADUCIENDO...</span>
        </div>
    );
}
