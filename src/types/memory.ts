export interface MemoryEntry {
  id?: number;
  userId: string;
  key: string;
  value: string;
  type?: string;
  createdAt?: Date;
}