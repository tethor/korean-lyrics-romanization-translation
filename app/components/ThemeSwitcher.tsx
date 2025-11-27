"use client";

import { Monitor, Cloud, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "neo" | "dream" | "editorial";

interface ThemeSwitcherProps {
    currentTheme: Theme;
    onThemeChange: (theme: Theme) => void;
}

export function ThemeSwitcher({ currentTheme, onThemeChange }: ThemeSwitcherProps) {
    return (
        <div className="flex gap-2 p-1 bg-black/20 backdrop-blur-md rounded-full border border-white/10">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onThemeChange("neo")}
                className={cn(
                    "rounded-full px-3 transition-all",
                    currentTheme === "neo"
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_0_10px_var(--shadow-color)]"
                        : "text-[var(--foreground)]/50 hover:text-[var(--foreground)] hover:bg-[var(--primary)]/10"
                )}
            >
                <Monitor className="w-4 h-4 mr-2" />
                NEO
            </Button>

            <Button
                variant="ghost"
                size="sm"
                onClick={() => onThemeChange("dream")}
                className={cn(
                    "rounded-full px-3 transition-all",
                    currentTheme === "dream"
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_0_10px_var(--shadow-color)]"
                        : "text-[var(--foreground)]/50 hover:text-[var(--foreground)] hover:bg-[var(--primary)]/10"
                )}
            >
                <Cloud className="w-4 h-4 mr-2" />
                DREAM
            </Button>

            <Button
                variant="ghost"
                size="sm"
                onClick={() => onThemeChange("editorial")}
                className={cn(
                    "rounded-full px-3 transition-all",
                    currentTheme === "editorial"
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_0_10px_var(--shadow-color)]"
                        : "text-[var(--foreground)]/50 hover:text-[var(--foreground)] hover:bg-[var(--primary)]/10"
                )}
            >
                <Type className="w-4 h-4 mr-2" />
                EDIT
            </Button>
        </div>
    );
}
