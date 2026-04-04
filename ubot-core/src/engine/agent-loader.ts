/**
 * Agent Loader
 * 
 * Discovers and parses specialized agent definitions from ~/.ubot/data/workspace/agents/*.agent.yaml
 * Includes fallback logic for legacy .agent.md files
 */

import fs from 'fs';
import path from 'path';
import type { AgentDefinition } from './types.js';
import yaml from 'yaml';

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
    const files = fs.readdirSync(agentsDir);
    
    for (const file of files) {
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (file.endsWith('.agent.yaml') || file.endsWith('.agent.yml')) {
        const id = file.replace(/\.agent\.ya?ml$/, '');
        const agent = parseAgentYaml(id, content);
        if (agent) agents.push(agent);
      } else if (file.endsWith('.agent.md')) {
        const id = file.replace(/\.agent\.md$/, '');
        const agent = parseAgentMarkdown(id, content);
        if (agent) agents.push(agent);
      }
    }
  } catch (err: any) {
    console.error(`[AgentLoader] Error loading agents: ${err.message}`);
  }
  
  return agents;
}

function parseAgentYaml(id: string, content: string): AgentDefinition | null {
  try {
    const parsed = yaml.parse(content);
    return {
      id,
      name: parsed.name || id,
      description: parsed.description || '',
      systemPrompt: parsed.systemPrompt || parsed.instructions,
      allowedTools: parsed.tools || parsed.allowedTools,
      model: parsed.model,
      temperature: parsed.temperature,
      autonomyTier: parsed.autonomyTier,
      capabilities: parsed.capabilities,
      persona: parsed.persona,
      workflows: parsed.workflows,
    };
  } catch (err: any) {
    console.error(`[AgentLoader] Failed to parse YAML for agent ${id}: ${err.message}`);
    return null;
  }
}

/**
 * Basic parser for legacy .agent.md files
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
      const nameMatch = body.match(/name:\s*(.+)/i);
      if (nameMatch) agent.name = nameMatch[1].trim();
      
      const descMatch = body.match(/description:\s*(.+)/i);
      if (descMatch) agent.description = descMatch[1].trim();
    } else if (title === 'tools' || title === 'allowed tools') {
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
