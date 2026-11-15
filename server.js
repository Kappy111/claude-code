// Entry point. Vercel's Express preset detects this file by its express import.
import express from 'express';
import app from './server/app.js';

if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`Messenger listening on http://localhost:${PORT}`));
}

export { express };
export default app;
