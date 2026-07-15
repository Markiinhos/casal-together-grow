-- Add source_type to shopping_items
ALTER TABLE public.shopping_items 
ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual';

-- Voice assistant commands table
CREATE TABLE IF NOT EXISTS public.voice_assistant_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'private',
  transcript text NOT NULL,
  intent text,
  entities jsonb,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

-- RLS for voice_assistant_commands
ALTER TABLE public.voice_assistant_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own voice commands" 
  ON public.voice_assistant_commands FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));

CREATE POLICY "Users can insert own voice commands" 
  ON public.voice_assistant_commands FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));

CREATE POLICY "Users can update own voice commands" 
  ON public.voice_assistant_commands FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_assistant_commands TO authenticated;
GRANT ALL ON public.voice_assistant_commands TO service_role;
