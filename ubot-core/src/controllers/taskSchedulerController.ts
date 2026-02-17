import { Router } from 'express';
import taskSchedulerService from '../services/taskSchedulerService.js';
import { Task } from '../types/task.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(taskSchedulerService.getTasks());
});

router.post('/', (req, res) => {
  const { name, command, schedule } = req.body;
  if (!name || !command || !schedule) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newTask: Task = {
    id: crypto.randomUUID(),
    name,
    command,
    schedule,
    status: 'active',
  };

  taskSchedulerService.addTask(newTask);
  res.status(201).json(newTask);
});

router.delete('/:id', (req, res) => {
  taskSchedulerService.removeTask(req.params.id);
  res.status(204).send();
});

router.patch('/:id/toggle', (req, res) => {
  taskSchedulerService.toggleTask(req.params.id);
  const task = taskSchedulerService.getTasks().find((t) => t.id === req.params.id);
  res.json(task);
});

export { router as taskSchedulerController };