/**
 * Filesystem Capability
 * 
 * File operations, media handling, and file patching.
 */
import type { ToolModule } from '../../tools/types.js';
import filesTools from './tools.js';
import mediaTools from './media-tools.js';
import patchTools from './patch-tools.js';

export const toolModules: ToolModule[] = [filesTools, mediaTools, patchTools];
