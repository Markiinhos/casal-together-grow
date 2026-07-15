import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceAssistantButtonProps {
  onClick: () => void;
  className?: string;
}

export function VoiceAssistantButton({ onClick, className }: VoiceAssistantButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className={`rounded-full shadow-lg gradient-coral text-white h-14 w-14 hover:scale-105 active:scale-95 transition-transform ${className}`}
    >
      <Mic className="size-6" />
    </Button>
  );
}
