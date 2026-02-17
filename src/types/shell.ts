export interface ShellResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: Date;
}