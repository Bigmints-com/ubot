import { executeCommand } from '../services/shellService.js';

export async function shellSkill(command: string): Promise<ReturnType<typeof executeCommand>> {
    return await executeCommand(command);
}