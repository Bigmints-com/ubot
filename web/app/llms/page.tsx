"use client";

import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Image, AudioLines } from "lucide-react";
import { ProviderList } from "@/components/provider-list";

const LLM_CHAT_PRESETS = [
  { type: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", requiresApiKey: true, supportsModelDiscovery: true },
  { type: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1/", requiresApiKey: true, supportsModelDiscovery: true },
  { type: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1", requiresApiKey: false, supportsModelDiscovery: true },
  { type: "custom", label: "Custom", baseUrl: "", requiresApiKey: true, supportsModelDiscovery: true },
];

const LLM_IMAGE_PRESETS = [
  { type: "openai", label: "OpenAI (DALL-E)", baseUrl: "https://api.openai.com/v1/", requiresApiKey: true, supportsModelDiscovery: false },
  { type: "stability", label: "Stability AI", baseUrl: "https://api.stability.ai/v1/", requiresApiKey: true, supportsModelDiscovery: false },
  { type: "custom", label: "Custom", baseUrl: "", requiresApiKey: true, supportsModelDiscovery: false },
];

const LLM_TRANSCRIPT_PRESETS = [
  { type: "openai", label: "OpenAI (Whisper)", baseUrl: "https://api.openai.com/v1/", requiresApiKey: true, supportsModelDiscovery: false },
  { type: "deepgram", label: "Deepgram", baseUrl: "https://api.deepgram.com/v1/", requiresApiKey: true, supportsModelDiscovery: false },
  { type: "custom", label: "Custom", baseUrl: "", requiresApiKey: true, supportsModelDiscovery: false },
];

export default function LlmsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="size-6" />
          LLM Providers
        </h1>
        <p className="text-muted-foreground">
          Configure AI model providers for chat, image generation, and transcription
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">
            <Bot className="size-4 mr-2" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="image">
            <Image className="size-4 mr-2" />
            Image Generation
          </TabsTrigger>
          <TabsTrigger value="transcript">
            <AudioLines className="size-4 mr-2" />
            Transcription
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          <ProviderList
            category="models"
            providerTypes={LLM_CHAT_PRESETS}
            showModel={true}
            showBaseUrl={true}
            emptyText="No chat LLM providers configured"
          />
        </TabsContent>

        <TabsContent value="image" className="mt-4">
          <ProviderList
            category="llm-image"
            providerTypes={LLM_IMAGE_PRESETS}
            showModel={true}
            showBaseUrl={true}
            emptyText="No image generation providers configured"
          />
        </TabsContent>

        <TabsContent value="transcript" className="mt-4">
          <ProviderList
            category="llm-transcript"
            providerTypes={LLM_TRANSCRIPT_PRESETS}
            showModel={false}
            showBaseUrl={true}
            emptyText="No transcription providers configured"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
