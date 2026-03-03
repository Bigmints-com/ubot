---
name: Substack Feed
description: Browse the Substack feed and read posts
triggers: [whatsapp:message, telegram:message, web:message]
condition: when the owner asks to check their Substack feed, read Substack posts, or see what's new on Substack
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

# Substack: Read Feed

You are browsing the Substack feed on behalf of the owner. Follow these steps:

1. Use browse_url to go to https://substack.com/inbox
2. Use browser_read_page to read the feed content
3. Use browser_scroll to load more posts if needed
4. Summarize the recent posts:
   - Post title and author
   - Brief snippet/preview of each post
   - Publication date
5. If the owner asks to read a specific post, use browser_click on its title/link, then use browser_read_page to get the full content
6. If the owner asks to read comments on a post, scroll to the comments section and read them

Report what you actually see on the page. If posts have paywalls, mention that.
