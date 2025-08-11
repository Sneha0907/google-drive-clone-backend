import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { supabase } from '../db.js';

const router = Router();

/**
 * GET /api/search?q=...&scope=files|folders|all&limit=20&offset=0&sort=created_at|name&order=asc|desc
 * Only returns caller's own items (owner_id = user.id) that are not soft-deleted.
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const q = (req.query.q as string | undefined)?.trim() ?? '';
    const scope = (req.query.scope as string) || 'all';
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
    const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0);
    const sort = (req.query.sort as string) || 'created_at';
    const order = ((req.query.order as string) || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    // Build the tsquery once
    // plainto_tsquery for user-friendly typing
    // If q is empty, we just list recent
    const query = q ? `plainto_tsquery('simple', '${q.replace(/'/g, "''")}')` : null;

    const out: any = { files: [], folders: [] };

    const wantFiles = scope === 'files' || scope === 'all';
    const wantFolders = scope === 'folders' || scope === 'all';

    if (wantFiles) {
      // supabase-js doesn't expose tsquery builder, so we'll use rpc or raw SQL via http is harder.
      // Easiest with supabase-js: filter with ilike as a fallback + index still helps for equality,
      // or wrap this in a postgres function later. For now, use ilike for simplicity.
      let f = supabase
        .from('files')
        .select('id,name,folder_id,created_at,deleted_at,owner_id,size,storage_path', { count: 'exact' })
        .eq('owner_id', user.id)
        .is('deleted_at', null);

      if (q) f = f.ilike('name', `%${q}%`);

      // sorting
      if (sort === 'name') f = f.order('name', { ascending: order === 'asc' });
      else f = f.order('created_at', { ascending: order === 'asc' });

      // pagination
      const to = offset + limit - 1;
      f = f.range(offset, to);

      const files = await f;
      if (files.error) return res.status(500).json({ error: files.error.message });
      out.files = files.data ?? [];
    }

    if (wantFolders) {
      let d = supabase
        .from('folders')
        .select('id,name,parent_id,created_at,deleted_at,owner_id', { count: 'exact' })
        .eq('owner_id', user.id)
        .is('deleted_at', null);

      if (q) d = d.ilike('name', `%${q}%`);

      if (sort === 'name') d = d.order('name', { ascending: order === 'asc' });
      else d = d.order('created_at', { ascending: order === 'asc' });

      const to = offset + limit - 1;
      d = d.range(offset, to);

      const folders = await d;
      if (folders.error) return res.status(500).json({ error: folders.error.message });
      out.folders = folders.data ?? [];
    }

    res.json(out);
  } catch (e: any) {
    console.error('Search error:', e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

export default router;
