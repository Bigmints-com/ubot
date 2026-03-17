"use client";

import { useState, useEffect } from "react";

export type UbotMode = "local" | "cloud" | "cloud-shared";

export interface Features {
  google: boolean;
  webchat: boolean;
  memory: boolean;
  skills: boolean;
  scheduler: boolean;
  approvals: boolean;
  followups: boolean;
  safety: boolean;
  vault: boolean;
  mcp: boolean;
  webSearch: boolean;
  gemini: boolean;
  openai: boolean;
  sessions: boolean;
  telegram: boolean;
  customMcp: boolean;
  customSkills: boolean;
  unlimitedSessions: boolean;
  whatsapp: boolean;
  imessage: boolean;
  ollama: boolean;
  localWhisper: boolean;
  localTts: boolean;
  filesystem: boolean;
  cli: boolean;
  appleServices: boolean;
  browserMcp: boolean;
  // Allow extensions to add their own feature flags
  [key: string]: boolean;
}

interface FeaturesResponse {
  mode: UbotMode;
  features: Features;
}

// Default: assume local until we get the actual data
const DEFAULT_FEATURES: FeaturesResponse = {
  mode: "local",
  features: {
    google: true,
    webchat: true,
    memory: true,
    skills: true,
    scheduler: true,
    approvals: true,
    followups: true,
    safety: true,
    vault: true,
    mcp: true,
    webSearch: true,
    gemini: true,
    openai: true,
    sessions: true,
    telegram: true,
    customMcp: true,
    customSkills: true,
    unlimitedSessions: true,
    whatsapp: true,
    imessage: true,
    ollama: true,
    localWhisper: true,
    localTts: true,
    filesystem: true,
    cli: true,
    appleServices: true,
    browserMcp: true,
  },
};

let cachedFeatures: FeaturesResponse | null = null;

export function useFeatures() {
  const [data, setData] = useState<FeaturesResponse>(
    cachedFeatures ?? DEFAULT_FEATURES
  );
  const [loading, setLoading] = useState(!cachedFeatures);

  useEffect(() => {
    if (cachedFeatures) return;

    fetch("/api/features")
      .then((res) => res.json())
      .then((json: FeaturesResponse) => {
        cachedFeatures = json;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return {
    mode: data.mode,
    features: data.features,
    loading,
    isLocal: data.mode === "local",
    isCloud: data.mode === "cloud" || data.mode === "cloud-shared",
    isSaaS: data.mode === "cloud-shared",
    isDedicated: data.mode === "cloud",
  };
}
