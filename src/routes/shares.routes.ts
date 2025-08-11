import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { supabase } from '../db.js';
import { Role, roleAllows } from '../utils/permissions.js';

const router = Router();

/**
 * POST /api/shares/link
 * Body: { resourceType: 'file'|'folder', resourceId: string, role: 'viewer'|'editor', expiresInDays?: number }
 * Creates (or rotates) a share link for a resource.
 */
router.post('/link', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { resourceType, resourceId, role, expiresInDays } = req.body as {
      resourceType: 'file' | 'folder',
      resourceId: string,
      role: Role,
      expiresInDays?: number
    };

    if (!resourceType || !resourceId || !role) {
      return res.status(400).json({ error: 'resourceType, resourceId, role required' });
    }

    // Only owner can create share links
    const ownerCheck = await supabase
      .from(resourceType === 'file' ? 'files' : 'folders')
      .select('owner_id')
      .eq('id', resourceId)
      .single();

    if (!ownerCheck.data) return res.status(404).json({ error: 'Resource not found' });
    if (ownerCheck.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

    let expires_at: string | null = null;
    if (expiresInDays && expiresInDays > 0) {
      const d = new Date(); d.setDate(d.getDate() + expiresInDays);
      expires_at = d.toISOString();
    }

    // Upsert one link per resource
    const upsert = await supabase
      .from('shares')
      .upsert({
        resource_type: resourceType,
        resource_id: resourceId,
        owner_id: user.id,
        role,
        expires_at,
      }, {
        onConflict: 'resource_type,resource_id'
      })
      .select('*')
      .single();

    if (upsert.error) return res.status(500).json({ error: upsert.error.message });

    const link = `${process.env.PUBLIC_APP_ORIGIN ?? 'http://localhost:3000'}/share/${resourceType}/${resourceId}?t=${upsert.data.link_token}`;
    res.json({ link, role: upsert.data.role, expires_at: upsert.data.expires_at });
  } catch (e: any) {
    console.error('Create link error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Internal error' });
  }
});

/**
 * DELETE /api/shares/link
 * Body: { resourceType, resourceId }
 * Revokes link for the resource.
 */
router.delete('/link', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { resourceType, resourceId } = req.body;

  const ownerCheck = await supabase
    .from(resourceType === 'file' ? 'files' : 'folders')
    .select('owner_id')
    .eq('id', resourceId)
    .single();

  if (!ownerCheck.data) return res.status(404).json({ error: 'Resource not found' });
  if (ownerCheck.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  await supabase.from('shares').delete()
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId);

  res.json({ message: 'Link revoked' });
});

/**
 * POST /api/shares/grant
 * Body: { resourceType, resourceId, email, role: 'viewer'|'editor' }
 * Grants email-based permission.
 */
router.post('/grant', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { resourceType, resourceId, email, role } = req.body as {
      resourceType: 'file' | 'folder',
      resourceId: string,
      email: string,
      role: Exclude<Role,'owner'>,
    };

    if (!resourceType || !resourceId || !email || !role) {
      return res.status(400).json({ error: 'resourceType, resourceId, email, role required' });
    }

    // Only owner can grant
    const ownerCheck = await supabase
      .from(resourceType === 'file' ? 'files' : 'folders')
      .select('owner_id')
      .eq('id', resourceId)
      .single();

    if (!ownerCheck.data) return res.status(404).json({ error: 'Resource not found' });
    if (ownerCheck.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

    const up = await supabase
      .from('permissions')
      .upsert({
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_email: email.toLowerCase(),
        role,
      }, { onConflict: 'resource_type,resource_id,grantee_email' })
      .select('*')
      .single();

    if (up.error) return res.status(500).json({ error: up.error.message });
    res.json(up.data);
  } catch (e: any) {
    console.error('Grant error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Internal error' });
  }
});

/**
 * DELETE /api/shares/grant
 * Body: { resourceType, resourceId, email }
 */
router.delete('/grant', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { resourceType, resourceId, email } = req.body;

  const ownerCheck = await supabase
    .from(resourceType === 'file' ? 'files' : 'folders')
    .select('owner_id')
    .eq('id', resourceId)
    .single();

  if (!ownerCheck.data) return res.status(404).json({ error: 'Resource not found' });
  if (ownerCheck.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  await supabase.from('permissions').delete()
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .eq('grantee_email', (email as string).toLowerCase());

  res.json({ message: 'Access revoked' });
});

/**
 * GET /api/shares/:resourceType/:resourceId
 * Returns current link (if any) + email grants.
 */
router.get('/:resourceType/:resourceId', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { resourceType, resourceId } = req.params as { resourceType: 'file'|'folder', resourceId: string };

  const ownerCheck = await supabase
    .from(resourceType === 'file' ? 'files' : 'folders')
    .select('owner_id')
    .eq('id', resourceId)
    .single();

  if (!ownerCheck.data) return res.status(404).json({ error: 'Resource not found' });
  if (ownerCheck.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const share = await supabase
    .from('shares')
    .select('*')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .maybeSingle();

  const grants = await supabase
    .from('permissions')
    .select('*')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId);

  const link = share.data
    ? `${process.env.PUBLIC_APP_ORIGIN ?? 'http://localhost:3000'}/share/${resourceType}/${resourceId}?t=${share.data.link_token}`
    : null;

  res.json({ link, share: share.data, grants: grants.data ?? [] });
});

export default router;
