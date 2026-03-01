/**
 * iMessage Channel Types (via BlueBubbles)
 *
 * BlueBubbles is a macOS app that exposes iMessage via a REST API.
 * It handles macOS permissions (Full Disk Access, etc.) itself.
 * See: https://bluebubbles.app
 */

export interface BlueBubblesConfig {
  /** BlueBubbles server URL (e.g. "http://localhost:1234") */
  serverUrl: string;
  /** Server password for API auth */
  password: string;
  /** Webhook path for incoming messages (default: /api/imessage/webhook) */
  webhookPath?: string;
  /** Auto-reply to incoming iMessages */
  autoReply?: boolean;
  /** DM policy: 'open' allows all, 'allowlist' restricts */
  dmPolicy?: 'open' | 'allowlist';
  /** Allowed phone numbers / emails for allowlist mode */
  allowFrom?: string[];
}

export const DEFAULT_BLUEBUBBLES_CONFIG: BlueBubblesConfig = {
  serverUrl: '',
  password: '',
  webhookPath: '/api/imessage/webhook',
  autoReply: false,
  dmPolicy: 'open',
  allowFrom: [],
};

/** BlueBubbles API message format */
export interface BBMessage {
  guid: string;
  text: string;
  dateCreated: number;
  dateDelivered?: number;
  dateRead?: number;
  isFromMe: boolean;
  handle?: {
    address: string;
    firstName?: string;
    lastName?: string;
  };
  chats?: Array<{
    guid: string;
    chatIdentifier: string;
    displayName?: string;
    participants?: Array<{
      address: string;
      firstName?: string;
      lastName?: string;
    }>;
  }>;
  attachments?: Array<{
    guid: string;
    mimeType: string;
    transferName: string;
    totalBytes: number;
  }>;
  associatedMessageGuid?: string;
  associatedMessageType?: number;
}

/** BlueBubbles API chat format */
export interface BBChat {
  guid: string;
  chatIdentifier: string;
  displayName?: string;
  participants: Array<{
    address: string;
    firstName?: string;
    lastName?: string;
  }>;
  lastMessage?: BBMessage;
}

/** BlueBubbles API handle format */
export interface BBHandle {
  address: string;
  firstName?: string;
  lastName?: string;
  originalROWID: number;
}
