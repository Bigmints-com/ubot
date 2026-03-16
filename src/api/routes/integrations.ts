/**
 * Integration Routes
 * /api/google/*
 */

import http from 'http';
import { parseBody, json, error, type ApiContext } from '../context.js';

export async function handleIntegrationRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
): Promise<boolean> {

  // ── Google Auth API ──────────────────────────────────
  if (url === '/api/google/auth/status' && method === 'GET') {
    try {
      const { getGoogleAuthStatus } = await import('../../capabilities/google/auth.js');
      const status = getGoogleAuthStatus();
      json(res, status);
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/start' && method === 'POST') {
    try {
      const { startGoogleAuth } = await import('../../capabilities/google/auth.js');
      await startGoogleAuth();
      json(res, { success: true, message: 'Google authorization complete. Tokens saved.' });
    } catch (err: any) {
      error(res, `Google auth failed: ${err.message}`, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/clear' && method === 'POST') {
    try {
      const { clearGoogleAuth } = await import('../../capabilities/google/auth.js');
      await clearGoogleAuth();
      json(res, { success: true, message: 'Google auth cleared.' });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/services/config' && method === 'GET') {
    try {
      const { getGoogleServicesConfig } = await import('../../capabilities/google/auth.js');
      const services = getGoogleServicesConfig();
      json(res, { services });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/services/config' && method === 'PUT') {
    try {
      const body = await parseBody(req) as any;
      const { saveGoogleServicesConfig } = await import('../../capabilities/google/auth.js');
      const updated = await saveGoogleServicesConfig(body.services || {});
      json(res, { services: updated });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  // ── MCP Servers ─────────────────────────────────────────

  if (url === '/api/mcp/servers' && method === 'GET') {
    const mgr = ctx.mcpManager;
    if (!mgr) { json(res, { servers: [] }); return true; }
    json(res, { servers: mgr.getServers() });
    return true;
  }

  if (url === '/api/mcp/servers' && method === 'POST') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const body = await parseBody(req) as any;
    if (!body.name || !body.command) { error(res, 'name and command are required'); return true; }

    const config = {
      id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: body.name,
      command: body.command,
      args: body.args || [],
      env: body.env || {},
      enabledTools: body.enabledTools || [],
      discoveredTools: body.discoveredTools || [],
    };
    mgr.addServer(config);

    // Auto-connect if requested
    if (body.autoConnect !== false) {
      await mgr.connectServer(config.id).catch(() => {});
    }

    const status = mgr.getServer(config.id);
    json(res, { server: status }, 201);
    return true;
  }

  if (url === '/api/mcp/servers/validate' && method === 'POST') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const body = await parseBody(req) as any;
    if (!body.command) { error(res, 'command is required'); return true; }
    try {
      const tools = await mgr.validateServer({
        command: body.command,
        args: body.args || [],
        env: body.env || {},
      });
      json(res, { valid: true, tools });
    } catch (err: any) {
      json(res, { valid: false, error: err.message, tools: [] });
    }
    return true;
  }

  if (url.match(/^\/api\/mcp\/servers\/[^/]+$/) && method === 'PUT') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const id = url.split('/').pop()!;
    const body = await parseBody(req) as any;
    const updated = mgr.updateServer(id, body);
    if (!updated) { error(res, 'Server not found', 404); return true; }

    // Reconnect if tools changed
    if (body.enabledTools !== undefined || body.command !== undefined) {
      await mgr.connectServer(id).catch(() => {});
    }

    const status = mgr.getServer(id);
    json(res, { server: status });
    return true;
  }

  if (url.match(/^\/api\/mcp\/servers\/[^/]+$/) && method === 'DELETE') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const id = url.split('/').pop()!;
    const removed = await mgr.removeServer(id);
    if (!removed) { error(res, 'Server not found', 404); return true; }
    json(res, { deleted: true });
    return true;
  }

  if (url.match(/^\/api\/mcp\/servers\/[^/]+\/reconnect$/) && method === 'POST') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const parts = url.split('/');
    const id = parts[parts.length - 2];
    try {
      await mgr.connectServer(id);
      const status = mgr.getServer(id);
      json(res, { server: status });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  // ── Local Transcription Status ───────────────────────────
  if (url === '/api/transcription/status' && method === 'GET') {
    try {
      const { isTranscriptionAvailable, getModelPath } = await import('../../capabilities/transcription/service.js');
      const modelPath = getModelPath();
      const available = isTranscriptionAvailable();
      let fileSize = 0;
      if (available) {
        const { statSync } = await import('fs');
        try {
          fileSize = statSync(modelPath).size;
        } catch { /* ignore */ }
      }

      // Check if ffmpeg is available
      let ffmpegAvailable = false;
      try {
        const { execSync } = await import('child_process');
        execSync('ffmpeg -version', { stdio: 'ignore' });
        ffmpegAvailable = true;
      } catch { /* ignore */ }

      json(res, {
        available,
        model: {
          name: modelPath.split('/').pop()?.replace('.bin', '') || 'ggml-large-v3',
          path: modelPath,
          size: fileSize,
          sizeFormatted: available ? `${(fileSize / 1024 / 1024).toFixed(1)} MB` : null,
        },
        ffmpeg: ffmpegAvailable,
        backend: process.arch === 'arm64' ? 'Metal (Apple Silicon)' : 'CPU',
      });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  // ── Local Transcription Model Download ─────────────────
  if (url === '/api/transcription/download' && method === 'POST') {
    try {
      const body = await parseBody(req) as { model?: string };
      const modelName = body.model || 'ggml-large-v3.bin';
      const { getModelPath } = await import('../../capabilities/transcription/service.js');
      const { join, dirname } = await import('path');
      const { existsSync, mkdirSync } = await import('fs');

      const modelsDir = dirname(getModelPath());
      if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true });

      const modelPath = join(modelsDir, modelName);

      if (existsSync(modelPath)) {
        json(res, { success: true, message: 'Model already exists', path: modelPath });
        return true;
      }

      // Start download in background
      const downloadUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`;

      // Use spawn to download in background
      const { spawn } = await import('child_process');
      const tmpPath = modelPath + '.downloading';
      const child = spawn('curl', ['-L', '-o', tmpPath, downloadUrl], {
        stdio: 'ignore',
        detached: true,
      });

      // Track download state
      (globalThis as any).__whisperDownload = {
        modelName,
        pid: child.pid,
        startedAt: Date.now(),
        done: false,
        error: null,
      };

      child.on('exit', async (code) => {
        const state = (globalThis as any).__whisperDownload;
        if (code === 0) {
          // Rename from .downloading to final path
          try {
            const { renameSync } = await import('fs');
            renameSync(tmpPath, modelPath);
            state.done = true;
            console.log(`[Transcription] ✅ Model downloaded: ${modelName}`);
          } catch (err: any) {
            state.done = true;
            state.error = err.message;
          }
        } else {
          state.done = true;
          state.error = `Download failed with exit code ${code}`;
          try {
            const { unlinkSync } = await import('fs');
            unlinkSync(tmpPath);
          } catch {}
        }
      });

      child.unref();

      json(res, {
        success: true,
        message: `Downloading ${modelName}...`,
        model: modelName,
      });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/transcription/download/progress' && method === 'GET') {
    const state = (globalThis as any).__whisperDownload;
    if (!state) {
      json(res, { downloading: false });
      return true;
    }

    // Check file size for progress
    let downloadedBytes = 0;
    try {
      const { getModelPath } = await import('../../capabilities/transcription/service.js');
      const { dirname, join } = await import('path');
      const { statSync } = await import('fs');
      const tmpPath = join(dirname(getModelPath()), state.modelName + '.downloading');
      try { downloadedBytes = statSync(tmpPath).size; } catch {}
    } catch {}

    json(res, {
      downloading: !state.done,
      modelName: state.modelName,
      done: state.done,
      error: state.error,
      downloadedBytes,
      downloadedFormatted: `${(downloadedBytes / 1024 / 1024).toFixed(0)} MB`,
      elapsedSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    });
    return true;
  }

  // ── Transcribe uploaded audio ──────────────────────────
  if (url === '/api/transcription/transcribe' && method === 'POST') {
    try {
      const { transcribeAudio, isTranscriptionAvailable } = await import('../../capabilities/transcription/service.js');

      if (!isTranscriptionAvailable()) {
        error(res, 'Local transcription model not installed. Download it from Models → Transcription.', 503);
        return true;
      }

      // Read raw audio body
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', resolve);
      });
      const audioBuffer = Buffer.concat(chunks);

      if (audioBuffer.length === 0) {
        error(res, 'No audio data received');
        return true;
      }

      // Determine format from content-type
      const contentType = req.headers['content-type'] || 'audio/webm';
      const extMap: Record<string, string> = {
        'audio/webm': '.webm',
        'audio/ogg': '.ogg',
        'audio/wav': '.wav',
        'audio/mp4': '.m4a',
        'audio/mpeg': '.mp3',
      };
      const ext = extMap[contentType.split(';')[0]] || '.webm';

      // Save to temp file
      const { join } = await import('path');
      const { writeFileSync, mkdirSync } = await import('fs');
      const { randomUUID } = await import('crypto');
      const tmpDir = join(process.env.UBOT_HOME || process.cwd(), 'workspace', 'uploads');
      mkdirSync(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, `voice-${randomUUID()}${ext}`);
      writeFileSync(tmpPath, audioBuffer);

      // Transcribe
      const result = await transcribeAudio(tmpPath);

      // Clean up
      try { const { unlinkSync } = await import('fs'); unlinkSync(tmpPath); } catch {}

      json(res, {
        text: result.text,
        duration: result.duration,
        language: result.language,
      });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  // ── TTS Status ─────────────────────────────────────────
  if (url === '/api/tts/status' && method === 'GET') {
    try {
      const { isTtsAvailable, getAvailableVoices } = await import('../../capabilities/tts/service.js');
      json(res, {
        available: isTtsAvailable(),
        voices: getAvailableVoices(),
      });
    } catch (err: any) {
      json(res, { available: false, voices: [], error: err.message });
    }
    return true;
  }

  // ── TTS Speak ──────────────────────────────────────────
  if (url === '/api/tts/speak' && method === 'POST') {
    try {
      const body = await parseBody(req) as { text: string; voice?: string; speed?: number };

      if (!body.text) {
        error(res, 'Missing "text" field');
        return true;
      }

      const { textToSpeech, isTtsAvailable } = await import('../../capabilities/tts/service.js');

      if (!isTtsAvailable()) {
        error(res, 'TTS not available. Install piper-tts and download a voice model.', 503);
        return true;
      }

      const result = textToSpeech(body.text, {
        voice: body.voice,
        speed: body.speed,
      });

      // Read WAV file and send as audio response
      const { readFileSync, unlinkSync } = await import('fs');
      const audioData = readFileSync(result.audioPath);

      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': audioData.length,
        'X-TTS-Duration': String(result.duration),
        'X-TTS-Voice': result.voice,
      });
      res.end(audioData);

      // Clean up temp file
      try { unlinkSync(result.audioPath); } catch {}
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  return false;
}
