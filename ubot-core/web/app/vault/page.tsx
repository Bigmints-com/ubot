"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Eye,
  EyeOff,
  KeyRound,
  FileText,
  ShieldCheck,
  Copy,
  Check,
  Upload,
  File,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

interface VaultItem {
  id: string;
  label: string;
  category: string;
  type: "text" | "document";
  value?: string;
  filename?: string;
  mimeType?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface VaultStats {
  total: number;
  categories: Record<string, number>;
  textItems: number;
  documentItems: number;
}

const CATEGORIES = [
  "general",
  "credentials",
  "identity",
  "finance",
  "documents",
  "keys",
  "notes",
];

const CATEGORY_ICONS: Record<string, typeof KeyRound> = {
  credentials: KeyRound,
  identity: ShieldCheck,
  documents: FileText,
  finance: ShieldCheck,
  keys: KeyRound,
  notes: FileText,
  general: Lock,
};

const CATEGORY_COLORS: Record<string, string> = {
  credentials: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  identity: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  documents: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  finance: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  keys: "bg-red-500/10 text-red-400 border-red-500/20",
  notes: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  general: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export default function VaultPage() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addCategory, setAddCategory] = useState("general");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // View dialog
  const [viewItem, setViewItem] = useState<VaultItem | null>(null);
  const [showValue, setShowValue] = useState(false);
  const [copied, setCopied] = useState(false);

  // File upload dialog
  const [showUpload, setShowUpload] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadCategory, setUploadCategory] = useState("documents");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory && filterCategory !== "all")
        params.set("category", filterCategory);
      if (searchQuery) params.set("search", searchQuery);

      const data = await api<{ items: VaultItem[]; stats: VaultStats }>(
        `/api/vault?${params.toString()}`
      );
      setItems(data.items || []);
      setStats(data.stats || null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterCategory, searchQuery]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const addItem = async () => {
    if (!addLabel.trim() || !addValue.trim()) return;
    setSaving(true);
    try {
      await api("/api/vault", {
        method: "POST",
        body: {
          label: addLabel.trim(),
          value: addValue,
          category: addCategory,
          notes: addNotes || undefined,
        },
      });
      setShowAdd(false);
      setAddLabel("");
      setAddValue("");
      setAddCategory("general");
      setAddNotes("");
      loadItems();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (labelOrId: string) => {
    if (!confirm("Permanently delete this vault item?")) return;
    try {
      await api(`/api/vault/${encodeURIComponent(labelOrId)}`, {
        method: "DELETE",
      });
      loadItems();
    } catch {
      /* ignore */
    }
  };

  const openItem = async (item: VaultItem) => {
    try {
      const data = await api<{ item: VaultItem }>(
        `/api/vault/${encodeURIComponent(item.label)}`
      );
      setViewItem(data.item);
      setShowValue(false);
      setCopied(false);
    } catch {
      /* ignore */
    }
  };

  const copyValue = async () => {
    if (!viewItem?.value) return;
    await navigator.clipboard.writeText(viewItem.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadFile(file);
      if (!uploadLabel) setUploadLabel(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      if (!uploadLabel) setUploadLabel(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    }
  };

  const uploadDocument = async () => {
    if (!uploadFile || !uploadLabel.trim()) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:...;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      await api("/api/vault/document", {
        method: "POST",
        body: {
          label: uploadLabel.trim(),
          filename: uploadFile.name,
          file_data: base64,
          category: uploadCategory,
          notes: uploadNotes || undefined,
        },
      });
      setShowUpload(false);
      setUploadFile(null);
      setUploadLabel("");
      setUploadCategory("documents");
      setUploadNotes("");
      loadItems();
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Lock className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vault</h1>
            <p className="text-muted-foreground text-sm">
              Encrypted secure storage — owner only
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadItems}>
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="size-4 mr-2" />
            Upload File
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="size-4 mr-2" />
            Add Secret
          </Button>
        </div>
      </div>

      <Separator />

      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Items</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.textItems}</div>
              <div className="text-xs text-muted-foreground">Secrets</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.documentItems}</div>
              <div className="text-xs text-muted-foreground">Documents</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">
                {Object.keys(stats.categories).length}
              </div>
              <div className="text-xs text-muted-foreground">Categories</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search vault..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          value={filterCategory}
          onValueChange={setFilterCategory}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    {loading ? (
                      "Decrypting vault..."
                    ) : (
                      <div className="space-y-2">
                        <Lock className="size-8 mx-auto text-muted-foreground/50" />
                        <p>Vault is empty</p>
                        <p className="text-xs">
                          Click &quot;Add Secret&quot; or tell the agent to store
                          something securely
                        </p>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const Icon =
                    CATEGORY_ICONS[item.category] || Lock;
                  const colorClass =
                    CATEGORY_COLORS[item.category] ||
                    CATEGORY_COLORS.general;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="font-medium">{item.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${colorClass}`}
                        >
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {item.type === "document" ? "📄 Doc" : "🔑 Text"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {item.metadata?.notes || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(item.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openItem(item)}
                            title="View"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => deleteItem(item.label)}
                            title="Delete"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Secret Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4" />
              Add to Vault
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder="e.g. aws_access_key, wifi_password"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Value (encrypted)</Label>
              <Textarea
                placeholder="The sensitive value to store..."
                rows={3}
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={addCategory} onValueChange={setAddCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Context or description..."
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={addItem}
              disabled={saving || !addLabel.trim() || !addValue.trim()}
            >
              {saving ? "Encrypting..." : "Store Securely"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Item Dialog */}
      <Dialog
        open={!!viewItem}
        onOpenChange={(o) => {
          if (!o) {
            setViewItem(null);
            setShowValue(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4" />
              {viewItem?.label}
            </DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge
                  variant="outline"
                  className={
                    CATEGORY_COLORS[viewItem.category] ||
                    CATEGORY_COLORS.general
                  }
                >
                  {viewItem.category}
                </Badge>
                <Badge variant="secondary">
                  {viewItem.type === "document" ? "📄 Document" : "🔑 Secret"}
                </Badge>
              </div>

              {viewItem.type === "text" && viewItem.value && (
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    <span>Value</span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowValue(!showValue)}
                      >
                        {showValue ? (
                          <EyeOff className="size-3 mr-1" />
                        ) : (
                          <Eye className="size-3 mr-1" />
                        )}
                        {showValue ? "Hide" : "Reveal"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={copyValue}
                      >
                        {copied ? (
                          <Check className="size-3 mr-1" />
                        ) : (
                          <Copy className="size-3 mr-1" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </Label>
                  <div className="bg-muted rounded-md p-3 font-mono text-sm break-all">
                    {showValue ? viewItem.value : "•".repeat(Math.min(viewItem.value.length, 32))}
                  </div>
                </div>
              )}

              {viewItem.type === "document" && (
                <div className="space-y-2">
                  <Label>Document</Label>
                  <div className="bg-muted rounded-md p-3 text-sm">
                    <p>
                      <strong>File:</strong> {viewItem.filename}
                    </p>
                    <p>
                      <strong>Type:</strong> {viewItem.mimeType}
                    </p>
                  </div>
                </div>
              )}

              {viewItem.metadata?.notes && (
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <p className="text-sm text-muted-foreground">
                    {viewItem.metadata.notes}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Created: {formatDate(viewItem.createdAt)}</p>
                <p>Updated: {formatDate(viewItem.updatedAt)}</p>
                <p className="font-mono text-[10px]">ID: {viewItem.id}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setViewItem(null);
                setShowValue(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload File Dialog */}
      <Dialog open={showUpload} onOpenChange={(o) => { if (!o) { setShowUpload(false); setUploadFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-4" />
              Upload to Vault
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => document.getElementById("vault-file-input")?.click()}
            >
              {uploadFile ? (
                <div className="flex items-center justify-center gap-3">
                  <File className="size-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium text-sm">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(uploadFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="size-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop a file or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    PDFs, images, documents — all encrypted
                  </p>
                </div>
              )}
              <input
                id="vault-file-input"
                type="file"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder="e.g. health_insurance, passport_scan"
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Context or description..."
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUpload(false); setUploadFile(null); }}>
              Cancel
            </Button>
            <Button
              onClick={uploadDocument}
              disabled={uploading || !uploadFile || !uploadLabel.trim()}
            >
              {uploading ? "Encrypting..." : "Encrypt & Store"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
