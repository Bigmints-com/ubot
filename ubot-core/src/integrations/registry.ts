/**
 * Integration Registry
 *
 * Manages registered external service integrations.
 * Similar to MessagingRegistry for channels, but for API-based services.
 */

import type { Integration, IntegrationType } from './types.js';

export class IntegrationRegistry {
  private integrations = new Map<IntegrationType, Integration>();

  /** Register an integration */
  register(integration: Integration): void {
    this.integrations.set(integration.type, integration);
  }

  /** Unregister an integration */
  unregister(type: IntegrationType): void {
    this.integrations.delete(type);
  }

  /** Get a specific integration by type */
  getIntegration(type: IntegrationType): Integration {
    const integration = this.integrations.get(type);
    if (!integration) {
      throw new Error(`No integration registered for type: ${type}`);
    }
    return integration;
  }

  /** Get all registered integrations */
  getAllIntegrations(): Integration[] {
    return Array.from(this.integrations.values());
  }

  /** Get all connected integrations */
  getConnectedIntegrations(): Integration[] {
    return this.getAllIntegrations().filter(i => i.status === 'connected');
  }

  /** Check if any integration is registered */
  hasIntegrations(): boolean {
    return this.integrations.size > 0;
  }

  /** Check if a specific integration is registered */
  has(type: IntegrationType): boolean {
    return this.integrations.has(type);
  }
}

export function createIntegrationRegistry(): IntegrationRegistry {
  return new IntegrationRegistry();
}
