// src/routes/files.routes.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { authenticate } from '../middlewares/auth.middleware.js';
import { supabase } from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const BUCKET = 'files';

/**
 * POST /api/files/upload
 * Body (form-data):
 *   - file: File
 *   - folderId: string | null (optional)
 */
router.post(
  '/upload',
  authenticate,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const file = req.file;
      const { folderId } = req.body as { folderId?: string | null };

      if (!file) return res.status(400).json({ error: 'file is required' });

      // Validate target folder (if provided)
      if (folderId) {
        const f = await supabase.from('folders').select('owner_id').eq('id', folderId).single();
        if (!f.data) return res.status(404).json({ error: 'Target folder not found' });
        if (f.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });
      }

      // Storage key: user-scoped to avoid collisions
      const key = `${user.id}/${uuid()}_${encodeURIComponent(file.originalname)}`;

      // Upload to Supabase Storage
      const up = await supabase.storage
        .from(BUCKET)
        .upload(key, file.buffer, {
          cacheControl: '3600',
          contentType: file.mimetype,
          upsert: false,
        });

      if (up.error) return res.status(500).json({ error: up.error.message });

      // Save metadata to DB
      const insert = await supabase
        .from('files')
        .insert([
          {
            name: file.originalname,
            size: file.size,
            type: file.mimetype,
            storage_path: key,
            owner_id: user.id,
            folder_id: folderId ?? null,
          },
        ])
        .select('*')
        .single();

      if (insert.error) {
        // roll back storage object if DB insert failed
        await supabase.storage.from(BUCKET).remove([key]).catch(() => {});
        return res.status(500).json({ error: insert.error.message });
      }

      // Optional: return a short-lived signed URL for immediate preview
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(key, 60 * 60);
      const signedUrl = signed.data?.signedUrl ?? null;

      res.json({ message: 'File uploaded', key, signedUrl, file: insert.data });
    } catch (e: any) {
      console.error('UPLOAD_ERROR:', e);
      res.status(500).json({ error: e?.message || 'Upload failed' });
    }
  }
);

/**
 * GET /api/files
 * List current user’s files (non-trashed).
 */
router.get('/', authenticate, async (req, res) => {
  const user = (req as any).user;
  const rows = await supabase
    .from('files')
    .select('*')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (rows.error) return res.status(500).json({ error: rows.error.message });
  res.json(rows.data ?? []);
});

/**
 * GET /api/files/signed-url?key=<storage_path>
 * Returns a fresh signed URL for a file IF it belongs to the user.
 */
router.get('/signed-url', authenticate, async (req, res) => {
  const user = (req as any).user;
  const key = String(req.query.key || '');

  if (!key) return res.status(400).json({ error: 'key is required' });

  const row = await supabase
    .from('files')
    .select('owner_id')
    .eq('storage_path', key)
    .single();

  if (!row.data) return res.status(404).json({ error: 'File not found' });
  if (row.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(key, 60 * 60);
  if (signed.error) return res.status(500).json({ error: signed.error.message });

  res.json({ signedUrl: signed.data.signedUrl });
});

/** Rename file (DB only) */
router.patch('/:id/rename', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { name } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  const row = await supabase.from('files').select('owner_id').eq('id', id).single();
  if (!row.data) return res.status(404).json({ error: 'File not found' });
  if (row.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const { data, error } = await supabase
    .from('files')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** Move file (change folder_id) */
router.patch('/:id/move', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { newFolderId } = req.body; // null => move to root

  const file = await supabase.from('files').select('owner_id').eq('id', id).single();
  if (!file.data) return res.status(404).json({ error: 'File not found' });
  if (file.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  if (newFolderId) {
    const parent = await supabase.from('folders').select('owner_id').eq('id', newFolderId).single();
    if (!parent.data) return res.status(404).json({ error: 'Target folder not found' });
    if (parent.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });
  }

  const { data, error } = await supabase
    .from('files')
    .update({ folder_id: newFolderId ?? null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** Soft delete (to Trash) */
router.delete('/:id', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const file = await supabase.from('files').select('owner_id').eq('id', id).single();
  if (!file.data) return res.status(404).json({ error: 'File not found' });
  if (file.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const { error } = await supabase
    .from('files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Moved to Trash' });
});

/** Restore from Trash */
router.post('/:id/restore', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const file = await supabase.from('files').select('owner_id').eq('id', id).single();
  if (!file.data) return res.status(404).json({ error: 'File not found' });
  if (file.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  const { error } = await supabase.from('files').update({ deleted_at: null }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: 'Restored' });
});

/** List Trash (files + folders) */
router.get('/trash/list', authenticate, async (req, res) => {
  const user = (req as any).user;

  const trashedFiles = await supabase
    .from('files')
    .select('id,name,folder_id,deleted_at')
    .not('deleted_at', 'is', null)
    .eq('owner_id', user.id);

  const trashedFolders = await supabase
    .from('folders')
    .select('id,name,parent_id,deleted_at')
    .not('deleted_at', 'is', null)
    .eq('owner_id', user.id);

  if (trashedFiles.error) return res.status(500).json({ error: trashedFiles.error.message });
  if (trashedFolders.error) return res.status(500).json({ error: trashedFolders.error.message });

  res.json({ files: trashedFiles.data ?? [], folders: trashedFolders.data ?? [] });
});

/** Hard delete (Storage + DB) */
router.delete('/:id/hard', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const row = await supabase
    .from('files')
    .select('owner_id, storage_path')
    .eq('id', id)
    .single();

  if (!row.data) return res.status(404).json({ error: 'File not found' });
  if (row.data.owner_id !== user.id) return res.status(403).json({ error: 'Not allowed' });

  await supabase.storage.from(BUCKET).remove([row.data.storage_path]).catch(() => {});
  const delDb = await supabase.from('files').delete().eq('id', id);
  if (delDb.error) return res.status(500).json({ error: delDb.error.message });

  res.json({ message: 'Permanently deleted' });
});

export default router;
