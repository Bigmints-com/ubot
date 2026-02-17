export interface Email {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  internalDate: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface ListEmailsRequest {
  maxResults?: number;
  labelIds?: string[];
}

export interface GetEmailRequest {
  id: string;
}