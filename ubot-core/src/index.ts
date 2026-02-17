import express from 'express';
import { whatsappController } from './controllers/whatsappController.js';
import { emailController } from './controllers/emailController.js';
import { agentController } from './controllers/agentController.js';
import { fileController } from './controllers/fileController.js';
import { llmController } from './controllers/llmController.js';
import { memoryController } from './controllers/memoryController.js';
import { safetyController } from './controllers/safetyController.js';
import { webSearchController } from './controllers/webSearchController.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.post('/api/whatsapp/send', whatsappController.sendMessage);
app.post('/api/email/send', emailController.sendEmail);
app.post('/api/agent/create', agentController.createAgent);
app.post('/api/agent/chat', agentController.chatWithAgent);
app.post('/api/file/upload', fileController.uploadFile);
app.post('/api/llm/chat', llmController.chat);
app.post('/api/memory/add', memoryController.addMemory);
app.post('/api/memory/search', memoryController.searchMemory);
app.post('/api/safety/scan', safetyController.scanContent);
app.get('/api/web-search', webSearchController.search);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;