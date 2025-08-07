import { Router } from 'express';
import { AgentNetworkController } from '../controllers/AgentNetworkController';

const router = Router();
const controller = new AgentNetworkController();

/**
 * Rutas para manejo de redes de agentes
 * Simplifica la activación simultánea de múltiples agentes
 */

// Activar toda la red de agentes configurada
router.post('/:userId/activate', (req, res) => controller.activateNetwork(req, res));

// Obtener estado de la red de agentes
router.get('/:userId/status', (req, res) => controller.getNetworkStatus(req, res));

// Desactivar la red de agentes
router.post('/:userId/deactivate', (req, res) => controller.deactivateNetwork(req, res));

export default router;