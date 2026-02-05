-- Push Notifications Schema
-- Created: 2026-02-05
-- Purpose: Web Push subscriptions and in-app notifications

-- =============================================================================
-- Prerequisites
-- =============================================================================
-- Ensure pgcrypto extension is available for gen_random_uuid()
-- (Usually pre-installed in Supabase, but explicit for safety)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Push Subscriptions Table
-- =============================================================================
-- Stores browser push subscription endpoints for sending notifications
-- API operations use service_role (supabaseAdmin) for INSERT/UPDATE/DELETE

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, endpoint)
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- RLS: Users can only view their own subscriptions
-- INSERT/UPDATE/DELETE is done via service_role (supabaseAdmin)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- =============================================================================
-- Notifications Table
-- =============================================================================
-- Stores notification history for the notifications page
-- job_id + user_id UNIQUE constraint prevents duplicate notifications

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('project', 'system', 'social')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  icon TEXT DEFAULT 'default',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  job_id UUID,  -- For duplicate prevention
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,  -- When the notification was read (for analytics)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, job_id)  -- Prevent duplicate notifications for same job
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- RLS: Users can view and update their own notifications
-- INSERT is done via service_role (server-side notification creation)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE push_subscriptions IS 'Web Push subscription endpoints for browser notifications';
COMMENT ON TABLE notifications IS 'In-app notification history';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service endpoint URL';
COMMENT ON COLUMN push_subscriptions.p256dh IS 'Client public key (base64)';
COMMENT ON COLUMN push_subscriptions.auth IS 'Auth secret (base64)';
COMMENT ON COLUMN push_subscriptions.last_used_at IS 'Last successful push delivery';
COMMENT ON COLUMN notifications.job_id IS 'Job ID for duplicate prevention';
COMMENT ON COLUMN notifications.read_at IS 'Timestamp when marked as read (analytics)';
