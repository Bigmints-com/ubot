export interface ShellCommandRequest {
  command: string;
  timeout?: number;
}

export interface ShellCommandResponse {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: string;
}