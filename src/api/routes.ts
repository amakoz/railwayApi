import { Router } from 'express';
import coastersRoutes from './coasters';

const router = Router();

// Mount the routes
router.use('/coasters', coastersRoutes);

export default router;
