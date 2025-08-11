// src/routes/folders.routes.ts
import { Router } from 'express';
import { supabase } from '../db.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

/** Create folder */
router.post('/', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { name, parentId } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  if (parentId) {
    const parent = await supabase.from('folders').select('owner_id').eq('id', parentId).single();
    if (!parent.data) return res.status(404).json({ error: 'Parent not found' });
    if (parent.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });
  }

  const { data, error } = await supabase
    .from('folders')
    .insert([{ name: name.trim(), parent_id: parentId ?? null, owner_id: user.id }])
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** Rename folder */
router.patch('/:id/rename', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  const folder = await supabase.from('folders').select('owner_id').eq('id', id).single();
  if (!folder.data) return res.status(404).json({ error: 'Folder not found' });
  if (folder.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const { data, error } = await supabase
    .from('folders')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** Move folder (change parent_id) */
router.patch('/:id/move', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { newParentId } = req.body; // null -> root

  const folder = await supabase.from('folders').select('owner_id').eq('id', id).single();
  if (!folder.data) return res.status(404).json({ error: 'Folder not found' });
  if (folder.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  if (newParentId) {
    const parent = await supabase.from('folders').select('owner_id').eq('id', newParentId).single();
    if (!parent.data) return res.status(404).json({ error: 'Target folder not found' });
    if (parent.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });
  }

  const { data, error } = await supabase
    .from('folders')
    .update({ parent_id: newParentId ?? null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** Soft delete folder */
router.delete('/:id', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const folder = await supabase.from('folders').select('owner_id').eq('id', id).single();
  if (!folder.data) return res.status(404).json({ error: 'Folder not found' });
  if (folder.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const { error } = await supabase
    .from('folders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Moved to Trash' });
});

/** Restore folder */
router.post('/:id/restore', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const folder = await supabase.from('folders').select('owner_id').eq('id', id).single();
  if (!folder.data) return res.status(404).json({ error: 'Folder not found' });
  if (folder.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const { error } = await supabase.from('folders').update({ deleted_at: null }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: 'Restored' });
});

/** List folder contents (non-deleted) */
router.get('/:id/children', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params; // 'root' -> parent null

  const parentId = id === 'root' ? null : id;

  const folders = await supabase
    .from('folders')
    .select('id,name,parent_id,created_at')
    .is('deleted_at', null)
    .eq('owner_id', user.id)
    .eq('parent_id', parentId);

  const files = await supabase
    .from('files')
    .select('id,name,size,type,folder_id,created_at')
    .is('deleted_at', null)
    .eq('owner_id', user.id)
    .eq('folder_id', parentId);

  if (folders.error) return res.status(500).json({ error: folders.error.message });
  if (files.error) return res.status(500).json({ error: files.error.message });

  res.json({ folders: folders.data ?? [], files: files.data ?? [] });
});

export default router;
