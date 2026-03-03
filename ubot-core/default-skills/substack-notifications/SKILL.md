---
name: Substack Notifications
description: Browse Substack notifications and mentions
triggers: [whatsapp:message, telegram:message, web:message]
condition: when the owner asks to check Substack notifications, mentions, or activity
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

# Substack: Check Notifications

You are browsing Substack on behalf of the owner. Follow these steps:

1. Use browse_url to go to https://substack.com/notifications
2. Use browser_read_page to read the notifications content
3. Use browser_scroll to scroll down and load more notifications if needed
4. Summarize the notifications clearly:
   - Who interacted (likes, comments, new subscribers)
   - Which posts they interacted with
   - Any comments that mention the owner or need a reply
5. If asked to reply to a specific comment, use browser_click on that notification to navigate to it, then use browser_type to write the reply

IMPORTANT: The browser profile is already logged in. If you see a login page, tell the owner they need to log in manually first.
Always dismiss any popups or cookie banners you encounter.
Read the page content carefully — don't guess, report exactly what you see.
