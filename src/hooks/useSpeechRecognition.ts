import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { App } from "@capacitor/app";

export type MicrophoneState =
  | "checking"
  | "granted"
  | "prompt"
  | "denied"
  | "unavailable"
  | "listening"
  | "error";

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  microphoneState: MicrophoneState;
  isNative: boolean;
  isAvailable: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  reset: () => void;
  checkPermissionState: () => Promise<MicrophoneState>;
  requestPermission: () => Promise<MicrophoneState>;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("checking");
  const [isAvailable, setIsAvailable] = useState(true);

  const partialListenerRef = useRef<PluginListenerHandle | null>(null);
  const listeningStateListenerRef = useRef<PluginListenerHandle | null>(null);
  const webRecognitionRef = useRef<any>(null);

  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();

  /**
   * 1. Verifica estado de permissão do microfone
   * - No APK: Consulta SpeechRecognition.checkPermissions() (RECORD_AUDIO no Android)
   * - Na Web: Consulta navigator.permissions ou disponibilidade do Web Speech API
   */
  const checkPermissionState = useCallback(async (): Promise<MicrophoneState> => {
    const platform = Capacitor.getPlatform();
    console.log(`[Voice] platform: ${platform}`);
    console.log(`[Voice] native: ${isNative}`);

    if (isNative) {
      try {
        // Verifica se o serviço de reconhecimento existe no aparelho
        const avail = await SpeechRecognition.available();
        console.log(`[Voice] available: ${avail.available}`);
        setIsAvailable(avail.available);

        if (!avail.available) {
          setMicrophoneState("unavailable");
          return "unavailable";
        }

        // Consulta o status real da permissão RECORD_AUDIO
        const perm = await SpeechRecognition.checkPermissions();
        console.log(`[Voice] permission: ${perm.speechRecognition}`);

        if (perm.speechRecognition === "granted") {
          setMicrophoneState("granted");
          setError(null);
          return "granted";
        } else if (perm.speechRecognition === "denied") {
          setMicrophoneState("denied");
          return "denied";
        } else {
          setMicrophoneState("prompt");
          return "prompt";
        }
      } catch (err: any) {
        console.error("[Voice] error checking native permissions:", err);
        setMicrophoneState("prompt");
        return "prompt";
      }
    } else {
      // ── MODO WEB / PWA ──
      const webSupported =
        typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
      setIsAvailable(webSupported);

      if (!webSupported) {
        setMicrophoneState("unavailable");
        return "unavailable";
      }

      try {
        if (typeof navigator !== "undefined" && navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
          console.log(`[Voice] (Web) permission state: ${status.state}`);
          if (status.state === "granted") {
            setMicrophoneState("granted");
            setError(null);
            return "granted";
          } else if (status.state === "denied") {
            setMicrophoneState("denied");
            return "denied";
          } else {
            setMicrophoneState("prompt");
            return "prompt";
          }
        }
      } catch {
        // Navegador sem suporte a query direta de microfone
      }

      setMicrophoneState("prompt");
      return "prompt";
    }
  }, [isNative]);

  /**
   * 2. Solicita a permissão do microfone
   */
  const requestPermission = useCallback(async (): Promise<MicrophoneState> => {
    if (isNative) {
      try {
        console.log("[Voice] Requesting native RECORD_AUDIO permission...");
        const perm = await SpeechRecognition.requestPermissions();
        console.log(`[Voice] Requested permission result: ${perm.speechRecognition}`);

        if (perm.speechRecognition === "granted") {
          setMicrophoneState("granted");
          setError(null);
          return "granted";
        } else if (perm.speechRecognition === "denied") {
          setMicrophoneState("denied");
          return "denied";
        } else {
          setMicrophoneState("prompt");
          return "prompt";
        }
      } catch (err: any) {
        console.error("[Voice] error requesting native permission:", err);
        setMicrophoneState("denied");
        return "denied";
      }
    } else {
      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          setMicrophoneState("granted");
          setError(null);
          return "granted";
        }
      } catch (err: any) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setMicrophoneState("denied");
          return "denied";
        }
      }
      return "prompt";
    }
  }, [isNative]);

  /**
   * 3. Inicia o reconhecimento de fala
   * - No APK: Plugin nativo com pt-BR, maxResults e partialResults
   * - Na Web: Web Speech API com pt-BR
   */
  const startListening = useCallback(async () => {
    setError(null);
    setTranscript("");

    if (isNative) {
      // 1. Verifica disponibilidade
      const avail = await SpeechRecognition.available();
      console.log(`[Voice] available: ${avail.available}`);
      if (!avail.available) {
        console.warn("[Voice] Speech recognition unavailable on device");
        setMicrophoneState("unavailable");
        setError("O reconhecimento de voz não está disponível neste dispositivo. Você ainda pode digitar sua pergunta.");
        return;
      }

      // 2. Verifica e solicita permissão se necessário
      const perm = await SpeechRecognition.checkPermissions();
      let currentPerm = perm.speechRecognition;
      console.log(`[Voice] permission: ${currentPerm}`);

      if (currentPerm === "prompt" || currentPerm === "prompt-with-rationale") {
        console.log("[Voice] Permission is prompt, requesting now...");
        const requested = await SpeechRecognition.requestPermissions();
        currentPerm = requested.speechRecognition;
        console.log(`[Voice] Permission after request: ${currentPerm}`);
      }

      if (currentPerm !== "granted") {
        setMicrophoneState("denied");
        setError("Permissão de microfone negada. Acesse Configurações do celular > Apps > Casal > Permissões e autorize o Microfone.");
        return;
      }

      setMicrophoneState("granted");

      // 3. Limpa listeners anteriores
      if (partialListenerRef.current) {
        try {
          await partialListenerRef.current.remove();
        } catch {}
        partialListenerRef.current = null;
      }
      if (listeningStateListenerRef.current) {
        try {
          await listeningStateListenerRef.current.remove();
        } catch {}
        listeningStateListenerRef.current = null;
      }

      // Registra listeners de estado de escuta e streaming parcial
      try {
        listeningStateListenerRef.current = await SpeechRecognition.addListener("listeningState", (data) => {
          console.log(`[Voice] listening: ${data.status === "started"}`);
          if (data.status === "started") {
            setIsListening(true);
            setMicrophoneState("listening");
          } else if (data.status === "stopped") {
            setIsListening(false);
            setMicrophoneState("granted");
          }
        });

        partialListenerRef.current = await SpeechRecognition.addListener("partialResults", (data) => {
          if (data.matches && data.matches.length > 0) {
            const match = data.matches[0];
            console.log(`[Voice] result: "${match}"`);
            setTranscript(match);
          }
        });
      } catch (listenerErr) {
        console.warn("[Voice] Failed to add listeners:", listenerErr);
      }

      // 4. Inicia gravação nativa
      try {
        console.log("[Voice] starting recognition");
        setIsListening(true);
        setMicrophoneState("listening");
        console.log("[Voice] listening: true");

        const res = await SpeechRecognition.start({
          language: "pt-BR",
          maxResults: 3,
          partialResults: true,
          popup: false,
        });

        if (res && res.matches && res.matches.length > 0) {
          const finalMatch = res.matches[0];
          console.log(`[Voice] result: "${finalMatch}"`);
          setTranscript(finalMatch);
        }
      } catch (err: any) {
        console.error("[Voice] error code:", err?.code, "message:", err?.message);
        setIsListening(false);
        setMicrophoneState("granted");
        if (err?.message?.includes("denied") || err?.code === "permission_denied") {
          setMicrophoneState("denied");
          setError("Permissão de microfone negada.");
        } else {
          console.warn("[Voice] Non-permission recognition error:", err?.message || err);
        }
      }
    } else {
      // ── MODO NAVEGADOR (WEB SPEECH API FALLBACK) ──
      const webSupported =
        typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

      if (!webSupported) {
        setMicrophoneState("unavailable");
        setError("Reconhecimento de voz não suportado pelo navegador. Digite sua pergunta.");
        return;
      }

      try {
        console.log("[Voice] (Web) starting recognition");
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = "pt-BR";

        rec.onstart = () => {
          console.log("[Voice] listening: true");
          setIsListening(true);
          setMicrophoneState("listening");
        };

        rec.onresult = (event: any) => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          console.log(`[Voice] result: "${text}"`);
          setTranscript(text);
        };

        rec.onerror = (event: any) => {
          console.error("[Voice] error code:", event.error);
          setIsListening(false);
          if (event.error === "not-allowed") {
            setMicrophoneState("denied");
            setError("Permissão de microfone negada no navegador.");
          } else if (event.error !== "no-speech") {
            setError(`Erro no microfone: ${event.error}`);
          }
        };

        rec.onend = () => {
          console.log("[Voice] listening: false");
          setIsListening(false);
          setMicrophoneState("granted");
        };

        webRecognitionRef.current = rec;
        rec.start();
      } catch (e: any) {
        console.error("[Voice] (Web) start error:", e);
        setIsListening(false);
      }
    }
  }, [isNative]);

  /**
   * 4. Para a gravação
   */
  const stopListening = useCallback(async () => {
    console.log("[Voice] stopListening requested");
    if (isNative) {
      try {
        await SpeechRecognition.stop();
      } catch (e) {
        console.warn("[Voice] Error calling SpeechRecognition.stop():", e);
      }
      setIsListening(false);
      setMicrophoneState("granted");
    } else {
      if (webRecognitionRef.current) {
        try {
          webRecognitionRef.current.stop();
        } catch (e) {
          console.warn("[Voice] (Web) stop error:", e);
        }
      }
      setIsListening(false);
      setMicrophoneState("granted");
    }
  }, [isNative]);

  /**
   * 5. Reseta transcrição e erros
   */
  const reset = useCallback(() => {
    setTranscript("");
    setError(null);
    if (isListening) {
      stopListening();
    }
  }, [isListening, stopListening]);

  /**
   * 6. Re-verificação ao retornar das Configurações do Android (appStateChange)
   * Se o usuário foi em Configurações > Apps > Casal > Permissões e permitiu o microfone,
   * ao voltar para o app a permissão passa a ser reconhecida como "granted" imediatamente!
   */
  useEffect(() => {
    if (!isNative) return;

    let subHandle: PluginListenerHandle | null = null;
    const setupLifecycle = async () => {
      try {
        subHandle = await App.addListener("appStateChange", async ({ isActive }) => {
          if (isActive) {
            console.log("[Voice] App resumed (active) -> re-verifying microphone permission");
            await checkPermissionState();
          }
        });
      } catch (e) {
        console.warn("[Voice] Error registering appStateChange listener:", e);
      }
    };

    setupLifecycle();

    return () => {
      if (subHandle) {
        subHandle.remove();
      }
    };
  }, [isNative, checkPermissionState]);

  // Limpeza de listeners ao desmontar o hook
  useEffect(() => {
    return () => {
      if (partialListenerRef.current) {
        try {
          partialListenerRef.current.remove();
        } catch {}
        partialListenerRef.current = null;
      }
      if (listeningStateListenerRef.current) {
        try {
          listeningStateListenerRef.current.remove();
        } catch {}
        listeningStateListenerRef.current = null;
      }
      if (webRecognitionRef.current) {
        try {
          webRecognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // Checagem inicial na montagem
  useEffect(() => {
    checkPermissionState();
  }, [checkPermissionState]);

  return {
    isListening,
    transcript,
    error,
    microphoneState,
    isNative,
    isAvailable,
    startListening,
    stopListening,
    reset,
    checkPermissionState,
    requestPermission,
  };
}
