# Registry: Specialized Agents (Personas)

Ubot supports a swarm of specialized agents, each defined by a Markdown configuration in the workspace.

## 1. Default Persona (Main)

- **Role**: General-purpose personal assistant.
- **Focus**: Coordination, schedule management, and basic tasks.
- **Base Soul**: `IDENTITY.md`.
- **Tools**: Global access.

## 2. Specialized Personas (Examples)

### 👨‍💻 DevAgent (`dev.agent.md`)

- **Focus**: Coding, debugging, and system operations.
- **Allowed Tools**: `files`, `shell`, `github_mcp`.
- **Signature Instructions**: "Always prioritize clean code and documentation. Use terminal for verification."

### 🔍 ResearchAgent (`research.agent.md`)

- **Focus**: Deep-dive information gathering and synthesis.
- **Allowed Tools**: `web_search`, `browser`, `memory`.
- **Signature Instructions**: "Provide citations for every claim. Cross-reference multiple sources before concluding."

### 📅 ManagerAgent (`manager.agent.md`)

- **Focus**: Calendar, scheduling, and delegation.
- **Allowed Tools**: `scheduler`, `messaging`, `google_calendar`.
- **Signature Instructions**: "Maintain a professional tone. Check for conflicts before proposing any time slots."

## 3. Persona Discovery Logic

The Ubot Orchestrator scans the `~/.ubot/workspace/agents/` directory for any file ending in `.agent.md`.

- **Structure**:
  - `# Identity`: Name and Description.
  - `# Tools`: List of allowed tool names.
  - `# System Prompt`: Core instructions for this persona.
  - `# Config`: Model selection and temperature.

This allows users to create infinite custom personas by simply dropping a Markdown file into the folder.
