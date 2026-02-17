export type BrowserAction = 'text' | 'html' | 'screenshot';

export interface BrowserConfig {
  url: string;
  selector?: string;
  action: BrowserAction;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0';
}

export interface BrowserResult {
  success: boolean;
  data?: string;
  error?: string;
}