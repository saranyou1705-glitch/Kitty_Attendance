# Shared UI pass

Presentation changes only. Production, API authentication and business rules are unchanged.

- Neutral background, white surfaces, one navy primary color; semantic warning colors retained.
- Shared type hierarchy, 16px form inputs, 44px minimum controls, consistent gaps and alignment.
- Sidebar on desktop and bottom navigation on phone, with all Admin sections retained via Management.
- Keyboard focus, reduced motion, current navigation state, distinct disabled controls.
- Fixed missing closing scroll-container tag in all tables.

Run: node --test staging/live-ui.test.cjs staging/individual-report.test.cjs

Manual verification still required at 375px, 720px, 1024px and 1440px, plus 200% zoom:
dashboard, directory, schedule, leave/drafts, daily/monthly/individual Excel reports,
LINE preview and personal calendar. Confirm tables scroll within cards, not the page;
all navigation remains reachable; focus is visible; dialogs and bottom safe area fit.

Admin currently authenticates via LINE in both desktop browsers and on phones.
External HR code-only authentication is NOT implemented or enabled. It requires a
separate server-verified identity/session flow, revocable hashed credentials,
durable rate limiting and access-control tests before production approval.
