"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, RefreshCw, Play, Pause } from "lucide-react";
import { api } from "@/lib/api";

interface TaskSchedule {
  recurrence: string;
  cronExpression?: string;
  intervalMs?: number;
  startDate?: string;
  endDate?: string;
}

interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  schedule: TaskSchedule;
  status: string;
  enabled: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  failureCount: number;
}

function formatSchedule(schedule: TaskSchedule): string {
  if (schedule.recurrence === 'cron' && schedule.cronExpression) {
    return schedule.cronExpression;
  }
  if (schedule.recurrence === 'once' && schedule.startDate) {
    return `Once at ${new Date(schedule.startDate).toLocaleString()}`;
  }
  if (schedule.recurrence === 'interval' && schedule.intervalMs) {
    const secs = schedule.intervalMs / 1000;
    if (secs < 60) return `Every ${secs}s`;
    if (secs < 3600) return `Every ${Math.round(secs / 60)}m`;
    return `Every ${Math.round(secs / 3600)}h`;
  }
  return schedule.recurrence;
}

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await api<{ tasks: ScheduledTask[] }>("/api/scheduler/tasks");
      setTasks(data.tasks || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  return (
    <div className="p-6 pb-12 space-y-6 flex-1">
      <div className="flex items-center justify-between border-b pb-6 mb-6">
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Scheduler</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage scheduled tasks and cron jobs
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadTasks}>
          <RefreshCw className="size-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-500">
              {tasks.filter((t) => t.enabled && t.status !== 'completed' && t.status !== 'failed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {tasks.filter((t) => t.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {tasks.length === 0 && !loading ? (
        <EmptyState
          icon={<Clock className="size-8" />}
          title="No scheduled tasks"
          description="You do not have any tasks or cron jobs configured yet."
        />
      ) : (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Last Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="font-medium">{task.name}</div>
                      {task.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{task.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {formatSchedule(task.schedule)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {task.tags?.length ? task.tags.join(', ') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          task.status === 'completed' ? 'default' :
                          task.status === 'failed' ? 'destructive' :
                          task.status === 'running' ? 'default' :
                          task.enabled ? 'default' : 'secondary'
                        }
                        className={task.status === 'completed' ? 'bg-green-600' : undefined}
                      >
                        {task.status === 'completed' ? '✓ Completed' :
                         task.status === 'failed' ? '✗ Failed' :
                         task.status === 'running' ? (
                          <><Play className="size-3 mr-1" /> Running</>
                         ) :
                         task.enabled ? (
                          <><Clock className="size-3 mr-1" /> {task.status || 'Pending'}</>
                         ) : (
                          <><Pause className="size-3 mr-1" /> Paused</>
                         )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.nextRunAt
                        ? new Date(task.nextRunAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.lastRunAt
                        ? new Date(task.lastRunAt).toLocaleString()
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
