"use client";

import { Separator } from "@/components/ui/separator";
import { Search } from "lucide-react";
import { ProviderList } from "@/components/provider-list";

const SEARCH_PRESETS = [
  { type: "serper", label: "Serper.dev (Google)", baseUrl: "https://google.serper.dev/search", requiresApiKey: true, supportsModelDiscovery: false },
  { type: "duckduckgo", label: "DuckDuckGo", baseUrl: "", requiresApiKey: false, supportsModelDiscovery: false },
];

export default function WebSearchPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Search className="size-6" />
          Web Search
        </h1>
        <p className="text-muted-foreground">
          Configure search providers for the agent. The default provider is tried first,
          then enabled providers are used as fallbacks.
        </p>
      </div>

      <Separator />

      <ProviderList
        category="search"
        providerTypes={SEARCH_PRESETS}
        showModel={false}
        showBaseUrl={false}
        emptyText="No search providers configured"
      />
    </div>
  );
}
