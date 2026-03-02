"use client";

import { useEffect, useState, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RefreshCw, Wrench } from "lucide-react";
import { api } from "@/lib/api";

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; description: string; required: boolean }>;
}

interface ToolHealthStatus {
  module: string;
  tool: ToolDefinition;
  status: "active" | "disconnected" | "error";
  message: string;
}

export default function ToolsHealthPage() {
  const [tools, setTools] = useState<ToolHealthStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<string>("all");

  const loadTools = async () => {
    setLoading(true);
    try {
      const data = await api<{ tools: ToolHealthStatus[] }>("/api/tools");
      setTools(data.tools || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 capitalize">Active</span>
          </div>
        );
      case "disconnected":
        return (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 capitalize">Offline</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-red-500" />
            <span className="text-[11px] font-medium text-red-600 dark:text-red-400 capitalize">Error</span>
          </div>
        );
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const modules = ["all", ...Array.from(new Set(tools.map((t) => t.module)))].sort();

  const filteredTools = selectedModule === "all" 
    ? tools 
    : tools.filter(t => t.module === selectedModule);

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wrench className="size-6" /> Tools Health
            </h1>
            <p className="text-muted-foreground">Monitor the availability and connection status of all AI tools</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadTools}>
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Separator />

        <div className="flex flex-col gap-4">
          <Tabs defaultValue="all" onValueChange={setSelectedModule}>
            <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
              {modules.map((mod) => (
                <TabsTrigger
                  key={mod}
                  value={mod}
                  className="px-4 py-1.5 text-xs font-medium capitalize"
                >
                  {mod}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Card className="border-muted/40 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-muted/30">
                    <TableHead className="w-[140px] font-semibold text-foreground/80">Capability</TableHead>
                    <TableHead className="w-[200px] font-semibold text-foreground/80">Tool Name</TableHead>
                    <TableHead className="font-semibold text-foreground/80">Description</TableHead>
                    <TableHead className="w-[100px] font-semibold text-foreground/80">Status</TableHead>
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  {filteredTools.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-12"
                      >
                        {loading ? "Discovering tools..." : "No tools found in this category"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTools.map((item) => (
                      <TableRow key={item.tool.name} className="border-muted/20">
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-bold tracking-tight bg-muted/30 border-muted-foreground/10 text-muted-foreground uppercase py-0 px-2 h-5">
                            {item.module}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono font-medium text-xs text-primary/90">
                          {item.tool.name}
                        </TableCell>
                        <TableCell className="max-w-[200px] md:max-w-md">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="truncate text-sm text-muted-foreground/90 cursor-help transition-colors hover:text-foreground">
                                {item.tool.description}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs p-3">
                              <p className="text-sm leading-relaxed">{item.tool.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(item.status)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
