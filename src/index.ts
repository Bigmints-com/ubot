import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './db.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// API Routes
app.get('/api/logs', (req, res) => {
    const logs = db.getAllLogs();
    res.json(logs);
});

app.post('/api/logs', (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }
    const id = db.logMessage(message);
    res.json({ id, message });
});

const PORT = 3100;
app.listen(PORT, () => {
    console.log(`Ubot Core running on port ${PORT}`);
});