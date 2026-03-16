/**
 * Transcription Service
 *
 * Local speech-to-text using whisper.cpp via @kutalia/whisper-node-addon.
 * Supports audio files (WAV preferred) and converts other formats on the fly
 * using ffmpeg (required for non-WAV inputs like OGG/Opus from WhatsApp).
 *
 * The service lazily loads the Whisper model on first use to avoid
 * blocking startup.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { unlinkSync, mkdirSync } from 'fs';

// ─── Types ───────────────────────────────────────────────

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
}

export interface TranscriptionOptions {
  /** Language code (e.g. 'en', 'auto'). Default: 'en' */
  language?: string;
  /** Whether to use GPU acceleration. Default: true (auto-detect Metal on macOS) */
  useGpu?: boolean;
  /** Number of CPU threads for inference. Default: 4 */
  threads?: number;
}

// ─── Constants ───────────────────────────────────────────

const DEFAULT_MODEL_NAME = 'ggml-large-v3.bin';

function getModelsDir(): string {
  const ubotHome = process.env.UBOT_HOME || process.cwd();
  return join(ubotHome, 'data', 'models');
}

function getTmpDir(): string {
  const ubotHome = process.env.UBOT_HOME || process.cwd();
  const dir = join(ubotHome, 'workspace', 'tmp');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── FFmpeg Utilities ────────────────────────────────────

let _ffmpegAvailable: boolean | null = null;

function isFfmpegAvailable(): boolean {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    _ffmpegAvailable = true;
  } catch {
    _ffmpegAvailable = false;
  }
  return _ffmpegAvailable;
}

/**
 * Convert an audio file to 16kHz mono WAV (required by whisper.cpp).
 * Returns the path to the converted file, or the original path if already WAV.
 */
function convertToWav(inputPath: string): { wavPath: string; needsCleanup: boolean } {
  // Quick check: if it's already a 16kHz WAV we can skip conversion
  const ext = inputPath.split('.').pop()?.toLowerCase();
  if (ext === 'wav') {
    return { wavPath: inputPath, needsCleanup: false };
  }

  if (!isFfmpegAvailable()) {
    throw new Error(
      'ffmpeg is required to convert audio files to WAV format. ' +
      'Install it with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)'
    );
  }

  const tmpDir = getTmpDir();
  const wavPath = join(tmpDir, `whisper-${randomUUID()}.wav`);

  try {
    // Convert to 16kHz mono WAV (whisper.cpp requirement)
    execSync(
      `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`,
      { stdio: 'ignore', timeout: 30000 }
    );
    return { wavPath, needsCleanup: true };
  } catch (err: any) {
    // Clean up partial file
    try { unlinkSync(wavPath); } catch {}
    throw new Error(`Failed to convert audio to WAV: ${err.message}`);
  }
}

// ─── Transcription Service ───────────────────────────────

let whisperTranscribe: any = null;

async function getWhisperTranscribe(): Promise<any> {
  if (whisperTranscribe) return whisperTranscribe;
  const mod = await import('@kutalia/whisper-node-addon');
  // The package exports { transcribe } as a named export
  whisperTranscribe = mod.transcribe || (mod.default && mod.default.transcribe) || mod.default;
  if (!whisperTranscribe) {
    throw new Error('Could not find transcribe function in @kutalia/whisper-node-addon');
  }
  return whisperTranscribe;
}

/**
 * Transcribe an audio file using the local Whisper model.
 *
 * @param audioPath - Absolute path to the audio file
 * @param options - Transcription options
 * @returns Transcription result with text
 */
export async function transcribeAudio(
  audioPath: string,
  options: TranscriptionOptions = {},
): Promise<TranscriptionResult> {
  const {
    language = 'en',
    useGpu = true,
    threads = 4,
  } = options;

  // Validate input file exists
  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Find model
  const modelsDir = getModelsDir();
  const modelPath = join(modelsDir, DEFAULT_MODEL_NAME);

  if (!existsSync(modelPath)) {
    throw new Error(
      `Whisper model not found at ${modelPath}. ` +
      `Download it with: curl -L -o "${modelPath}" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${DEFAULT_MODEL_NAME}`
    );
  }

  // Convert to WAV if needed
  const { wavPath, needsCleanup } = convertToWav(audioPath);

  try {
    const transcribe = await getWhisperTranscribe();
    const startTime = Date.now();

    const result = await transcribe({
      fname_inp: wavPath,
      model: modelPath,
      language,
      use_gpu: useGpu,
      n_threads: threads,
      no_prints: true,
    });

    const duration = (Date.now() - startTime) / 1000;

    // Parse result — whisper-node-addon returns { transcription: [[start, end, text], ...] }
    let text = '';
    if (result?.transcription && Array.isArray(result.transcription)) {
      text = result.transcription.map((s: any) => (s[2] || s.text || '')).join(' ').trim();
    } else if (Array.isArray(result)) {
      text = result.map((s: any) => (s.text || s[2] || '')).join(' ').trim();
    } else if (typeof result === 'string') {
      text = result.trim();
    } else if (result?.text) {
      text = result.text.trim();
    }

    // Filter whisper hallucinations (common with short/quiet audio)
    const hallucinations = ['...', '[music]', '[Music]', '(music)', '[blank_audio]', '[silence]', '[ Silence ]', '[no speech]', ''];
    if (hallucinations.includes(text) || /^\.*$/.test(text)) {
      text = '';
    }

    console.log(`[Transcription] ✅ Transcribed ${audioPath} in ${duration.toFixed(1)}s: "${text.slice(0, 80)}..."`);

    return {
      text: text || '(no speech detected)',
      language,
      duration,
    };
  } finally {
    // Clean up temp WAV file
    if (needsCleanup) {
      try { unlinkSync(wavPath); } catch {}
    }
  }
}

/**
 * Check if the transcription service is available (model exists).
 */
export function isTranscriptionAvailable(): boolean {
  const modelPath = join(getModelsDir(), DEFAULT_MODEL_NAME);
  return existsSync(modelPath);
}

/**
 * Get the path to the Whisper model.
 */
export function getModelPath(): string {
  return join(getModelsDir(), DEFAULT_MODEL_NAME);
}
