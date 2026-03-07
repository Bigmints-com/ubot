---
name: WhatsApp Bot Interaction
description: Interact with WhatsApp bots by understanding their menus, buttons, lists, and interactive content, then responding with the correct choices
triggers: [whatsapp:message]
filter_dms_only: true
condition: the message is from an automated WhatsApp bot or service — it contains a structured menu, numbered/lettered options, interactive buttons, lists, or has a formulaic non-conversational tone typical of automated systems
outcome: silent
enabled: true
---

# WhatsApp Bot Interaction

Interact with WhatsApp bots (business bots, service bots, booking systems) by reading their interactive menus and responding with the correct selections on the owner's behalf.

## CRITICAL: Read conversation history FIRST

Before doing ANYTHING:

1. Use `search_messages` to read the FULL conversation history with this bot
2. Check the chat summary and memory for the owner's stated intent
3. If the owner already said what they want (e.g. "book an appointment"), YOU ALREADY KNOW THE ANSWER — just do it

**DO NOT use ask_owner if the answer is obvious.** For example:

- Owner said "book an appointment" → menu has "Book an appointment, type A" → SEND "A" IMMEDIATELY
- Owner said "check lab results" → menu has "Lab Results, type R" → SEND "R" IMMEDIATELY
- Owner said "cancel my appointment" → menu has "Manage appointments, type M" → SEND "M" IMMEDIATELY

**Only use ask_owner when:**

- There is NO prior context about what the owner wants
- The menu options are ambiguous and don't clearly match the owner's request
- A critical/irreversible action needs confirmation (payment, cancellation of something important)

## How to respond

1. **Read conversation history** — search_messages to understand the owner's intent
2. **Match intent to menu option** — find the option that matches what the owner asked for
3. **Send ONLY the selection key** — the letter, number, or exact text the bot expects. NOT the whole label.
4. **Use `wa_respond_to_bot`** to send the choice
   - `to`: the sender's JID, phone number, or rawJid from event data. Any format works.
   - `response`: the EXACT key the bot expects — just the letter or number, NOT the full description
5. **DO NOT reply as a secretary** — you are interacting WITH the bot, not replying to a human
6. **DO NOT use send_message** — use `wa_respond_to_bot` instead

## Menu response format — CRITICAL

Bots expect a SPECIFIC response format. Send ONLY the key, not the description:

### Letter-based menus

```
Book an appointment, type *A*
Manage appointments, type *M*
Lab Results, type *R*
```

✅ Send: `wa_respond_to_bot(to=jid, response="A")` — just the letter
❌ Wrong: `wa_respond_to_bot(to=jid, response="Book an appointment")`

### Number-based menus

```
1. General Consultation
2. Specialist Visit
3. Lab Work
```

✅ Send: `wa_respond_to_bot(to=jid, response="1")` — just the number
❌ Wrong: `wa_respond_to_bot(to=jid, response="General Consultation")`

### Keyword menus

```
Type BOOK to book appointment
Type CANCEL to cancel
```

✅ Send: `wa_respond_to_bot(to=jid, response="BOOK")` — the exact keyword

### Yes/No or Hi prompts

✅ Send: `wa_respond_to_bot(to=jid, response="Hi")` or `wa_respond_to_bot(to=jid, response="YES")`

### Interactive buttons/lists

When the message has numbered button options like [1] Book Now (id: book_now):
✅ Send the label: `wa_respond_to_bot(to=jid, response="Book Now")`

## Starting or restarting a conversation

When a bot says any of the following, ALWAYS send "Hi" immediately — no need to ask the owner:

- "Please type 'Hi' to go to the welcome message"
- "Your session has timed out"
- "Type Hi to start"
- Any variation asking you to type Hi, Hello, or Start

Just send: `wa_respond_to_bot(to=jid, response="Hi")`

This restarts the bot's menu flow. Once the bot sends its main menu, THEN match the owner's intent and select the right option.

## Multi-step bot flows

Bots often have multi-step menus. After selecting the first option, the bot will present more choices. Continue matching the owner's intent through each step:

- If the bot asks for a name → provide the name the owner specified
- If the bot asks for date/time → provide the date/time the owner specified
- If the bot asks for something you don't know → THEN use ask_owner

## Important rules

- **Act decisively** — if the owner's intent is clear, just do it. Don't second-guess.
- **Send the exact key** — "A" not "Book an appointment (A)". "1" not "1. General Consultation".
- **Don't loop** — if the bot keeps sending the same menu after your response, try a different format or use ask_owner to escalate.
- **Be exact** — bots are literal. Send exactly what they expect, not variations.
- **Silent outcome** — this skill uses `wa_respond_to_bot` directly, not the normal reply mechanism.
- **Never display used tools** — never show tool usage in any output.
