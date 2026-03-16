/**
 * Transcription Tool Module
 *
 * Provides a `transcribe_audio` tool for the LLM to transcribe audio files
 * on demand. Also exports auto-transcription utility used by channel handlers.
 *
 * Auto-discovered by the tool registry (src/tools/registry.ts)
 * because this directory lives under capabilities/.
 */

import type { ToolModule, ToolRegistry, ToolContext } from '../../tools/types.js';
import { toolResult, safeExecutor } from '../../tools/types.js';
import { transcribeAudio, isTranscriptionAvailable } from './service.js';

const transcriptionToolModule: ToolModule = {
  name: 'transcription',

  tools: [
    {
      name: 'transcribe_audio',
      description:
        'Transcribe an audio file to text using the local Whisper AI model. ' +
        'Supports WAV, OGG, MP3, M4A, and other audio formats. ' +
        'Use this to transcribe voice messages, audio recordings, or any sound file.',
      parameters: [
        {
          name: 'file_path',
          type: 'string',
          description: 'Absolute path to the audio file to transcribe',
          required: true,
        },
        {
          name: 'language',
          type: 'string',
          description: 'Language code (e.g. "en" for English, "ar" for Arabic, "auto" for auto-detect). Default: "en"',
          required: false,
        },
      ],
    },
  ],

  register(registry: ToolRegistry, _ctx: ToolContext) {
    registry.register(
      'transcribe_audio',
      safeExecutor('transcribe_audio', async (args) => {
        const filePath = args.file_path as string;
        const language = (args.language as string) || 'en';

        if (!filePath) {
          throw new Error('file_path is required');
        }

        if (!isTranscriptionAvailable()) {
          throw new Error(
            'Whisper model not found. The transcription feature requires a GGML model file. ' +
            'Download one from https://huggingface.co/ggerganov/whisper.cpp/tree/main'
          );
        }

        const result = await transcribeAudio(filePath, { language });

        return JSON.stringify({
          text: result.text,
          language: result.language,
          duration_seconds: result.duration,
        });
      }),
    );
  },
};

export const toolModules: ToolModule[] = [transcriptionToolModule];
export default transcriptionToolModule;
