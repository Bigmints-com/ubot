"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, LayoutTemplate, Activity, CheckCircle2, XCircle, Clock } from "lucide-react";
import { api } from "@/lib/api";

type TaskStatus = "planning" | "executing" | "completed" | "failed";

interface TaskStep {
  id: string;
  description: string;
  status: TaskStatus;
  result?: string;
  error?: string;
}

interface TaskPlan {
  id: string;
  sessionId: string;
  originalRequest: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  steps: TaskStep[];
}

export default function TasksKanbanPage() {
  const [plans, setPlans] = useState<TaskPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await api<{ plans: TaskPlan[] }>("/api/tasks");
      setPlans(data.plans || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    const interval = setInterval(() => {
      loadTasks();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "planning": return <Clock className="size-4 text-blue-500" />;
      case "executing": return <Activity className="size-4 text-amber-500 animate-pulse" />;
      case "completed": return <CheckCircle2 className="size-4 text-emerald-500" />;
      case "failed": return <XCircle className="size-4 text-red-500" />;
      default: return null;
    }
  };

  const columns = [
    { id: "planning", title: "Planning", color: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400" },
    { id: "executing", title: "Executing", color: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" },
    { id: "completed", title: "Done", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
    { id: "failed", title: "Failed", color: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400" },
  ];

  return (
    <div className="flex flex-col h-full bg-background/50 overflow-hidden">
      <div className="flex-none p-6 pb-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LayoutTemplate className="size-6 text-primary" /> Task Manager
            </h1>
            <p className="text-muted-foreground text-sm">
              Kanban view of specialized agent operations
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadTasks} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <Separator />
      </div>

      <div className="flex-1 overflow-x-auto p-6 pt-2">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map(col => {
            const columnPlans = plans.filter(p => p.status === col.id);
            return (
              <div key={col.id} className="flex flex-col w-[350px] bg-muted/30 rounded-xl border border-muted/50 overflow-hidden">
                <div className={`flex items-center justify-between p-3 border-b ${col.color}`}>
                  <h3 className="font-semibold text-sm uppercase tracking-wider">{col.title}</h3>
                  <Badge variant="secondary" className="font-mono text-xs shadow-none">
                    {columnPlans.length}
                  </Badge>
                </div>
                
                <ScrollArea className="flex-1 p-3">
                  <div className="flex flex-col gap-3">
                    {columnPlans.map(plan => (
                      <Card key={plan.id} className="flex flex-col hover:border-primary/50 transition-colors shadow-sm bg-card/50 backdrop-blur-sm">
                        <CardHeader className="p-4 pb-2">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-xs font-medium text-muted-foreground break-all truncate">
                              ID: {plan.id.slice(-8)}
                            </span>
                            {getStatusIcon(plan.status)}
                          </div>
                          <CardTitle className="inline-flex gap-2 font-medium text-sm leading-snug line-clamp-3 break-words">
                            {plan.originalRequest}
                          </CardTitle>
                        </CardHeader>
                        
                        <CardContent className="p-4 pt-0">
                          {plan.steps && plan.steps.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Subtasks ({plan.steps.filter(s => s.status === 'completed').length}/{plan.steps.length})
                              </p>
                              <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-muted">
                                {plan.steps.slice(0, 3).map(step => (
                                  <div key={step.id} className="flex items-start gap-1.5 pl-2">
                                    <div className="mt-0.5 shrink-0">
                                      {getStatusIcon(step.status)}
                                    </div>
                                    <p className="text-[11px] leading-tight text-foreground/80 line-clamp-2">
                                      {step.description}
                                    </p>
                                  </div>
                                ))}
                                {plan.steps.length > 3 && (
                                  <p className="text-[10px] text-muted-foreground pl-2 italic">
                                    + {plan.steps.length - 3} more subtasks...
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>

                        <div className="mt-auto p-3 pt-0 text-[10px] text-muted-foreground flex justify-between items-center border-t border-border/40 pt-2">
                          <span>{plan.sessionId.split('@')[0]}</span>
                          <span>{new Date(plan.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </Card>
                    ))}
                    
                    {columnPlans.length === 0 && (
                      <div className="h-24 flex items-center justify-center text-muted-foreground text-sm italic border-2 border-dashed border-muted/50 rounded-lg">
                        No tasks
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
