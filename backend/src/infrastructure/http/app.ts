import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';
import { apiRouter } from './routes';

const app = express();

// ── Middlewares globales ───────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Health check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Rutas de la API ────────────────────────────────────────
app.use('/api/v1', apiRouter);

// ── Manejo de errores (deben ir al final) ──────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
