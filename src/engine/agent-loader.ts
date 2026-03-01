/**
 * Agent Loader
 * 
 * Discovers and parses specialized agent definitions from ~/.ubot/workspace/agents/*.agent.md
 */

import fs from 'fs';
import path from 'path';
import type { AgentDefinition } from './types.js';

export function loadAgentDefinitions(workspacePath: string): AgentDefinition[] {
  const agentsDir = path.join(workspacePath, 'agents');
  if (!fs.existsSync(agentsDir)) {
    try {
      fs.mkdirSync(agentsDir, { recursive: true });
    } catch (err) {
      console.error(`[AgentLoader] Failed to create agents directory: ${agentsDir}`);
      return [];
    }
  }

  const agents: AgentDefinition[] = [];
  try {
    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
    
    for (const file of files) {
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const id = path.basename(file, '.agent.md');
      
      const agent = parseAgentMarkdown(id, content);
      if (agent) {
        agents.push(agent);
      }
    }
  } catch (err: any) {
    console.error(`[AgentLoader] Error loading agents: ${err.message}`);
  }
  
  return agents;
}

/**
 * Basic parser for .agent.md files
 * Expects sections like # Identity, # Tools, # System Prompt
 * Sections can contain YAML-like key-value pairs
 */
function parseAgentMarkdown(id: string, content: string): AgentDefinition | null {
  const agent: AgentDefinition = {
    id,
    name: id,
    description: '',
  };

  const sections = content.split(/^#\s+/m);
  
  for (const section of sections) {
    if (!section.trim()) continue;
    
    const lines = section.split('\n');
    const title = lines[0].trim().toLowerCase();
    const body = lines.slice(1).join('\n').trim();
    
    if (title === 'identity' || title === 'name') {
      // Parse name and description
      const nameMatch = body.match(/name:\s*(.+)/i);
      if (nameMatch) agent.name = nameMatch[1].trim();
      
      const descMatch = body.match(/description:\s*(.+)/i);
      if (descMatch) agent.description = descMatch[1].trim();
    } else if (title === 'tools' || title === 'allowed tools') {
      // Parse allowed tool list
      const toolLines = body.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      agent.allowedTools = toolLines;
    } else if (title === 'system prompt' || title === 'instructions') {
      agent.systemPrompt = body;
    } else if (title === 'config' || title === 'settings') {
      const modelMatch = body.match(/model:\s*(.+)/i);
      if (modelMatch) agent.model = modelMatch[1].trim();
      
      const tempMatch = body.match(/temperature:\s*(.+)/i);
      if (tempMatch) agent.temperature = parseFloat(tempMatch[1]);
    }
  }

  return agent;
}
