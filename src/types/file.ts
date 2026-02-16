export interface File {
  id: string;
  name: string;
  size: number;
  type: string;
  path: string;
  owner: string;
  createdAt: Date;
}

export interface FileUploadRequest {
  owner: string;
  filename: string;
  mimetype: string;
  buffer: Buffer;
}