import express from 'express';
import path from 'path';
import whatsappController from './controllers/whatsappController.js';
import agentController from './controllers/agentController.js';
import llmController from './controllers/llmController.js';

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/whatsapp', whatsappController);
app.use('/api/agents', agentController);
app.use('/api/llm', llmController);

app.listen(PORT, () => {
  console.log(`Ubot Core running on port ${PORT}`);
});