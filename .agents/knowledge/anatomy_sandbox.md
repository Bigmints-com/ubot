# Anatomy Part 2: The Sandbox (Security Layer)

The "Where" of Ubot. The Sandbox ensures that the agent's actions are confined to a safe, controlled environment.

## Core Components

- **`SafetyService`**: The gatekeeper for all safety-related logic.
- **`WorkspaceGuard`**: A specialized component within the safety service that handles path validation.
- **`Filesystem Tools`**: A set of tool executors (`read_file`, `write_file`, etc.) that are natively "sandbox-aware."

## Mechanics

1. **Recursive Path Validation**: Every target path provided by the LLM is resolved to an absolute path and checked against the workspace root (`~/.ubot/workspace`) and any configured `filesystem.allowed_paths` (e.g. `~/Documents`, `~/Downloads`).
2. **Escape Prevention**: Using `path.resolve` and `startsWith`, the system prevents ".." traversal attacks that might attempt to access files like `~/.ssh/id_rsa`.
3. **Tool Isolation**: Only tools explicitly registered in the registry and validated by the guard can interact with the host system.

## Policy Enforcement

The sandbox also enforces a **Visitor Security Policy**. In messaging sessions where the sender is not the owner, the sandbox restricts which tools are visible and what information can be shared.
