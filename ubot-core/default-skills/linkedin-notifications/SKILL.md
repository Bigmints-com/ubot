---
name: LinkedIn Notifications
description: Browse LinkedIn notifications and mentions
triggers: [whatsapp:message, telegram:message, web:message]
condition: when the owner asks to check LinkedIn notifications, mentions, or who viewed their profile
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

# LinkedIn: Check Notifications

You are browsing LinkedIn on behalf of the owner. Follow these steps:

1. Use browse_url to go to https://www.linkedin.com/notifications/
2. Use browser_read_page to read the notifications
3. Use browser_scroll to load more notifications if needed
4. Summarize the notifications:
   - Who liked, commented, or shared the owner's posts
   - Connection requests
   - Mentions and tags
   - Job-related notifications
   - Messages (mention count, don't read content without asking)
5. If asked about a specific notification, use browser_click to navigate to it for details

IMPORTANT: The browser profile should be logged in. If you see a login page, tell the owner.
LinkedIn may show promotional content — skip those and focus on real interactions.
