export interface Task {
  id: string;
  name: string;
  command: string;
  schedule: string;
  status: 'active' | 'inactive';
  lastRun?: Date;
  nextRun?: Date;
}