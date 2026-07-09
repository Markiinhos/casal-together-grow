
-- Notify partner about shared task events
CREATE OR REPLACE FUNCTION public.notify_partner_on_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_couple uuid;
  v_actor uuid;
  v_actor_name text;
  v_partner uuid;
  v_title text;
  v_body text;
  v_link text;
  v_task_id uuid;
  v_task_name text;
  v_visibility text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_couple := OLD.couple_id;
    v_actor := auth.uid();
    v_task_id := OLD.id;
    v_task_name := OLD.name;
    v_visibility := OLD.visibility;
  ELSE
    v_couple := NEW.couple_id;
    v_actor := COALESCE(NEW.completed_by, auth.uid(), NEW.user_id);
    v_task_id := NEW.id;
    v_task_name := NEW.name;
    v_visibility := NEW.visibility;
  END IF;

  -- Only shared tasks
  IF v_visibility IS DISTINCT FROM 'shared' OR v_couple IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Find partner (other member of the couple, not the actor)
  SELECT id INTO v_partner
  FROM public.profiles
  WHERE couple_id = v_couple AND id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_partner IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(full_name, 'Seu parceiro') INTO v_actor_name
  FROM public.profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Seu parceiro');

  v_link := '/app/tarefas';

  IF TG_OP = 'INSERT' THEN
    v_title := v_actor_name || ' adicionou uma nova tarefa';
    v_body := v_task_name;
  ELSIF TG_OP = 'DELETE' THEN
    v_title := v_actor_name || ' removeu uma tarefa';
    v_body := v_task_name;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.completed = true AND COALESCE(OLD.completed, false) = false THEN
      v_title := v_actor_name || ' concluiu uma tarefa';
      v_body := v_task_name;
    ELSIF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      v_title := v_actor_name || ' alterou o prazo de uma tarefa';
      v_body := v_task_name;
    ELSIF NEW.responsible IS DISTINCT FROM OLD.responsible THEN
      v_title := v_actor_name || ' alterou o responsável';
      v_body := v_task_name;
    ELSIF NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description OR NEW.priority IS DISTINCT FROM OLD.priority THEN
      v_title := v_actor_name || ' atualizou uma tarefa';
      v_body := v_task_name;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (v_partner, v_title, v_body, 'task', v_link);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_partner_task_ins ON public.house_tasks;
DROP TRIGGER IF EXISTS trg_notify_partner_task_upd ON public.house_tasks;
DROP TRIGGER IF EXISTS trg_notify_partner_task_del ON public.house_tasks;

CREATE TRIGGER trg_notify_partner_task_ins
AFTER INSERT ON public.house_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_task();

CREATE TRIGGER trg_notify_partner_task_upd
AFTER UPDATE ON public.house_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_task();

CREATE TRIGGER trg_notify_partner_task_del
AFTER DELETE ON public.house_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_task();
