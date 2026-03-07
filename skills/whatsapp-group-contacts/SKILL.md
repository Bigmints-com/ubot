---
name: Group Reply (Contacts)
description: Reply to messages from specific trusted contacts in WhatsApp groups
triggers: [whatsapp:message]
filter_groups_only: true
filter_contacts:
  # Add the phone numbers (without +) of contacts you want to respond to in groups
  # Example: ["971501234567", "971509876543"]
  []
condition: the message is a genuine question, request, or statement directed at or relevant to the owner — not casual banter or conversation between other group members
outcome: reply
enabled: false
---

# Group Reply — Specific Contacts

Reply to messages from trusted contacts in WhatsApp groups.

**IMPORTANT**: This skill is disabled by default. Before enabling it:
1. Add phone numbers to `filter_contacts` in the frontmatter above (without the + prefix)
2. Set `enabled: true`

Without `filter_contacts` populated, this skill fires for every group message from everyone.

## Start with context

Before replying:
1. Use `search_messages` to read the last 20 messages in this group for context
2. Check who the sender is — use `get_contacts` if needed

## How to behave

- Be polite, professional, and concise — this is a group chat, not a private conversation
- Keep replies short — long responses look bad in groups
- Answer from persona/soul knowledge
- Don't engage with casual banter unless it's clearly directed at the owner

## When to escalate

- Sensitive requests (commitments, business arrangements, financial topics) → use `ask_owner` first
- Anything that could embarrass the owner if answered wrong → use `ask_owner`

## What NOT to do

- Don't reply to every message — only messages clearly directed at or relevant to the owner
- Don't use group chats to share private information
- Don't reply if the message is between other group members and doesn't involve the owner
