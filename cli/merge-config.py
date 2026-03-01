#!/usr/bin/env python3
"""Deep-merge default config into existing config without overwriting user values."""
import json, sys

def deep_merge(base, defaults):
    for k, v in defaults.items():
        if k not in base:
            base[k] = v
        elif isinstance(v, dict) and isinstance(base.get(k), dict):
            deep_merge(base[k], v)
    return base

existing_path = sys.argv[1]
defaults_path = sys.argv[2]

existing = json.load(open(existing_path))
defaults = json.load(open(defaults_path))
merged = deep_merge(existing, defaults)
json.dump(merged, open(existing_path, 'w'), indent=4)
print('   Config updated (new keys merged, existing values preserved)')
