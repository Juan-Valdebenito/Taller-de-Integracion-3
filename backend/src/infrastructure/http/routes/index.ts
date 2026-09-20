import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import busRoutes from './bus.routes';
import routeRoutes from './route.routes';
// se debe corregir PrismaComplaintRepository para que funcione, esta con base de datos desactualizada
//import complaintRoutes from './complaint.routes';
import predictionRoutes from './prediction.routes';

const apiRouter = Router();

// ── Rutas registradas ──────────────────────────────────────
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/buses', busRoutes);
apiRouter.use('/routes', routeRoutes);
//apiRouter.use('/complaints', complaintRoutes);
apiRouter.use('/prediction', predictionRoutes);

export { apiRouter };
