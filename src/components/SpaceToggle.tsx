import { User, Heart } from "lucide-react";
import { useSpace } from "@/lib/space";

export function SpaceToggle({ className = "" }: { className?: string }) {
  const { space, setSpace } = useSpace();
  return (
    <div className={`inline-flex rounded-full bg-muted p-1 text-xs font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => setSpace("private")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
          space === "private" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
        }`}
      >
        <User className="size-3.5" /> Meu
      </button>
      <button
        type="button"
        onClick={() => setSpace("shared")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
          space === "shared" ? "gradient-coral text-white shadow-sm" : "text-muted-foreground"
        }`}
      >
        <Heart className="size-3.5" /> Nosso
      </button>
    </div>
  );
}
