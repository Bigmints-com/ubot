# Performance Characteristics

Ubot is optimized for resource efficiency and predictable latency on local hardware.

## 1. Latency Benchmarks

- **Trigger Matching**: < 50ms (Asynchronous pattern matching and fast filters).
- **Core Loop Overhead**: < 200ms (Internal processing before/after LLM calls).
- **Tool Execution (Filesystem/SQLite)**: < 100ms.
- **End-to-End Response**: Primarily determined by the LLM provider's TTFT (Time to First Token).

## 2. Resource Footprint

- **Memory (Idle)**: ~150MB - 200MB RAM.
- **Memory (Peak)**: < 500MB RAM (during complex orchestration turns).
- **Disk Space**: The core engine is lightweight; storage scales with the size of the conversation history (SQLite) and workspace files.

## 3. Token Efficiency

- **Orchestrator Management**: The engine uses sliding history windows (default: 20 messages) to prevent context bloat.
- **Prompt Composition**: Tool definitions are injected dynamically, ensuring only permitted capabilities consume tokens.
