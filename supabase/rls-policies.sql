-- =============================================
-- DreamCore V2 - RLS Policies (Phase 1)
-- =============================================
-- Run this AFTER schema.sql
-- Phase 1: Owner-only access (no public sharing)
-- =============================================

-- =============================================
-- ENABLE RLS ON ALL TABLES
-- =============================================
-- NOTE: profiles テーブルは削除済み（004_schema_improvements.sql）
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- USERS POLICIES
-- =============================================
DROP POLICY IF EXISTS "users_read_own" ON public.users;
CREATE POLICY "users_read_own"
  ON public.users FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- =============================================
-- PROJECTS POLICIES (Owner-only for Phase 1)
-- =============================================
DROP POLICY IF EXISTS "Users can read own projects" ON public.projects;
CREATE POLICY "Users can read own projects"
  ON public.projects FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (user_id = auth.uid());

-- NOTE: Public projects policy removed for Phase 1
-- Add back in Phase 2:
-- CREATE POLICY "Anyone can read public projects"
--   ON public.projects FOR SELECT
--   USING (is_public = TRUE);

-- =============================================
-- ASSETS POLICIES (Owner-only for Phase 1)
-- =============================================
-- Owner can read non-deleted assets only
DROP POLICY IF EXISTS "Users can read own assets" ON public.assets;
CREATE POLICY "Users can read own assets"
  ON public.assets FOR SELECT
  USING (owner_id = auth.uid() AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can insert own assets" ON public.assets;
CREATE POLICY "Users can insert own assets"
  ON public.assets FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own assets" ON public.assets;
CREATE POLICY "Users can update own assets"
  ON public.assets FOR UPDATE
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own assets" ON public.assets;
CREATE POLICY "Users can delete own assets"
  ON public.assets FOR DELETE
  USING (owner_id = auth.uid());

-- NOTE: Public assets policy removed for Phase 1
-- Add back in Phase 2:
-- CREATE POLICY "Anyone can read public assets"
--   ON public.assets FOR SELECT
--   USING (is_public = TRUE AND is_deleted = FALSE);

-- =============================================
-- PROJECT_ASSETS POLICIES
-- =============================================
-- Users can manage project_assets for their own projects AND own assets
DROP POLICY IF EXISTS "Users can read own project_assets" ON public.project_assets;
CREATE POLICY "Users can read own project_assets"
  ON public.project_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_assets.project_id
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own project_assets" ON public.project_assets;
CREATE POLICY "Users can insert own project_assets"
  ON public.project_assets FOR INSERT
  WITH CHECK (
    -- Must own the project
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_assets.project_id
      AND projects.user_id = auth.uid()
    )
    AND
    -- Must own the asset (Phase 1: own assets only)
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.id = project_assets.asset_id
      AND assets.owner_id = auth.uid()
      AND assets.is_deleted = FALSE
    )
  );

-- NOTE: For Phase 2, update to allow public assets:
-- AND (
--   assets.owner_id = auth.uid()
--   OR assets.is_public = TRUE
-- )

DROP POLICY IF EXISTS "Users can delete own project_assets" ON public.project_assets;
CREATE POLICY "Users can delete own project_assets"
  ON public.project_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_assets.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- =============================================
-- CHAT_HISTORY POLICIES
-- =============================================
DROP POLICY IF EXISTS "Users can read own chat_history" ON public.chat_history;
CREATE POLICY "Users can read own chat_history"
  ON public.chat_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = chat_history.project_id
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own chat_history" ON public.chat_history;
CREATE POLICY "Users can insert own chat_history"
  ON public.chat_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = chat_history.project_id
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own chat_history" ON public.chat_history;
CREATE POLICY "Users can delete own chat_history"
  ON public.chat_history FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = chat_history.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- =============================================
-- JOBS POLICIES
-- =============================================
DROP POLICY IF EXISTS "Users can read own jobs" ON public.jobs;
CREATE POLICY "Users can read own jobs"
  ON public.jobs FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own jobs" ON public.jobs;
CREATE POLICY "Users can insert own jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = jobs.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- NOTE: Job UPDATE/DELETE is done via service_role (background processing)
-- Users cannot directly update or delete jobs

-- =============================================
-- PUBLISH_DRAFTS POLICIES
-- =============================================
DROP POLICY IF EXISTS "Users can read own publish_drafts" ON public.publish_drafts;
CREATE POLICY "Users can read own publish_drafts"
  ON public.publish_drafts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = publish_drafts.project_id
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own publish_drafts" ON public.publish_drafts;
CREATE POLICY "Users can insert own publish_drafts"
  ON public.publish_drafts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = publish_drafts.project_id
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own publish_drafts" ON public.publish_drafts;
CREATE POLICY "Users can update own publish_drafts"
  ON public.publish_drafts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = publish_drafts.project_id
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own publish_drafts" ON public.publish_drafts;
CREATE POLICY "Users can delete own publish_drafts"
  ON public.publish_drafts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = publish_drafts.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- =============================================
-- ACTIVITY_LOG POLICIES
-- =============================================
DROP POLICY IF EXISTS "Users can read own activity" ON public.activity_log;
CREATE POLICY "Users can read own activity"
  ON public.activity_log FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own activity" ON public.activity_log;
CREATE POLICY "Users can insert own activity"
  ON public.activity_log FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- NOTE: Activity log is append-only, no UPDATE/DELETE for users
