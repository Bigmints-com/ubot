/**
 * Apple Services Capability
 * 
 * macOS-only: Calendar, Contacts, Notes, Mail via AppleScript.
 * Drop this directory to add Apple Services support.
 */
import type { ToolModule } from '../../tools/types.js';
import appleTools from './tools.js';

export const toolModules: ToolModule[] = [appleTools];
