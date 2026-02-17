import express from 'express';
import { taskSchedulerController } from './controllers/taskSchedulerController.js';

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());

// Register Task Scheduler Routes
app.use('/api/tasks', taskSchedulerController);

// Start Server
app.listen(PORT, () => {
  console.log(`Ubot Core is running on port ${PORT}`);
});