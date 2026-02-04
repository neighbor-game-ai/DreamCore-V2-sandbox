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

// Field definitions for explicit selection (avoid leaking sensitive fields)
const USER_PUBLIC_FIELDS = 'id, username, display_name, avatar_url, bio, social_links, public_id, created_at';
const USER_PRIVATE_FIELDS = USER_PUBLIC_FIELDS + ', email, updated_at';

/**
 * Get current user's full profile (for /api/users/me)
 * @param {Object} client - Supabase client with user JWT
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User profile or null
 */
const getCurrentUser = async (client, userId) => {
  const { data, error } = await client
    .from('users')
    .select(USER_PRIVATE_FIELDS)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getCurrentUser error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get user's public profile (for /api/users/:id/public)
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Public profile or null
 */
const getUserPublicProfile = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_FIELDS)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getUserPublicProfile error:', error.message);
    return null;
  }
  return data;
};

/**
 * Update user profile
 * @param {Object} client - Supabase client with user JWT
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update (display_name, bio, social_links, avatar_url, username)
 * @returns {Promise<Object|null>} Updated user or null
 */
const updateUserProfile = async (client, userId, updates) => {
  const allowed = ['display_name', 'bio', 'social_links', 'avatar_url', 'username'];
  const data = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      data[key] = updates[key];
    }
  }

  // Early return if no fields to update
  if (Object.keys(data).length === 0) {
    console.log('[DB] updateUserProfile: no fields to update');
    return null;
  }

  const { data: result, error } = await client
    .from('users')
    .update(data)
    .eq('id', userId)
    .select(USER_PRIVATE_FIELDS)
    .single();

  if (error) {
    console.error('[DB] updateUserProfile error:', error.message);
    return null;
  }
  return result;
};

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
 * Get user by public_id (for public profile pages)
 * @param {string} publicId - Public ID (e.g., u_abc123XYZ0)
 * @returns {Promise<Object|null>} User or null
 */
const getUserByPublicId = async (publicId) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_FIELDS)
    .eq('public_id', publicId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getUserByPublicId error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get user by username (exact match, case-insensitive via normalization)
 * Note: Username is stored lowercase in DB, so we normalize input and use eq()
 * @param {string} username - Username to search for
 * @returns {Promise<Object|null>} User profile or null
 */
const getUserByUsername = async (username) => {
  if (!username || typeof username !== 'string') return null;

  // Normalize to lowercase (DB stores lowercase)
  const normalizedUsername = username.toLowerCase();

  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_FIELDS)
    .eq('username', normalizedUsername)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[DB] getUserByUsername error:', error.message);
    return null;
  }
  return data;
};

/**
 * Check if username is available (exact match)
 * Note: Username is stored lowercase in DB, so we normalize input and use eq()
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} true if available, false if taken
 */
const checkUsernameAvailable = async (username) => {
  if (!username || typeof username !== 'string') return false;

  // Normalize to lowercase (DB stores lowercase)
  const normalizedUsername = username.toLowerCase();

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle();

  if (error) {
    console.error('[DB] checkUsernameAvailable error:', error.message);
    return false; // Treat errors as unavailable for safety
  }

  // Available if no user found
  return data === null;
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
 * Get project by public_id (for public sharing)
 * Note: Only returns if project has a published game (public or unlisted)
 * @param {string} publicId - Public ID (e.g., p_abc123XYZ0)
 * @returns {Promise<Object|null>} Project with published game info or null
 */
const getProjectByPublicId = async (publicId) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, public_id, user_id, published_games!inner(id, public_id, visibility)')
    .eq('public_id', publicId)
    .in('published_games.visibility', ['public', 'unlisted'])
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getProjectByPublicId error:', error.message);
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
 * Get asset by ID using admin client (bypasses RLS for public asset check)
 */
const getAssetByIdAdmin = async (assetId) => {
  const { data, error } = await supabaseAdmin
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getAssetByIdAdmin error:', error.message);
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
 * Get active jobs for a user (with project info)
 * Used for showing which projects are currently running when limit is exceeded
 */
const getActiveJobsForUser = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select(`
      id,
      project_id,
      status,
      created_at,
      projects!inner(name)
    `)
    .eq('user_id', userId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] getActiveJobsForUser error:', error.message);
    return [];
  }

  // Transform to include project name directly
  return (data || []).map(job => ({
    jobId: job.id,
    projectId: job.project_id,
    projectName: job.projects?.name || 'Unknown Project',
    status: job.status,
    createdAt: job.created_at
  }));
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

// ==================== Published Games Operations ====================

/**
 * Get published game by ID (public access)
 * Uses admin client to bypass RLS, returns public/unlisted games only
 * @param {string} gameId - Published game ID
 * @returns {Promise<Object|null>} Published game or null
 */
const getPublishedGameById = async (gameId) => {
  const { data, error } = await supabaseAdmin
    .from('published_games')
    .select('*, projects(id, name), users(display_name, avatar_url)')
    .eq('id', gameId)
    .in('visibility', ['public', 'unlisted'])
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getPublishedGameById error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get published game by public_id (short URL-friendly ID)
 * @param {string} publicId - Public ID (e.g., g_abc123XYZ0)
 * @returns {Promise<Object|null>} Published game or null
 */
const getPublishedGameByPublicId = async (publicId) => {
  const { data, error } = await supabaseAdmin
    .from('published_games')
    .select('*, projects(id, name), users(display_name, avatar_url)')
    .eq('public_id', publicId)
    .in('visibility', ['public', 'unlisted'])
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getPublishedGameByPublicId error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get published game by project ID (owner access)
 * @param {Object} client - Supabase client with user JWT
 * @param {string} projectId - Project ID
 * @returns {Promise<Object|null>} Published game or null
 */
const getPublishedGameByProjectId = async (client, projectId) => {
  const { data, error } = await client
    .from('published_games')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[DB] getPublishedGameByProjectId error:', error.message);
    return null;
  }
  return data;
};

/**
 * Publish a game (upsert)
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {Object} gameData - Game metadata
 * @returns {Promise<Object|null>} Published game or null
 */
const publishGame = async (projectId, userId, gameData) => {
  const { data, error } = await supabaseAdmin
    .from('published_games')
    .upsert({
      project_id: projectId,
      user_id: userId,
      title: gameData.title,
      description: gameData.description || null,
      how_to_play: gameData.howToPlay || null,
      tags: gameData.tags || [],
      thumbnail_url: gameData.thumbnailUrl || null,
      visibility: gameData.visibility || 'public',
      allow_remix: gameData.allowRemix !== false,
      updated_at: new Date().toISOString()
    }, { onConflict: 'project_id' })
    .select()
    .single();

  if (error) {
    console.error('[DB] publishGame error:', error.message);
    return null;
  }
  return data;
};

/**
 * Unpublish a game
 * @param {Object} client - Supabase client with user JWT
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success
 */
const unpublishGame = async (client, projectId) => {
  const { error } = await client
    .from('published_games')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    console.error('[DB] unpublishGame error:', error.message);
    return false;
  }
  return true;
};

/**
 * Update published game metadata
 * @param {Object} client - Supabase client with user JWT
 * @param {string} gameId - Published game ID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object|null>} Updated game or null
 */
const updatePublishedGame = async (client, gameId, updateData) => {
  const updatePayload = { updated_at: new Date().toISOString() };

  if (updateData.title !== undefined) updatePayload.title = updateData.title;
  if (updateData.description !== undefined) updatePayload.description = updateData.description;
  if (updateData.howToPlay !== undefined) updatePayload.how_to_play = updateData.howToPlay;
  if (updateData.tags !== undefined) updatePayload.tags = updateData.tags;
  if (updateData.thumbnailUrl !== undefined) updatePayload.thumbnail_url = updateData.thumbnailUrl;
  if (updateData.visibility !== undefined) updatePayload.visibility = updateData.visibility;
  if (updateData.allowRemix !== undefined) updatePayload.allow_remix = updateData.allowRemix;

  const { data, error } = await client
    .from('published_games')
    .update(updatePayload)
    .eq('id', gameId)
    .select()
    .single();

  if (error) {
    console.error('[DB] updatePublishedGame error:', error.message);
    return null;
  }
  return data;
};

/**
 * Get public games list (for discover page)
 * @param {number} limit - Maximum games to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} List of public games
 */
const getPublicGames = async (limit = 50, offset = 0) => {
  const { data, error } = await supabaseAdmin
    .from('published_games')
    .select(`
      id,
      public_id,
      title,
      description,
      tags,
      thumbnail_url,
      play_count,
      like_count,
      published_at,
      projects(id, name),
      users(display_name, avatar_url)
    `)
    .eq('visibility', 'public')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[DB] getPublicGames error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Increment play count for a game
 * @param {string} gameId - Published game ID
 * @returns {Promise<boolean>} Success
 */
const incrementPlayCount = async (gameId) => {
  const { error } = await supabaseAdmin
    .rpc('increment_play_count', { game_id: gameId });

  if (error) {
    // Fallback: manual increment if RPC doesn't exist
    const { data: game } = await supabaseAdmin
      .from('published_games')
      .select('play_count')
      .eq('id', gameId)
      .single();

    if (game) {
      await supabaseAdmin
        .from('published_games')
        .update({ play_count: (game.play_count || 0) + 1 })
        .eq('id', gameId);
    }
  }
  return true;
};

/**
 * Get games by user (owner's published games)
 * @param {Object} client - Supabase client with user JWT
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of user's published games
 */
const getPublishedGamesByUserId = async (client, userId) => {
  const { data, error } = await client
    .from('published_games')
    .select('*, projects(id, name)')
    .eq('user_id', userId)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('[DB] getPublishedGamesByUserId error:', error.message);
    return [];
  }
  return data || [];
};

/**
 * Get user's public games (for public profile page)
 * CRITICAL: Returns only visibility='public' games
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of public games
 */
const getPublishedGamesByUserIdPublic = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from('published_games')
    .select('id, public_id, project_id, title, description, thumbnail_url, published_at, play_count, like_count')
    .eq('user_id', userId)
    .eq('visibility', 'public')
    .order('published_at', { ascending: false });

  if (error) {
    console.error('[DB] getPublishedGamesByUserIdPublic error:', error.message);
    return [];
  }
  return data || [];
};

// ==================== V2 Asset Functions ====================

/**
 * Check if an alias exists for a given owner
 * NOTE: Does NOT filter by is_deleted to avoid UNIQUE constraint collision
 * when reusing deleted aliases
 * @param {string} ownerId - Owner user ID
 * @param {string} alias - Alias to check
 * @returns {Promise<boolean>} True if alias exists (including deleted)
 */
const aliasExists = async (ownerId, alias) => {
  const { data } = await supabaseAdmin
    .from('assets')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('alias', alias)
    .single();
  return !!data;
};

/**
 * Get asset by alias (service_role, bypasses RLS)
 * @param {string} ownerId - Owner user ID
 * @param {string} alias - Asset alias
 * @returns {Promise<Object|null>} Asset or null
 */
const getAssetByAliasAdmin = async (ownerId, alias) => {
  const { data } = await supabaseAdmin
    .from('assets')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('alias', alias)
    .single();
  return data;
};

/**
 * Get global asset by category and alias (service_role)
 * @param {string} category - Asset category
 * @param {string} alias - Asset alias
 * @returns {Promise<Object|null>} Asset or null
 */
const getGlobalAssetAdmin = async (category, alias) => {
  const { data } = await supabaseAdmin
    .from('assets')
    .select('*')
    .eq('is_global', true)
    .eq('category', category)
    .eq('alias', alias)
    .single();
  return data;
};

/**
 * Create asset with V2 fields (alias, hash, etc.)
 * @param {Object} assetData - Asset data
 * @returns {Promise<Object>} Created asset
 */
const createAssetV2 = async (client, assetData) => {
  const { data, error } = await client
    .from('assets')
    .insert([{
      owner_id: assetData.owner_id,
      alias: assetData.alias,
      filename: assetData.filename,
      original_name: assetData.original_name,
      storage_path: assetData.storage_path,
      mime_type: assetData.mime_type,
      size: assetData.size,
      hash: assetData.hash,
      original_asset_id: assetData.original_asset_id || null,
      created_in_project_id: assetData.created_in_project_id || null,
      is_public: assetData.is_public || false,
      is_remix_allowed: assetData.is_remix_allowed || false,
      is_global: assetData.is_global || false,
      category: assetData.category || null,
      tags: assetData.tags || null,
      description: assetData.description || null
    }])
    .select()
    .single();

  if (error) {
    console.error('[DB] createAssetV2 error:', error);
    throw error;
  }
  return data;
};

// ==================== Exports ====================

module.exports = {
  // User/Profile operations
  getOrCreateUserFromAuth,
  getOrCreateUser,
  getCurrentUser,
  getUserPublicProfile,
  updateUserProfile,
  getUserById,
  getUserByEmail,
  getUserByPublicId,
  getUserByUsername,
  checkUsernameAvailable,
  getUserByVisitorId,
  getProfileById,
  getProfileByEmail,

  // Project operations
  getProjectsByUserId,
  getProjectById,
  getProjectByPublicId,
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
  getAssetByIdAdmin,
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
  getActiveJobsForUser,
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

  // V2 Asset operations
  aliasExists,
  getAssetByAliasAdmin,
  getGlobalAssetAdmin,
  createAssetV2,

  // Published games operations
  getPublishedGameById,
  getPublishedGameByPublicId,
  getPublishedGameByProjectId,
  publishGame,
  unpublishGame,
  updatePublishedGame,
  getPublicGames,
  incrementPlayCount,
  getPublishedGamesByUserId,
  getPublishedGamesByUserIdPublic,

  // Admin client for special cases
  supabaseAdmin
};
