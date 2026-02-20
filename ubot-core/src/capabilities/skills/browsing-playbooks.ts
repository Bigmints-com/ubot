/**
 * Browsing Playbook Skills — Seed Data
 *
 * These are starter "playbook" skills that teach the LLM how to browse
 * specific websites using the existing browser tools. Adding a new site
 * is as simple as adding a new skill definition here — no custom code needed.
 *
 * The LLM uses: browse_url, browser_click, browser_type, browser_read_page,
 * browser_scroll, browser_screenshot to execute these playbooks.
 */

import type { Skill } from './skill-types.js';

export interface BrowsingPlaybook {
  name: string;
  description: string;
  instructions: string;
  condition: string;
  tags: string[];
}

export const BROWSING_PLAYBOOKS: BrowsingPlaybook[] = [
  // ── Substack ──────────────────────────────────────
  {
    name: 'Substack: Check Notifications',
    description: 'Browse Substack notifications and mentions',
    condition: 'when the owner asks to check Substack notifications, mentions, or activity',
    tags: ['browsing', 'substack'],
    instructions: `You are browsing Substack on behalf of the owner. Follow these steps:

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
Read the page content carefully — don't guess, report exactly what you see.`,
  },
  {
    name: 'Substack: Read Feed',
    description: 'Browse the Substack feed and read posts',
    condition: "when the owner asks to check their Substack feed, read Substack posts, or see what's new on Substack",
    tags: ['browsing', 'substack'],
    instructions: `You are browsing the Substack feed on behalf of the owner. Follow these steps:

1. Use browse_url to go to https://substack.com/inbox
2. Use browser_read_page to read the feed content
3. Use browser_scroll to load more posts if needed
4. Summarize the recent posts:
   - Post title and author
   - Brief snippet/preview of each post
   - Publication date
5. If the owner asks to read a specific post, use browser_click on its title/link, then use browser_read_page to get the full content
6. If the owner asks to read comments on a post, scroll to the comments section and read them

Report what you actually see on the page. If posts have paywalls, mention that.`,
  },
  {
    name: 'Substack: Write or Reply',
    description: 'Write a comment or reply on Substack',
    condition: 'when the owner asks to comment on a Substack post, reply to a Substack comment, or write something on Substack',
    tags: ['browsing', 'substack'],
    instructions: `You are writing a comment or reply on Substack on behalf of the owner. Follow these steps:

1. If not already on the right post, use browse_url to navigate to it
2. Use browser_scroll to scroll to the comments section
3. Use browser_read_page to see existing comments for context
4. To write a new comment: look for the comment box (usually a textarea or contenteditable div), use browser_click to focus it, then use browser_type to write the owner's message
5. To reply to a specific comment: use browser_click on the "Reply" button under that comment, then use browser_type to write the reply
6. After typing, look for a "Post" or "Reply" submit button and use browser_click to submit

ALWAYS confirm with the owner what they want to say before typing. Never fabricate comments.
After posting, use browser_read_page to confirm the comment was posted successfully.`,
  },

  // ── LinkedIn ──────────────────────────────────────
  {
    name: 'LinkedIn: Check Notifications',
    description: 'Browse LinkedIn notifications and mentions',
    condition: 'when the owner asks to check LinkedIn notifications, mentions, or who viewed their profile',
    tags: ['browsing', 'linkedin'],
    instructions: `You are browsing LinkedIn on behalf of the owner. Follow these steps:

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
LinkedIn may show promotional content — skip those and focus on real interactions.`,
  },
  {
    name: 'LinkedIn: Read Feed',
    description: 'Browse the LinkedIn feed and read posts',
    condition: "when the owner asks to check their LinkedIn feed, see what's new on LinkedIn, or read LinkedIn posts",
    tags: ['browsing', 'linkedin'],
    instructions: `You are browsing the LinkedIn feed on behalf of the owner. Follow these steps:

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
Report engagement numbers as you see them.`,
  },
  {
    name: 'LinkedIn: Engage with Post',
    description: 'Like, comment, or reply on LinkedIn',
    condition: 'when the owner asks to like a LinkedIn post, comment on LinkedIn, reply to a LinkedIn comment, or engage with LinkedIn content',
    tags: ['browsing', 'linkedin'],
    instructions: `You are engaging with LinkedIn content on behalf of the owner. Follow these steps:

1. If not already on the right post, navigate to it using browse_url
2. To LIKE a post: use browser_click on the "Like" button (thumbs up icon)
3. To COMMENT: 
   - Use browser_click on the comment box
   - Use browser_type to write the owner's comment
   - Use browser_click on the "Post" button to submit
4. To REPLY to a comment:
   - Use browser_click on "Reply" under the target comment
   - Use browser_type to write the reply
   - Use browser_click to submit

ALWAYS confirm with the owner what they want to say before posting.
After engaging, use browser_read_page to confirm the action was successful.
Never fabricate comments or engage without explicit owner instruction.`,
  },
  {
    name: 'LinkedIn: Read Messages',
    description: 'Check LinkedIn messages and conversations',
    condition: 'when the owner asks to check LinkedIn messages, read LinkedIn DMs, or see LinkedIn conversations',
    tags: ['browsing', 'linkedin'],
    instructions: `You are checking LinkedIn messages on behalf of the owner. Follow these steps:

1. Use browse_url to go to https://www.linkedin.com/messaging/
2. Use browser_read_page to read the message list
3. Summarize recent conversations:
   - Who sent messages
   - Preview/snippet of each message
   - Unread vs read status
4. If asked to read a specific conversation, use browser_click on it, then browser_read_page to get the full thread
5. If asked to reply, use browser_click on the message input, browser_type to write the reply, and browser_click to send

Be careful with sensitive content — summarize rather than quoting in full unless asked.`,
  },
];

/**
 * Seed browsing playbook skills into the skill engine if they don't already exist.
 * Called once at startup.
 */
export function seedBrowsingPlaybooks(skillEngine: {
  getSkills: () => Skill[];
  saveSkill: (skill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>) => Skill;
}): void {
  const existing = skillEngine.getSkills();
  const existingNames = new Set(existing.map(s => s.name));

  let seeded = 0;
  for (const playbook of BROWSING_PLAYBOOKS) {
    if (existingNames.has(playbook.name)) continue;

    skillEngine.saveSkill({
      name: playbook.name,
      description: playbook.description,
      enabled: true,
      trigger: {
        events: ['whatsapp:message', 'telegram:message', 'web:message'],
        condition: playbook.condition,
        filters: {},
      },
      processor: {
        instructions: playbook.instructions,
        tools: ['browse_url', 'browser_click', 'browser_type', 'browser_read_page', 'browser_scroll', 'browser_screenshot'],
      },
      outcome: {
        action: 'reply',
      },
    });
    seeded++;
  }

  if (seeded > 0) {
    console.log(`[Skills] 🌱 Seeded ${seeded} browsing playbook skill(s)`);
  }
}
