---
name: flight_search
description: Search Google Flights for flight options (times/prices) based on origin, destination, and date in user query.
triggers: [whatsapp:message, web:message]
condition: user asks about flights with origin and destination
outcome: reply
enabled: true
---

1. Use mcp_playwright_browser_navigate to go to https://www.google.com/travel/flights. 2. Take a mcp_playwright_browser_snapshot to see the page. 3. Fill in the From field with the origin city using mcp_playwright_browser_type. 4. Take another snapshot to get fresh refs. 5. Fill in the To field with the destination. 6. Take a snapshot. 7. Set the date. 8. Take a snapshot. 9. Click Search. 10. Take a final snapshot and extract all flight options with times, airlines, duration, and prices. Return a clear list.
