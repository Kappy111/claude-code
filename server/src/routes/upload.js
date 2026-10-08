import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { UPLOAD_DIR } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('UNSUPPORTED_MEDIA'));
  },
});

// Accept up to 10 files (for carousels)
router.post('/', requireAuth, (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: 'File too large. Maximum size is 100 MB.' });
      if (err.message === 'UNSUPPORTED_MEDIA')
        return res.status(415).json({ error: 'Unsupported media format. Use JPEG, PNG, WebP, GIF, MP4 or WebM.' });
      return res.status(400).json({ error: 'Upload failed. Please try again.' });
    }
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'No files received.' });
    const urls = req.files.map((f) => ({
      url: `/media/${f.filename}`,
      type: f.mimetype.startsWith('video') ? 'video' : 'image',
      size: f.size,
    }));
    res.status(201).json({ files: urls });
  });
});

export default router;
