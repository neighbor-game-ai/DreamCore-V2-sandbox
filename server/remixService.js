/**
 * Remix Service - 公開ゲームのリミックス機能 + 系譜追跡
 *
 * 仕様:
 * - 系譜は visibility='public' のゲームのみ表示
 * - 非公開ルートはUUID/名前ともに隠す
 * - totalRemixes はRPC/CTEで効率的にカウント
 */

const { authenticate } = require('./authMiddleware');
const { supabaseAdmin } = require('./supabaseClient');
const { isValidUUID } = require('./config');
const userManager = require('./userManager');

const PUBLIC_ID_REGEX = /^g_[A-Za-z0-9]{10}$/;

function isValidGameId(gameId) {
  return isValidUUID(gameId) || PUBLIC_ID_REGEX.test(gameId);
}

/**
 * published_games から公開ゲームを取得
 */
async function getPublishedGameById(gameId) {
  const query = supabaseAdmin
    .from('published_games')
    .select('*, projects(id, user_id, name, remixed_from)')
    .eq('visibility', 'public');

  if (isValidUUID(gameId)) {
    query.eq('id', gameId);
  } else {
    query.eq('public_id', gameId);
  }

  const { data, error } = await query.single();
  if (error) return null;
  return data;
}

/**
 * 実際のルート（大本）と深さを計算
 * 非公開プロジェクトも含めて辿る
 * 非公開ルートの場合はUUID/名前を隠す
 */
async function getActualLineageInfo(projectId) {
  let currentId = projectId;
  let depth = 0;
  let rootId = projectId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, remixed_from')
      .eq('id', currentId)
      .single();

    if (!project) break;

    if (project.remixed_from) {
      depth++;
      currentId = project.remixed_from;
    } else {
      rootId = project.id;
      break;
    }
  }

  // ルートが公開されているか確認
  const { data: rootPublished } = await supabaseAdmin
    .from('published_games')
    .select('id, public_id, title, thumbnail_url, projects(id, name, user_id)')
    .eq('project_id', rootId)
    .eq('visibility', 'public')
    .single();

  if (rootPublished && rootPublished.projects) {
    // 公開ルート: 詳細情報を返す
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('display_name, avatar_url')
      .eq('id', rootPublished.projects.user_id)
      .single();

    return {
      actualRoot: {
        projectId: rootId,
        name: rootPublished.projects.name,
        isPublic: true,
        creatorName: user?.display_name,
        avatarUrl: user?.avatar_url,
        publishedGame: {
          id: rootPublished.id,
          publicId: rootPublished.public_id,
          title: rootPublished.title,
          thumbnailUrl: rootPublished.thumbnail_url
        }
      },
      actualDepth: depth
    };
  } else {
    // 非公開ルート: UUID/名前を隠す
    return {
      actualRoot: {
        projectId: null,  // UUIDを隠す
        name: '(非公開)',
        isPublic: false,
        publishedGame: null
      },
      actualDepth: depth
    };
  }
}

/**
 * 公開ゲームのみの先祖リストを取得（バッチ最適化版）
 */
async function getVisibleAncestors(projectId) {
  // 先祖チェーンを一度に取得
  const ancestorIds = [];
  let currentId = projectId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    ancestorIds.unshift(currentId);  // 先頭に追加（古い順）

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('remixed_from')
      .eq('id', currentId)
      .single();

    if (!project || !project.remixed_from) break;
    currentId = project.remixed_from;
  }

  if (ancestorIds.length === 0) return [];

  // 一括でプロジェクト情報取得
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id, name, user_id, created_at')
    .in('id', ancestorIds);

  // 一括で公開情報取得
  const { data: publishedGames } = await supabaseAdmin
    .from('published_games')
    .select('id, public_id, title, thumbnail_url, project_id')
    .in('project_id', ancestorIds)
    .eq('visibility', 'public');

  // 一括でユーザー情報取得
  const userIds = [...new Set(projects?.map(p => p.user_id) || [])];
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, display_name, avatar_url')
    .in('id', userIds);

  // マップ作成
  const projectMap = new Map((projects || []).map(p => [p.id, p]));
  const publishedMap = new Map((publishedGames || []).map(pg => [pg.project_id, pg]));
  const userMap = new Map((users || []).map(u => [u.id, u]));

  // 順序を維持して公開分のみ返す
  const ancestors = [];
  for (const id of ancestorIds) {
    const project = projectMap.get(id);
    const published = publishedMap.get(id);
    if (project && published) {
      const user = userMap.get(project.user_id);
      ancestors.push({
        projectId: project.id,
        name: project.name,
        userId: project.user_id,
        creatorName: user?.display_name,
        avatarUrl: user?.avatar_url,
        publishedGame: {
          id: published.id,
          publicId: published.public_id,
          title: published.title,
          thumbnailUrl: published.thumbnail_url
        },
        createdAt: project.created_at
      });
    }
  }

  return ancestors;
}

/**
 * 公開ゲームのみの子孫ツリーを取得（深さ制限付き）
 */
async function getVisibleDescendants(projectId, depth = 0, maxDepth = 10, visited = new Set()) {
  if (depth > maxDepth || visited.has(projectId)) return { descendants: [], depthCapped: false };
  visited.add(projectId);

  const { data: children } = await supabaseAdmin
    .from('projects')
    .select('id, name, user_id, created_at')
    .eq('remixed_from', projectId);

  if (!children || children.length === 0) return { descendants: [], depthCapped: false };

  let depthCapped = false;
  const descendants = [];

  // 一括でpublished情報取得
  const childIds = children.map(c => c.id);
  const { data: publishedGames } = await supabaseAdmin
    .from('published_games')
    .select('id, public_id, title, thumbnail_url, project_id')
    .in('project_id', childIds)
    .eq('visibility', 'public');

  const publishedMap = new Map((publishedGames || []).map(pg => [pg.project_id, pg]));

  // 一括でユーザー情報取得
  const userIds = [...new Set(children.map(c => c.user_id))];
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, display_name, avatar_url')
    .in('id', userIds);

  const userMap = new Map((users || []).map(u => [u.id, u]));

  for (const child of children) {
    const published = publishedMap.get(child.id);

    if (published) {
      const user = userMap.get(child.user_id);

      if (depth + 1 >= maxDepth) {
        depthCapped = true;
        descendants.push({
          projectId: child.id,
          name: child.name,
          userId: child.user_id,
          creatorName: user?.display_name,
          avatarUrl: user?.avatar_url,
          publishedGame: {
            id: published.id,
            publicId: published.public_id,
            title: published.title,
            thumbnailUrl: published.thumbnail_url
          },
          createdAt: child.created_at,
          children: []  // 深さ制限で打ち切り
        });
      } else {
        const childResult = await getVisibleDescendants(child.id, depth + 1, maxDepth, visited);
        if (childResult.depthCapped) depthCapped = true;

        descendants.push({
          projectId: child.id,
          name: child.name,
          userId: child.user_id,
          creatorName: user?.display_name,
          avatarUrl: user?.avatar_url,
          publishedGame: {
            id: published.id,
            publicId: published.public_id,
            title: published.title,
            thumbnailUrl: published.thumbnail_url
          },
          createdAt: child.created_at,
          children: childResult.descendants
        });
      }
    } else {
      // 非公開の場合はスキップして子孫を直接取得
      if (depth + 1 < maxDepth) {
        const grandchildResult = await getVisibleDescendants(child.id, depth + 1, maxDepth, visited);
        if (grandchildResult.depthCapped) depthCapped = true;
        descendants.push(...grandchildResult.descendants);
      } else {
        depthCapped = true;
      }
    }
  }

  return { descendants, depthCapped };
}

const FALLBACK_MAX_DEPTH = 100;

/**
 * RPC で全子孫数をカウント（効率的）
 * フォールバック: 深さ制限付きローカルカウント
 * @returns {{ count: number, exact: boolean, fallbackMaxDepth?: number }}
 */
async function countAllRemixes(projectId) {
  try {
    const { data, error } = await supabaseAdmin.rpc('count_all_remixes', {
      root_project_id: projectId
    });

    if (!error && data !== null) {
      return { count: data, exact: true };
    }
  } catch (e) {
    console.warn('[Lineage] RPC count_all_remixes failed, using fallback');
  }

  // フォールバック: 深さ制限付きローカルカウント（概算）
  const count = await countAllRemixesLocal(projectId, 0, FALLBACK_MAX_DEPTH, new Set());
  return { count, exact: false, fallbackMaxDepth: FALLBACK_MAX_DEPTH };
}

async function countAllRemixesLocal(projectId, depth, maxDepth, visited) {
  if (depth > maxDepth || visited.has(projectId)) return 0;
  visited.add(projectId);

  const { data: children } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('remixed_from', projectId);

  if (!children || children.length === 0) return 0;

  let count = children.length;
  for (const child of children) {
    count += await countAllRemixesLocal(child.id, depth + 1, maxDepth, visited);
  }
  return count;
}

function countVisibleDescendants(descendants) {
  let count = 0;
  for (const d of descendants) {
    count++;
    if (d.children) {
      count += countVisibleDescendants(d.children);
    }
  }
  return count;
}

function setupRoutes(app) {

  /**
   * POST /api/games/:gameId/remix
   * レート制限: 認証済みユーザー向けデフォルト制限を適用
   */
  app.post('/api/games/:gameId/remix', authenticate, async (req, res) => {
    try {
      const { gameId } = req.params;

      if (!isValidGameId(gameId)) {
        return res.status(400).json({ error: 'Invalid game ID format' });
      }

      const game = await getPublishedGameById(gameId);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      if (!game.allow_remix) {
        return res.status(403).json({ error: 'Remix not allowed for this game' });
      }

      const newProject = await userManager.remixProject(
        req.supabase,
        req.user.id,
        game.project_id
      );

      console.log(`[Remix] User ${req.user.id} remixed ${gameId} → ${newProject.id}`);
      res.json({ success: true, project: newProject });
    } catch (error) {
      console.error('[Remix] Error:', error.message);
      res.status(500).json({ error: 'Failed to remix game' });
    }
  });

  /**
   * GET /api/games/:gameId/lineage
   * 認証不要、CORS許可
   */
  app.get('/api/games/:gameId/lineage', async (req, res) => {
    try {
      const { gameId } = req.params;

      if (!isValidGameId(gameId)) {
        return res.status(400).json({ error: 'Invalid game ID format' });
      }

      const game = await getPublishedGameById(gameId);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const projectId = game.project_id;

      // 実際のルートと深さを計算
      const { actualRoot, actualDepth } = await getActualLineageInfo(projectId);

      // 表示用の先祖リスト
      const ancestorsWithSelf = await getVisibleAncestors(projectId);
      const current = ancestorsWithSelf.pop() || null;
      const visibleAncestors = ancestorsWithSelf;

      // 表示用の子孫ツリー
      const MAX_DEPTH = 10;
      const { descendants, depthCapped } = await getVisibleDescendants(projectId, 0, MAX_DEPTH);

      // カウント
      const visibleRemixes = countVisibleDescendants(descendants);
      const totalRemixesResult = await countAllRemixes(projectId);

      const stats = {
        actualDepth,              // 実際の世代数
        visibleDepth: visibleAncestors.length,
        visibleRemixes,           // 表示される公開Remix数
        totalRemixes: totalRemixesResult.count,
        totalRemixesExact: totalRemixesResult.exact,  // RPC成功=true
        maxDepth: MAX_DEPTH,
        depthCapped               // 深さ制限に達したか
      };

      // RPC失敗時はフォールバック深さを明示
      if (!totalRemixesResult.exact && totalRemixesResult.fallbackMaxDepth) {
        stats.totalRemixesFallbackMaxDepth = totalRemixesResult.fallbackMaxDepth;
      }

      res.json({
        actualRoot,           // 実際の大本（非公開はUUID/名前隠す）
        visibleAncestors,     // 表示される公開先祖
        current,
        descendants,
        stats
      });
    } catch (error) {
      console.error('[Lineage] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch lineage' });
    }
  });
}

module.exports = { setupRoutes };
