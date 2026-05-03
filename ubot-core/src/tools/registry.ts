/**
 * Tool Module Registry
 *
 * Auto-discovers tool modules from capability directories.
 * Each capability is a plug-and-play mini-app:
 *   1. Create a directory under capabilities/, agents/, or automation/
 *   2. Add an index.ts that exports `toolModules: ToolModule[]`
 *   3. The registry discovers and registers them automatically
 *
 * Infrastructure modules (channels, memory, engine) are registered explicitly.
 *
 * NOTE: CORE_ORCHESTRATOR_TOOLS (delegate_to_agent, execute_plan, list_agents)
 * are injected here under module:'orchestrator' so the tool selector always includes them.
 */

import fs from "fs";
import path from "path";
import type {
  ToolModule,
  ToolRegistry,
  ToolContext,
  ToolDefinition,
} from "./types.js";
import {
  loadAllCustomModules,
  getLoadedModules,
  getLoadedToolModules,
  setCoreToolNames,
} from "../capabilities/cli/custom-loader.js";
import { FEATURES, type FeatureName } from "../lib/features.js";
import { getHooks } from "../hooks/extensions.js";
import { toolAnalytics } from "../metrics/tool-analytics.js";

// Infrastructure tool modules (not auto-discovered — these are core plumbing)
import messagingTools from "../channels/tools.js";
import memoryTools from "../memory/tools.js";
import sessionsTools from "../engine/session-tools.js";
import todoToolModule from "../engine/todo-tools.js";