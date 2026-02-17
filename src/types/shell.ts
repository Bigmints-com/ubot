export interface ShellCommand {
    command: string;
    timeout?: number;
}

export interface ShellResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    timestamp: Date;
}