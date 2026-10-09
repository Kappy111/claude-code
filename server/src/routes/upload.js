import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { putMedia } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
]);

// In-memory so we can hand buffers to Supabase Storage (or write to disk).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('UNSUPPORTED_MEDIA'));
  },
});

router.post('/', requireAuth, (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: 'File too large. Maximum size is 100 MB.' });
      if (err.message === 'UNSUPPORTED_MEDIA')
        return res.status(415).json({ error: 'Unsupported media format. Use JPEG, PNG, WebP, GIF, MP4 or WebM.' });
      return res.status(400).json({ error: 'Upload failed. Please try again.' });
    }
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'No files received.' });
    try {
      const files = await Promise.all(req.files.map(async (f) => {
        const ext = path.extname(f.originalname) || (f.mimetype.startsWith('video') ? '.mp4' : '.jpg');
        const filename = `${Date.now()}-${nanoid(8)}${ext}`;
        const url = await putMedia(filename, f.buffer, f.mimetype);
        return { url, type: f.mimetype.startsWith('video') ? 'video' : 'image', size: f.size };
      }));
      res.status(201).json({ files });
    } catch (e) {
      console.error('Upload storage error:', e.message);
      res.status(500).json({ error: 'Could not store the upload. Please try again.' });
    }
  });
});

export default router;
