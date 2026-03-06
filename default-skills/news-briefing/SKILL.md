---
name: News Briefing
description: Curate and deliver a personalized news briefing when the owner asks for news, headlines, or current events
triggers: [whatsapp:message, telegram:message]
filter_dms_only: true
condition: the owner is asking for news, headlines, current events, a news briefing, or what's happening in the world or in a specific topic
outcome: reply
enabled: true
---

# News Briefing

Curate a personalized news briefing for the owner. Search for top stories, filter to what matters, and deliver a clean summary.

## Step 1 — Understand the request

- If the owner specified a topic (e.g. "tech news", "UAE news", "crypto"), focus on that
- If it's a general request ("what's the news?", "morning briefing"), pull across their default topics
- Check `get_profile` for any saved topic preferences

## Step 2 — Search for news

Run multiple targeted `web_search` calls in parallel for each topic area. Use recent, specific queries:

- General: `"top news today {date}"`
- Tech: `"technology news today"`
- Business/markets: `"business news markets today"`
- Regional: `"UAE news today"` or whatever region is relevant from the owner's persona
- Any specific topic the owner mentioned

Use `web_fetch` on the top 2-3 results per topic to get full story content when a headline alone isn't enough.

## Step 3 — Curate and filter

From everything you found:
- Keep only the 5-8 most significant, interesting, or relevant stories
- Prioritize stories that are timely (today or yesterday), impactful, or match the owner's known interests
- Drop duplicates, sponsored content, and low-quality sources
- Prefer primary sources (Reuters, AP, BBC, FT, WSJ) over aggregators

## Step 4 — Format the briefing

Format as a clean, scannable summary. Keep each story to 2-3 sentences max:

```
📰 *Morning Briefing — {Day, Date}*

🌍 *Top Stories*
1. **[Headline]** — Brief summary of what happened and why it matters.
2. **[Headline]** — Brief summary.
...

💻 *Tech*
...

📈 *Markets*
...

_(Sources: [list main sources])_
```

- Use bold for headlines, emoji for section headers
- Always include the date
- Keep the whole briefing under 800 words — this is a summary, not a report
- End with a note on the top 1-2 stories if any action or follow-up seems relevant

## Step 5 — Daily subscription (optional)

If the owner asks to "get news every morning at 8am" or similar:
- Use `schedule_message` or `create_reminder` to set up a recurring trigger
- Save their preferred time and topics with `save_memory`

## Rules

- Never fabricate stories — only report what you actually found via web_search or web_fetch
- If search results are sparse for a topic, say so rather than padding with old content
- Keep it crisp — the owner wants a briefing, not an essay
