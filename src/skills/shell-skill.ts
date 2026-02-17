import { ShellService } from '../services/shellService.js';

export class ShellSkill {
  private shellService: ShellService;

  constructor() {
    this.shellService = new ShellService();
  }

  public async run(command: string): Promise<string> {
    const result = await this.shellService.execute(command);
    return result.stdout;
  }
}