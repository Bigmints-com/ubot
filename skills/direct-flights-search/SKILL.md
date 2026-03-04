---
name: direct_flights_search
description: Search for direct flights between two cities on a specific date.
triggers: [whatsapp:message]
condition: User asks for direct flights between two cities on a specific date.
outcome: reply
enabled: true
---

1. Use mcp_playwright_browser_navigate to go to https://www.google.com/travel/flights.
2. Take a mcp_playwright_browser_snapshot to see the page.
3. Use mcp_playwright_browser_type to enter "Mumbai" in the origin city field.
4. Use mcp_playwright_browser_type to enter "Delhi" in the destination city field.
5. Set the date for tomorrow.
6. Click Search.
7. Take a final snapshot and extract all direct flight options with times, airlines, duration, and prices. Return a clear list.
