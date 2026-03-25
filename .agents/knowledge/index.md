# Ubot Knowledge Base

Technical documentation for the Ubot agentic operating system. All content is derived from the actual implementation in `ubot-core`.

> **Maintenance Rule**: When adding or removing tools, update [registry_tools.md](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/registry_tools.md) with the tool name, description, and parameters. This is the canonical tool reference.

## 📜 Core Architecture

- **[Principles: Core Values](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/principles_core.md)**
- **[Principles: Architectural Pillars](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/principles_architectural.md)**
- **[Technical Stack & Runtime](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/tech_stack.md)** *(updated March 2026: Vertex AI, webchat, metering)*
- **[Safety & Guardrails](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/safety_guardrails.md)**
- **[Security Threat Model](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/threat_model.md)**
- **[Compliance & Privacy](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/compliance_privacy.md)**

## 🧬 Anatomy of Ubot

The six layers of a Ubot instance:

1.  **[Soul (Identity Layer)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/anatomy_soul.md)**
2.  **[Sandbox (Security Layer)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/anatomy_sandbox.md)**
3.  **[Orchestrator (Decision Engine)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/anatomy_orchestrator.md)** *(updated March 2026: Vertex auth, per-purpose routing, metering, tool-selector fallback)*
4.  **[Skills (Workflow Engine)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/anatomy_skills.md)**
5.  **[Connectivity (Interface Layer)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/anatomy_connectivity.md)** *(updated March 2026: webchat relay channel)*
6.  **[Tools (Registry & MCP)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/anatomy_tools.md)**

## 📋 Registries & Reference

- **[Registry: Tools & Capabilities](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/registry_tools.md)** — Complete tool catalog (107+ native tools across 16 modules)
- **[Tool Reference Index](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/tools_reference.md)** — Flat table of every tool name and description
- **[Registry: Skills & Automations](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/registry_skills.md)** — Skills with two-phase matching (file-based and SQLite-backed)
- **[Registry: Specialized Agents (Personas)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/registry_personas.md)**
- **[Data Interchange & Schemas](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/data_schemas.md)** — UnifiedMessage, SkillEvent, WhatsAppInteractiveOption
- **[Performance Characteristics](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/performance_metrics.md)**
- **[Technical Glossary](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/glossary.md)**

## 🤖 AI & Model Routing *(New March 2026)*

- **[Model Routing & Vertex AI](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/model_routing.md)** — Per-purpose model routing, Vertex SA auth, Gemini 2.5 migration, metering
- **[Webchat Relay Architecture](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/webchat_relay.md)** — Cloud Run relay, poll loop, in-flight deduplication, embed widget

## 🏛 Strategic & Whitepaper Context

- **[Comparative Architecture](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/competitive_landscape.md)**
- **[Strategic Use Cases](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/use_cases.md)**
- **[Interaction Model](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/interaction_design.md)**
- **[Interaction Archetypes (Sequences)](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/interaction_archetypes.md)** — Includes bot interaction flow
- **[Open Source Ecosystem](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/ecosystem.md)**

## 🛠 Operation & Development

- **[Developer Guide: Extensibility](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/dev_guide.md)** — Build, deploy, add tools/skills *(updated March 2026: make update, remote deploy)*
- **[Remote Server Deployment](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/deployment_remote.md)** — VPS setup, SSH alias, port config, common issues *(New March 2026)*
- **[Maintenance & Operations Guide](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/operations_guide.md)** — Debugging, monitoring, common issues
- **[Project Nexus History](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/nexus_evolution.md)**

---

_Last updated: 2026-03-26. This KB is the technical source of truth for Ubot._
