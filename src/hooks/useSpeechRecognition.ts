import { useState, useEffect, useCallback, useRef } from "react";

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  reset: () => void;
  isSupported: boolean;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  
  const isSupported = typeof window !== "undefined" && 
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    if (!isSupported) return;

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "pt-BR";

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          finalTranscript += event.results[i][0].transcript;
        }
        setTranscript(finalTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === "not-allowed") {
          setError("Não foi possível acessar o microfone. Libere a permissão nas configurações do aparelho.");
        } else {
          setError(`Erro de reconhecimento: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (err: any) {
      console.error("SpeechRecognition initialization failed:", err);
      setError("Reconhecimento de voz não suportado ou bloqueado neste navegador.");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [isSupported]);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError("O reconhecimento de voz não está disponível neste navegador. Você pode digitar abaixo.");
      return;
    }
    setError(null);
    setTranscript("");

    // 1. Tenta solicitar a permissão nativa de microfone do navegador/Android se necessário
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Fecha o stream imediatamente para liberar a captura para o SpeechRecognition
        stream.getTracks().forEach((track) => track.stop());
      } catch (permErr: any) {
        console.warn("Aviso na solicitação de microfone via getUserMedia:", permErr);
        if (permErr?.name === "NotAllowedError" || permErr?.name === "PermissionDeniedError") {
          const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.();
          setError(
            isNativeApp
              ? "Microfone bloqueado. Abra Configurações do celular > Apps > Casal > Permissões > Microfone e escolha Permitir."
              : "Permissão de microfone não autorizada. Toque no ícone do cadeado (🔒) ao lado do endereço e permita o microfone."
          );
          return;
        }
      }
    }

    // 2. Inicia o SpeechRecognition
    try {
      recognitionRef.current?.start();
    } catch (e: any) {
      if (e.name !== 'InvalidStateError') {
        console.warn("SpeechRecognition start error:", e);
        setError("Não foi possível iniciar o microfone. Tente digitar seu pedido.");
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const reset = useCallback(() => {
    setTranscript("");
    setError(null);
    if (isListening) stopListening();
  }, [isListening, stopListening]);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    reset,
    isSupported,
  };
}
