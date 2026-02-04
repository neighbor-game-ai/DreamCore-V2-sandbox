/**
 * Project ownership check middleware
 * Validates projectId and checks ownership
 */

const { isValidUUID } = require('../config');
const db = require('../database-supabase');

/**
 * Middleware to check project ownership
 * - Validates projectId as UUID
 * - Fetches project from DB
 * - Checks if req.user.id === project.user_id
 * - Attaches project to req.project on success
 */
const checkProjectOwnership = async (req, res, next) => {
  const { projectId } = req.params;
  if (!isValidUUID(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  const project = await db.getProjectById(req.supabase, projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (project.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  req.project = project;
  next();
};

module.exports = { checkProjectOwnership };
