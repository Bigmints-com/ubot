export interface BrowserConfig {
  headless: boolean;
  args: string[];
}

export interface BrowserAction {
  url: string;
  selector?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0';
}

export interface BrowserResponse {
  success: boolean;
  data?: any;
  error?: string;
}