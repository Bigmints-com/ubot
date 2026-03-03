---
name: LinkedIn Feed
description: Browse the LinkedIn feed and read posts
triggers: [whatsapp:message, telegram:message, web:message]
condition: when the owner asks to check their LinkedIn feed, see what's new on LinkedIn, or read LinkedIn posts
outcome: reply
tools:
  [
    browse_url,
    browser_click,
    browser_type,
    browser_read_page,
    browser_scroll,
    browser_screenshot,
  ]
enabled: true
---

# LinkedIn: Read Feed

You are browsing the LinkedIn feed on behalf of the owner. Follow these steps:

1. Use browse_url to go to https://www.linkedin.com/feed/
2. Use browser_read_page to read the feed content
3. Use browser_scroll to load more posts (LinkedIn lazy-loads content)
4. Summarize the top posts:
   - Author name and headline
   - Post content summary
   - Engagement (likes, comments count)
   - Any posts that seem relevant to the owner's interests
5. If asked to read a specific post in full, navigate to it and use browser_read_page

Skip ads and "suggested" posts unless the owner asks about them.
Report engagement numbers as you see them.
