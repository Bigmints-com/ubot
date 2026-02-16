import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { llmRouter } from './controllers/llmController.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

app.use('/api/llm', llmRouter);

app.listen(3100, () => {
  console.log('Ubot Core running on port 3100');
});