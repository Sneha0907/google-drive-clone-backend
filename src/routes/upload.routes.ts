import { Router } from 'express';
import multer from 'multer';
import { bucket } from '../firebase.js';
import { supabase } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const userId = req.headers['x-user-id'] as string; // placeholder auth

  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const blobName = `${uuidv4()}_${file.originalname}`;
  const blob = bucket.file(blobName);

  const blobStream = blob.createWriteStream({
    metadata: {
      contentType: file.mimetype,
    },
  });

  blobStream.end(file.buffer);

  blobStream.on('error', (err) => {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  });

  blobStream.on('finish', async () => {
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

    const { error } = await supabase.from('files').insert([
      {
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        storage_path: publicUrl,
        owner_id: userId,
      },
    ]);

    if (error) return res.status(500).json({ error });

    res.json({ message: 'File uploaded', url: publicUrl });
  });
});

export default router;
