import express from 'express';
import path from 'path';
import { agentRouter } from './controllers/agentController.js';

const app = express();
const PORT = 3100;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Frontend
app.use(express.static(path.join(process.cwd(), 'public')));

// API Routes
app.use('/api/agents', agentRouter);

// Fallback for SPA routing (optional, but good for static files)
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Ubot Core running on http://localhost:${PORT}`);
});