import { Router } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../../uploads');

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const bodySchema = z.object({
  /** data URL (data:image/jpeg;base64,...) o base64 puro */
  image: z.string().min(32).max(3_500_000),
  filename: z.string().max(120).optional(),
});

uploadsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);
    const match = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i.exec(body.image);
    let ext = 'jpg';
    let raw = body.image;
    if (match) {
      const mime = match[2].toLowerCase();
      ext = mime === 'png' ? 'png' : mime === 'webp' ? 'webp' : 'jpg';
      raw = match[3];
    } else if (!/^[A-Za-z0-9+/=\s]+$/.test(body.image.slice(0, 80))) {
      throw new HttpError(400, 'Imagen inválida (usa JPEG, PNG o WebP)');
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw.replace(/\s/g, ''), 'base64');
    } catch {
      throw new HttpError(400, 'No se pudo leer la imagen');
    }
    if (buffer.length < 64) throw new HttpError(400, 'Imagen demasiado pequeña');
    if (buffer.length > 2_500_000) throw new HttpError(400, 'Imagen demasiado grande (máx. ~2 MB)');

    await mkdir(uploadsDir, { recursive: true });
    const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await writeFile(path.join(uploadsDir, name), buffer);

    const url = `/uploads/${name}`;
    res.status(201).json({ url });
  }),
);
