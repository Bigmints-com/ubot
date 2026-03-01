import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../../../src/tools/types.js';

const voiceTranscriberTool: ToolDefinition = {
  name: 'custom_voice_transcriber',
  description: 'Transcribes a voice message file to text using Google Cloud Speech-to-Text.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The local path to the voice message file (e.g., audio.wav).',
      required: true,
    },
  ],
};

const voiceTranscriberModule: ToolModule = {
  name: 'voice_transcriber',
  tools: [voiceTranscriberTool],
  register(registry: ToolRegistry, ctx: ToolContext) {
    registry.registerTool(voiceTranscriberTool.name, async (args) => {
      const startTime = Date.now();
      const { file_path } = args;

      if (!file_path || typeof file_path !== 'string') {
        return {
          toolName: voiceTranscriberTool.name,
          success: false,
          result: 'Error: file_path is required and must be a string.',
          duration: Date.now() - startTime,
        };
      }

      try {
        // Dynamically import dependencies as they might not be in package.json
        const { SpeechClient } = await import('@google-cloud/speech');
        const fs = await import('fs/promises');

        // Check if the file exists before attempting to read
        try {
          await fs.access(file_path);
        } catch (e) {
          return {
            toolName: voiceTranscriberTool.name,
            success: false,
            result: `Error: File not found at path: ${file_path}`,
            duration: Date.now() - startTime,
          };
        }

        const client = new SpeechClient();

        const content = await fs.readFile(file_path);

        const audio = {
          content: content.toString('base64'),
        };

        const config = {
          // The API can auto-detect many formats, so we can keep this minimal.
          // Add encoding and sampleRateHertz if you encounter issues with specific files.
          languageCode: 'en-US',
        };

        const request = {
          audio: audio,
          config: config,
        };

        const [response] = await client.recognize(request);

        if (!response.results || response.results.length === 0) {
            return {
                toolName: voiceTranscriberTool.name,
                success: true,
                result: '[No speech detected]',
                duration: Date.now() - startTime,
            };
        }
        
        const transcription = response.results
          .map(result => result.alternatives && result.alternatives[0] ? result.alternatives[0].transcript : '')
          .join('\n');

        return {
          toolName: voiceTranscriberTool.name,
          success: true,
          result: transcription,
          duration: Date.now() - startTime,
        };

      } catch (error: any) {
        console.error(`[${voiceTranscriberTool.name}] Error:`, error);
        
        let errorMessage = `An unknown error occurred: ${error.message || 'No details available.'}`;
        
        if (error.message && error.message.includes('Could not load the default credentials')) {
          errorMessage = 'Error: Google Cloud authentication failed. Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly.';
        } else if (error.code === 7) {
            errorMessage = 'Error: Permission denied. The API may be disabled in your Google Cloud project or you lack permissions.'
        }

        return {
          toolName: voiceTranscriberTool.name,
          success: false,
          result: errorMessage,
          duration: Date.now() - startTime,
        };
      }
    });
  },
};

export default voiceTranscriberModule;
