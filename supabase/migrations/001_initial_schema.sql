-- DreamCore V2 Initial Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- Users table (extends Supabase Auth)
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "users_read_own"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- Projects table (制作中のゲーム)
-- ============================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'New Game',
  game_type TEXT DEFAULT '2d' CHECK (game_type IN ('2d', '3d')),
  storage_path TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Users can read their own projects
CREATE POLICY "projects_read_own"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own projects
CREATE POLICY "projects_insert_own"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own projects
CREATE POLICY "projects_update_own"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own projects
CREATE POLICY "projects_delete_own"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON public.projects(updated_at DESC);

-- ============================================
-- Games table (公開ゲーム - Phase 2)
-- ============================================
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  game_url TEXT NOT NULL,
  thumbnail_url TEXT,
  play_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Public games can be read by anyone
CREATE POLICY "games_read_public"
  ON public.games FOR SELECT
  USING (visibility = 'public' OR auth.uid() = user_id);

-- Users can insert their own games
CREATE POLICY "games_insert_own"
  ON public.games FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own games
CREATE POLICY "games_update_own"
  ON public.games FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own games
CREATE POLICY "games_delete_own"
  ON public.games FOR DELETE
  USING (auth.uid() = user_id);

-- Index for public game listings
CREATE INDEX IF NOT EXISTS idx_games_visibility ON public.games(visibility);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON public.games(created_at DESC);

-- ============================================
-- Assets table (画像・音声等)
-- ============================================
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  is_public BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  tags TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Users can read their own assets or public assets
CREATE POLICY "assets_read_own_or_public"
  ON public.assets FOR SELECT
  USING (auth.uid() = owner_id OR is_public = TRUE);

-- Users can insert their own assets
CREATE POLICY "assets_insert_own"
  ON public.assets FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Users can update their own assets
CREATE POLICY "assets_update_own"
  ON public.assets FOR UPDATE
  USING (auth.uid() = owner_id);

-- Users can delete their own assets
CREATE POLICY "assets_delete_own"
  ON public.assets FOR DELETE
  USING (auth.uid() = owner_id);

-- Index for asset queries
CREATE INDEX IF NOT EXISTS idx_assets_owner_id ON public.assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_assets_is_public ON public.assets(is_public) WHERE is_public = TRUE;

-- ============================================
-- Project-Asset relationship table
-- ============================================
CREATE TABLE IF NOT EXISTS public.project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  usage_type TEXT DEFAULT 'image' CHECK (usage_type IN ('image', 'audio', 'other')),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, asset_id)
);

-- Enable RLS
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;

-- Users can manage project assets for their own projects
CREATE POLICY "project_assets_manage_own"
  ON public.project_assets FOR ALL
  USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Index for relationship queries
CREATE INDEX IF NOT EXISTS idx_project_assets_project_id ON public.project_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_asset_id ON public.project_assets(asset_id);

-- ============================================
-- Function: Auto-create user profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Create user profile when new auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Function: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at for projects
DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger: Auto-update updated_at for assets
DROP TRIGGER IF EXISTS assets_updated_at ON public.assets;
CREATE TRIGGER assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
