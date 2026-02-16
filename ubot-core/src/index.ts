import express from 'express';
import agentController from './controllers/agentController.js';
import llmController from './controllers/llmController.js';

const app = express();

app.use(express.json());

app.use('/api/agents', agentController);
app.use('/api/llm', llmController);

const PORT = process.env.PORT || 3100;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});