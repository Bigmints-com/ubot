/**
 * Integration Types
 *
 * An Integration is a connection to an external third-party service
 * that ubot can read from and write to via API.
 *
 * Unlike Channels (bidirectional chat pipes), Integrations are
 * API-based service connections that provide domain-specific data
 * and actions (e.g., Google Workspace, SaveADay, Stripe).
 */

export type IntegrationType = 'google';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

/**
 * Standard interface for all external service integrations.
 *
 * Each integration provides:
 *   - name: human-readable identifier
 *   - type: IntegrationType enum value
 *   - status: current connection state
 *   - connect/disconnect: lifecycle management
 *   - healthCheck: verify the integration is functional
 */
export interface Integration {
  /** Human-readable name (e.g., 'Google Workspace', 'SaveADay') */
  readonly name: string;

  /** Integration type identifier */
  readonly type: IntegrationType;

  /** Current connection status */
  readonly status: IntegrationStatus;

  /** Connect to the external service */
  connect(): Promise<void>;

  /** Disconnect from the external service */
  disconnect(): Promise<void>;

  /** Verify the integration is functional */
  healthCheck(): Promise<boolean>;
}
