/**
 * Database Module for DreamCore V2 - Supabase Version
 *
 * Drop-in replacement for database.js with same function names.
 * All functions are async.
 *
 * Design:
 * - User operations: Pass userClient (RLS applies)
 * - Job/admin operations: Use supabaseAdmin internally
 *
 * Migration:
 * - require('./database') → require('./database-supabase')
 * - All calls need await
 * - User functions need userClient as first param
 */

const { supabaseAdmin, createUserClient } = require('./supabaseClient');

// ==================== Profile Operations ====================

/**
 * Get user by ID
 */
const getUserById = async (client, userId) => {
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getUserById error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get user by email
 */
const getUserByEmail = async (client, email) => {
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getUserByEmail error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get or create user from Supabase Auth
 * Note: User is auto-created by trigger, this just ensures it exists
 */
const getOrCreateUserFromAuth = async (authUser) => {
  // First try to get existing user using admin (no RLS)
  let { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (user) return user;

  // User doesn't exist (trigger may have failed), create it
  const metadata = authUser.user_metadata || {};
  const { data: newUser, error: insertError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authUser.id,
      email: authUser.email,
      display_name: metadata.full_name || metadata.name || authUser.email?.split('@')[0],
      avatar_url: metadata.avatar_url || metadata.picture || null
    })
    .select()
    .single();

  if (insertError) {
    console.error('[DB] getOrCreateUserFromAuth insert error:', insertError.message);
    // Try to get again (race condition)
    const { data: retryUser, error: retryError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();
    if (retryError) {
      console.error('[DB] getOrCreateUserFromAuth retry error:', retryError.message);
      return null;
    }
    if (!retryUser) {
      console.error('[DB] getOrCreateUserFromAuth retry returned null for user:', authUser.id);
    }
    return retryUser;
  }

  console.log('[DB] Created user:', authUser.id);
  return newUser;
};

// Aliases for compatibility
const getProfileById = getUserById;
const getProfileByEmail = getUserByEmail;

// ==================== Project Operations ====================

/**
 * Get projects by user ID
 */
const getProjectsByUserId = async (client, userId) => {
  const { data, error } = await client
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[DB] getProjectsByUserId error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Get project by ID
 */
const getProjectById = async (client, projectId) => {
  const { data, error } = await client
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getProjectById error:', error.message);
    return null;
  }
  return data;
};

/**
 * Create project
 */
const createProject = async (client, userId, name = 'New Game', remixedFrom = null) => {
  // Build insert data, only include remixed_from if provided
  const insertData = {
    user_id: userId,
    name
  };
  if (remixedFrom) {
    insertData.remixed_from = remixedFrom;
  }

  const { data, error } = await client
    .from('projects')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[DB] createProject error:', error.message);
    return null;
  }
  return data;
};

/**
 * Update project name
 */
const updateProject = async (client, projectId, name) => {
  const { data, error } = await client
    .from('projects')
    .update({ name })
    .eq('id', projectId)
    .select()
    .single();

  if (error) {
    console.error('[DB] updateProject error:', error.message);
    return null;
  }
  return data;
};

/**
 * Delete project
 */
const deleteProject = async (client, projectId) => {
  const { error } = await client
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    console.error('[DB] deleteProject error:', error.message);
    return false;
  }
  return true;
};

/**
 * Set project public status
 */
const setProjectPublic = async (client, projectId, isPublic) => {
  const { data, error } = await client
    .from('projects')
    .update({ is_public: isPublic })
    .eq('id', projectId)
    .select()
    .single();

  if (error) {
    console.error('[DB] setProjectPublic error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get public projects (Phase 2)
 * Note: Uses admin client (public data accessible to all)
 */
const getPublicProjects = async (limit = 50) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, users!projects_user_id_fkey(display_name)')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] getPublicProjects error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Get a public project by ID (for remix, view)
 * Note: Uses admin client (public data accessible to all)
 */
const getPublicProjectById = async (projectId) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('is_public', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getPublicProjectById error:', error.message);
    return null;
  }
  return data;
};

/**
 * Touch project (update updated_at)
 */
const touchProject = async (client, projectId) => {
  const { error } = await client
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) {
    console.error('[DB] touchProject error:', error.message);
    return false;
  }
  return true;
};

// ==================== Chat History Operations ====================

/**
 * Get chat history for a project
 */
const getChatHistory = async (client, projectId) => {
  const { data, error } = await client
    .from('chat_history')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] getChatHistory error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Add chat message
 */
const addChatMessage = async (client, projectId, role, message) => {
  const { data, error } = await client
    .from('chat_history')
    .insert({
      project_id: projectId,
      role,
      message
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] addChatMessage error:', error.message);
    return null;
  }
  return data;
};

/**
 * Clear chat history for a project
 */
const clearChatHistory = async (client, projectId) => {
  const { error } = await client
    .from('chat_history')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    console.error('[DB] clearChatHistory error:', error.message);
    return false;
  }
  return true;
};

// ==================== Asset Operations ====================

/**
 * Get assets by owner ID
 */
const getAssetsByOwnerId = async (client, ownerId) => {
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] getAssetsByOwnerId error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Get asset by ID
 */
const getAssetById = async (client, assetId) => {
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getAssetById error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get active asset (not deleted, within availability period)
 */
const getActiveAsset = async (client, assetId) => {
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .eq('is_deleted', false)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getActiveAsset error:', error.message);
    return null;
  }

  if (!data) return null;

  // Check availability period
  const now = new Date();
  if (data.available_from && new Date(data.available_from) > now) return null;
  if (data.available_until && new Date(data.available_until) < now) return null;

  return data;
};

/**
 * Get accessible assets (own + public)
 */
const getAccessibleAssets = async (client, userId) => {
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('is_deleted', false)
    .or(`owner_id.eq.${userId},is_public.eq.true`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] getAccessibleAssets error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Search assets
 */
const searchAssets = async (client, userId, query) => {
  // Supabase doesn't support complex OR+LIKE easily, use RPC or filter client-side
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('is_deleted', false)
    .or(`owner_id.eq.${userId},is_public.eq.true`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[DB] searchAssets error:', error.message);
    return [];
  }

  // Client-side filter for search
  const q = query.toLowerCase();
  return (data || []).filter(a =>
    (a.filename && a.filename.toLowerCase().includes(q)) ||
    (a.original_name && a.original_name.toLowerCase().includes(q)) ||
    (a.tags && a.tags.toLowerCase().includes(q)) ||
    (a.description && a.description.toLowerCase().includes(q))
  ).slice(0, 50);
};

/**
 * Get public assets
 */
const getPublicAssets = async (client, limit = 50) => {
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('is_public', true)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] getPublicAssets error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Create asset
 */
const createAsset = async (client, ownerId, filename, originalName, storagePath, mimeType = null, size = null, isPublic = false, tags = null, description = null) => {
  const { data, error } = await client
    .from('assets')
    .insert({
      owner_id: ownerId,
      filename,
      original_name: originalName,
      storage_path: storagePath,
      mime_type: mimeType,
      size,
      is_public: isPublic,
      tags,
      description
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] createAsset error:', error.message);
    return null;
  }
  return data;
};

/**
 * Soft delete asset
 * @returns {boolean|null} true if deleted, false on error, null if no rows affected
 */
const deleteAsset = async (client, assetId) => {
  const { data, error } = await client
    .from('assets')
    .update({ is_deleted: true })
    .eq('id', assetId)
    .eq('is_deleted', false)  // Only update if not already deleted
    .select('id');

  if (error) {
    console.error('[DB] deleteAsset error:', error.message);
    return false;
  }

  // Return null if no rows were affected (already deleted or doesn't exist)
  if (!data || data.length === 0) {
    return null;
  }

  return true;
};

/**
 * Hard delete asset
 */
const hardDeleteAsset = async (client, assetId) => {
  const { error } = await client
    .from('assets')
    .delete()
    .eq('id', assetId);

  if (error) {
    console.error('[DB] hardDeleteAsset error:', error.message);
    return false;
  }
  return true;
};

/**
 * Set asset public status
 */
const setAssetPublic = async (client, assetId, isPublic) => {
  const { data, error } = await client
    .from('assets')
    .update({ is_public: isPublic })
    .eq('id', assetId)
    .select()
    .single();

  if (error) {
    console.error('[DB] setAssetPublic error:', error.message);
    return null;
  }
  return data;
};

/**
 * Update asset metadata
 */
const updateAssetMeta = async (client, assetId, tags, description) => {
  const { data, error } = await client
    .from('assets')
    .update({ tags, description })
    .eq('id', assetId)
    .select()
    .single();

  if (error) {
    console.error('[DB] updateAssetMeta error:', error.message);
    return null;
  }
  return data;
};

/**
 * Set asset availability period
 */
const setAssetAvailability = async (client, assetId, availableFrom, availableUntil) => {
  const { data, error } = await client
    .from('assets')
    .update({
      available_from: availableFrom,
      available_until: availableUntil
    })
    .eq('id', assetId)
    .select()
    .single();

  if (error) {
    console.error('[DB] setAssetAvailability error:', error.message);
    return null;
  }
  return data;
};

// ==================== Project-Asset Operations ====================

/**
 * Get assets linked to a project
 */
const getProjectAssets = async (client, projectId) => {
  const { data, error } = await client
    .from('project_assets')
    .select(`
      *,
      assets (
        filename,
        original_name,
        storage_path,
        mime_type,
        is_public,
        is_deleted,
        available_from,
        available_until
      )
    `)
    .eq('project_id', projectId);

  if (error) {
    console.error('[DB] getProjectAssets error:', error.message);
    return [];
  }

  // Flatten for compatibility with SQLite format
  return (data || []).map(pa => ({
    ...pa,
    filename: pa.assets?.filename,
    original_name: pa.assets?.original_name,
    storage_path: pa.assets?.storage_path,
    mime_type: pa.assets?.mime_type,
    is_public: pa.assets?.is_public,
    is_deleted: pa.assets?.is_deleted,
    available_from: pa.assets?.available_from,
    available_until: pa.assets?.available_until
  }));
};

/**
 * Get projects using an asset
 */
const getAssetUsage = async (client, assetId) => {
  const { data, error } = await client
    .from('project_assets')
    .select(`
      *,
      projects (name)
    `)
    .eq('asset_id', assetId);

  if (error) {
    console.error('[DB] getAssetUsage error:', error.message);
    return [];
  }

  return (data || []).map(pa => ({
    ...pa,
    project_name: pa.projects?.name
  }));
};

/**
 * Count how many projects use an asset
 */
const getAssetUsageCount = async (client, assetId) => {
  const { count, error } = await client
    .from('project_assets')
    .select('*', { count: 'exact', head: true })
    .eq('asset_id', assetId);

  if (error) {
    console.error('[DB] getAssetUsageCount error:', error.message);
    return 0;
  }
  return count || 0;
};

/**
 * Link asset to project
 */
const linkAssetToProject = async (client, projectId, assetId, usageType = 'image') => {
  const { error } = await client
    .from('project_assets')
    .upsert({
      project_id: projectId,
      asset_id: assetId,
      usage_type: usageType
    }, {
      onConflict: 'project_id,asset_id'
    });

  if (error) {
    console.error('[DB] linkAssetToProject error:', error.message);
    return false;
  }
  return true;
};

/**
 * Unlink asset from project
 */
const unlinkAssetFromProject = async (client, projectId, assetId) => {
  const { error } = await client
    .from('project_assets')
    .delete()
    .eq('project_id', projectId)
    .eq('asset_id', assetId);

  if (error) {
    console.error('[DB] unlinkAssetFromProject error:', error.message);
    return false;
  }
  return true;
};

/**
 * Unlink all assets from a project
 */
const unlinkAllAssetsFromProject = async (client, projectId) => {
  const { error } = await client
    .from('project_assets')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    console.error('[DB] unlinkAllAssetsFromProject error:', error.message);
    return false;
  }
  return true;
};

/**
 * Get assets with project info for asset library
 */
const getAssetsWithProjectsByOwnerId = async (client, ownerId) => {
  // Get assets
  const { data: assets, error: assetsError } = await client
    .from('assets')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (assetsError) {
    console.error('[DB] getAssetsWithProjectsByOwnerId error:', assetsError.message);
    return [];
  }

  if (!assets || assets.length === 0) return [];

  // Get project associations
  const assetIds = assets.map(a => a.id);
  const { data: projectAssets, error: paError } = await client
    .from('project_assets')
    .select(`
      asset_id,
      projects (id, name)
    `)
    .in('asset_id', assetIds);

  if (paError) {
    console.error('[DB] getAssetsWithProjectsByOwnerId (projects) error:', paError.message);
    return assets.map(a => ({ ...a, project_ids: null, project_names: null }));
  }

  // Group by asset
  const projectMap = {};
  for (const pa of (projectAssets || [])) {
    if (!projectMap[pa.asset_id]) {
      projectMap[pa.asset_id] = { ids: [], names: [] };
    }
    if (pa.projects) {
      projectMap[pa.asset_id].ids.push(pa.projects.id);
      projectMap[pa.asset_id].names.push(pa.projects.name);
    }
  }

  return assets.map(a => ({
    ...a,
    project_ids: projectMap[a.id]?.ids.join(',') || null,
    project_names: projectMap[a.id]?.names.join(',') || null
  }));
};

// ==================== Job Operations (use supabaseAdmin) ====================

/**
 * Get job by ID
 */
const getJobById = async (jobId) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getJobById error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get jobs by user ID
 */
const getJobsByUserId = async (userId, limit = 20) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] getJobsByUserId error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Get jobs by project ID
 */
const getJobsByProjectId = async (projectId, limit = 20) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] getJobsByProjectId error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Get active job for a project
 */
const getActiveJobByProjectId = async (projectId) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[DB] getActiveJobByProjectId error:', error.message);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
};

/**
 * Get pending jobs
 */
const getPendingJobs = async (limit = 10) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[DB] getPendingJobs error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Create job
 * Note: Uses admin client (job creation is a server-side operation after auth verification)
 */
const createJob = async (userId, projectId) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .insert({
      user_id: userId,
      project_id: projectId,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] createJob error:', error.message);
    return null;
  }
  return data;
};

/**
 * Update job status
 */
const updateJobStatus = async (jobId, status) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({ status })
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    console.error('[DB] updateJobStatus error:', error.message);
    return null;
  }
  return data;
};

/**
 * Update job progress
 */
const updateJobProgress = async (jobId, progress, message = null) => {
  const updateData = { progress };
  if (message !== null) {
    updateData.progress_message = message;
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update(updateData)
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    console.error('[DB] updateJobProgress error:', error.message);
    return null;
  }
  return data;
};

/**
 * Complete job
 */
const completeJob = async (jobId, result = null) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'completed',
      progress: 100,
      result: result ? JSON.stringify(result) : null
    })
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    console.error('[DB] completeJob error:', error.message);
    return null;
  }
  return data;
};

/**
 * Fail job
 */
const failJob = async (jobId, errorMessage) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'failed',
      error: errorMessage
    })
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    console.error('[DB] failJob error:', error.message);
    return null;
  }
  return data;
};

/**
 * Cancel job
 */
const cancelJob = async (jobId) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    console.error('[DB] cancelJob error:', error.message);
    return null;
  }
  return data;
};

// ==================== Publish Draft Operations ====================

/**
 * Get publish draft
 */
const getPublishDraft = async (client, projectId) => {
  const { data, error } = await client
    .from('publish_drafts')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getPublishDraft error:', error.message);
    return null;
  }

  if (!data) return null;

  // Normalize for backwards compatibility
  return {
    ...data,
    howToPlay: data.how_to_play || '',
    tags: data.tags ? (typeof data.tags === 'string' ? JSON.parse(data.tags) : data.tags) : [],
    thumbnailUrl: data.thumbnail_url || null
  };
};

/**
 * Save publish draft
 */
const savePublishDraft = async (client, projectId, draftData) => {
  const tags = Array.isArray(draftData.tags) ? JSON.stringify(draftData.tags) : draftData.tags;

  const { error } = await client
    .from('publish_drafts')
    .upsert({
      project_id: projectId,
      title: draftData.title || '',
      description: draftData.description || '',
      how_to_play: draftData.howToPlay || '',
      tags: tags || '[]',
      visibility: draftData.visibility || 'public',
      remix: draftData.remix || 'allowed',
      thumbnail_url: draftData.thumbnailUrl || null
    }, {
      onConflict: 'project_id'
    });

  if (error) {
    console.error('[DB] savePublishDraft error:', error.message);
    return false;
  }
  return true;
};

/**
 * Delete publish draft
 */
const deletePublishDraft = async (client, projectId) => {
  const { error } = await client
    .from('publish_drafts')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    console.error('[DB] deletePublishDraft error:', error.message);
    return false;
  }
  return true;
};

// ==================== Activity Log Operations ====================

/**
 * Log activity
 * Note: Uses admin client (activity logging is a server-side operation)
 */
const logActivity = async (userId, action, targetType = null, targetId = null, details = null) => {
  const { data, error } = await supabaseAdmin
    .from('activity_log')
    .insert({
      user_id: userId,
      action,
      target_type: targetType,
      target_id: targetId,
      details
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] logActivity error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get activity by user ID
 */
const getActivityByUserId = async (client, userId, limit = 50) => {
  const { data, error } = await client
    .from('activity_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] getActivityByUserId error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Get recent activity (admin)
 */
const getRecentActivity = async (limit = 100) => {
  const { data, error } = await supabaseAdmin
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] getRecentActivity error:', error.message);
    return [];
  }
  return data || [];
};

// ==================== Legacy / Not Supported ====================

/**
 * @deprecated Use Supabase Auth instead
 */
const getOrCreateUser = async () => {
  throw new Error('getOrCreateUser is not supported - use Supabase Auth');
};

/**
 * @deprecated Use Supabase Auth instead
 */
const getUserByVisitorId = async () => {
  throw new Error('getUserByVisitorId is not supported - use Supabase Auth');
};

/**
 * @deprecated Login users handled by Supabase Auth
 */
const getLoginUserByUsername = async () => {
  throw new Error('getLoginUserByUsername is not supported - use Supabase Auth');
};

const createLoginUser = async () => {
  throw new Error('createLoginUser is not supported - use Supabase Auth');
};

const getAllLoginUsers = async () => {
  throw new Error('getAllLoginUsers is not supported - use Supabase Auth');
};

const getLoginUserById = async () => {
  throw new Error('getLoginUserById is not supported - use Supabase Auth');
};

const getLoginUserByUserId = async () => {
  throw new Error('getLoginUserByUserId is not supported - use Supabase Auth');
};

const updateLoginUserLastLogin = async () => {
  throw new Error('updateLoginUserLastLogin is not supported - use Supabase Auth');
};

/**
 * @deprecated Sessions handled by Supabase Auth
 */
const createSession = async () => {
  throw new Error('createSession is not supported - use Supabase Auth');
};

const getSessionById = async () => {
  throw new Error('getSessionById is not supported - use Supabase Auth');
};

const deleteSession = async () => {
  throw new Error('deleteSession is not supported - use Supabase Auth');
};

const deleteSessionsByLoginUserId = async () => {
  throw new Error('deleteSessionsByLoginUserId is not supported - use Supabase Auth');
};

const cleanupExpiredSessions = async () => {
  throw new Error('cleanupExpiredSessions is not supported - use Supabase Auth');
};

/**
 * @deprecated Migration not needed
 */
const migrateFromJsonFiles = async () => {
  console.warn('[DB] migrateFromJsonFiles is not supported in Supabase version');
  return { migrated: 0 };
};

// ==================== Exports ====================

module.exports = {
  // User/Profile operations
  getOrCreateUserFromAuth,
  getOrCreateUser,
  getUserById,
  getUserByEmail,
  getUserByVisitorId,
  getProfileById,
  getProfileByEmail,

  // Project operations
  getProjectsByUserId,
  getProjectById,
  getPublicProjectById,
  createProject,
  updateProject,
  deleteProject,
  setProjectPublic,
  getPublicProjects,
  touchProject,

  // Chat operations
  getChatHistory,
  addChatMessage,
  clearChatHistory,

  // Asset operations
  getAssetsByOwnerId,
  getAssetById,
  getActiveAsset,
  getAccessibleAssets,
  searchAssets,
  getPublicAssets,
  createAsset,
  deleteAsset,
  hardDeleteAsset,
  setAssetPublic,
  updateAssetMeta,
  setAssetAvailability,

  // Project-Asset operations
  getProjectAssets,
  getAssetUsage,
  getAssetUsageCount,
  linkAssetToProject,
  unlinkAssetFromProject,
  unlinkAllAssetsFromProject,
  getAssetsWithProjectsByOwnerId,

  // Job operations
  getJobById,
  getJobsByUserId,
  getJobsByProjectId,
  getActiveJobByProjectId,
  getPendingJobs,
  createJob,
  updateJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,

  // Login user operations (deprecated)
  getLoginUserByUsername,
  getLoginUserById,
  getLoginUserByUserId,
  createLoginUser,
  updateLoginUserLastLogin,
  getAllLoginUsers,

  // Session operations (deprecated)
  createSession,
  getSessionById,
  deleteSession,
  deleteSessionsByLoginUserId,
  cleanupExpiredSessions,

  // Migration (deprecated)
  migrateFromJsonFiles,

  // Activity log operations
  logActivity,
  getActivityByUserId,
  getRecentActivity,

  // Publish draft operations
  getPublishDraft,
  savePublishDraft,
  deletePublishDraft,

  // Admin client for special cases
  supabaseAdmin
};
