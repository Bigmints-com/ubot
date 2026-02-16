import express from 'express';
import { agentController } from './controllers/agentController.js';
import { llmController } from './controllers/llmController.js';
import { whatsappController } from './controllers/whatsappController.js';
import { db } from './db.js';
import { logger } from './services/logger.js';

const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/agents', agentController.router);
app.use('/api/llm', llmController.router);
app.use('/api/whatsapp', whatsappController.router);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize Database
db.initialize();

// Start Server
app.listen(PORT, () => {
  logger.info(`Ubot Core running on port ${PORT}`);
});