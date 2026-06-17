import { useEffect, useState } from "react";
import { Camera, Heart, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  coupleId: string;
  photoPath: string | null;
  size?: number;
  editable?: boolean;
  className?: string;
}

export function CoupleAvatar({ coupleId, photoPath, size = 64, editable = false, className = "" }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    let active = true;
    if (!photoPath) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("couple-photos")
      .createSignedUrl(photoPath, 60 * 60)
      .then(({ data }) => {
        if (active && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [photoPath]);

  async function handleFile(file: File) {
    if (!coupleId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${coupleId}/cover-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("couple-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // delete previous if existed
      if (photoPath && photoPath !== path) {
        await supabase.storage.from("couple-photos").remove([photoPath]);
      }

      const { error: dbErr } = await supabase
        .from("couples")
        .update({ photo_url: path })
        .eq("id", coupleId);
      if (dbErr) throw dbErr;
      toast.success("Foto atualizada!");
      qc.invalidateQueries({ queryKey: ["couple"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar foto");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!photoPath || !confirm("Remover foto do casal?")) return;
    setUploading(true);
    try {
      await supabase.storage.from("couple-photos").remove([photoPath]);
      await supabase.from("couples").update({ photo_url: null }).eq("id", coupleId);
      toast.success("Foto removida");
      qc.invalidateQueries({ queryKey: ["couple"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  const dim = { width: size, height: size };

  return (
    <div className={`relative shrink-0 ${className}`} style={dim}>
      <div
        className="rounded-2xl overflow-hidden bg-white/20 flex items-center justify-center"
        style={dim}
      >
        {url ? (
          <img src={url} alt="Foto do casal" className="w-full h-full object-cover" />
        ) : (
          <Heart className="opacity-80" style={{ width: size * 0.45, height: size * 0.45 }} fill="currentColor" />
        )}
      </div>
      {editable && (
        <>
          <label className="absolute -bottom-1 -right-1 size-7 rounded-full bg-white text-primary shadow-md flex items-center justify-center cursor-pointer hover:scale-105 transition">
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {photoPath && (
            <button
              onClick={handleRemove}
              disabled={uploading}
              className="absolute -top-1 -right-1 size-6 rounded-full bg-white text-destructive shadow-md flex items-center justify-center"
              title="Remover foto"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
