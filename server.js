// Entry point. Vercel imports the Express app; locally we listen on a port.
import app from './server/app.js';
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`Messenger listening on http://localhost:${PORT}`));
}
export default app;
