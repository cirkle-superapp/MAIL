# Cirkle Mail

> A fast, distraction-free email client — mails only — with a premium gold + teal design system and an animated three-ring logo. Built on the [CIRKLE-SUPERAPP](https://github.com/cirkle-superapp/CIRKLE) brand.

Cirkle Mail brings the Cirkle design system (sand-gold → rose → deep-teal gradient, Fraunces serif display, aurora backgrounds, glass morphism) to a Gmail-like mail experience.

![Cirkle Mail](public/logo.svg)

## Features

- **Three-column layout** — collapsible sidebar, message list, reading pane. Responsive: mobile uses an overlay Sheet drawer.
- **Animated brand logo** — three overlapping rings stroked with a gold→rose→teal gradient, rotating 360° over 30s on an infinite linear loop.
- **Rich text compose** — contentEditable editor with Bold / Italic / Underline / Bullet list / Numbered list / Quote / Insert link / Clear formatting. `Cmd/Ctrl+Enter` sends.
- **Undo send** — 5-second cancelable window with a toast action button (Gmail-style).
- **Snooze** — snooze any message (Later today / Tomorrow / Next week / This weekend). Snoozed emails leave the Inbox and live in the **Snoozed** folder until they come back. Bulk + per-message.
- **Forward & reply** — proper `Fwd:` / `Re:` threading with quoted originals; reply preserves CC.
- **Real drafts** — save a draft (no recipient required) to the Drafts folder.
- **Recipient autocomplete** — combobox of known contacts sourced from your correspondence history.
- **Auto mark-as-read** — opening an unread conversation marks it read.
- **Folders** — Inbox, Starred, Snoozed, Important, Sent, Drafts, All Mail, Spam, Trash — with live unread/count badges.
- **Labels** — colored, collapsible, with per-label counts and a "create label" dialog.
- **Bulk actions** — archive, snooze, mark read/unread, delete (forever in Trash).
- **Thread view** — collapse older messages in a conversation.
- **Search** — debounced full-text search across subject, sender, recipient, body, snippet.
- **Keyboard shortcuts** — `j`/`k` move, `e` archive, `#` trash, `s` star, `c` compose, `/` search, `Esc` close.
- **Light / Dark / System theme** — primary is deep teal in light, gold in dark.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (New York) + Lucide icons
- **Prisma ORM** (SQLite) — `Email` and `Label` models
- **TanStack Query** for server state, **Zustand** for client state
- **next-themes** for light/dark/system
- **Fraunces** (display) + **Geist** (sans/mono) via `next/font`

## Getting started

```bash
# 1. Install
bun install

# 2. Configure the database
cp .env.example .env      # DATABASE_URL="file:./db/custom.db"

# 3. Create/migrate the schema
bun run db:push

# 4. Seed sample data (Cirkle-branded inbox, sent, drafts, spam, trash)
curl -X POST http://localhost:3000/api/emails \
  -H "Content-Type: application/json" -d '{"action":"seed"}'
#    or just open the app — see below

# 5. Run
bun run dev
```

Open `http://localhost:3000`. The seeded database (`db/custom.db`) is committed, so the app runs immediately with sample data. Re-seed anytime with the curl command above.

## Project structure

```
prisma/schema.prisma              Email + Label models (threadId, snoozedUntil, …)
src/app/page.tsx                  Renders <MailApp /> under ReactQueryProvider
src/app/layout.tsx                Fraunces font + CirkleBrandDefs + ThemeProvider
src/app/globals.css               Cirkle design system (palette, aurora, glass, logo rotation)
src/app/api/emails/route.ts       GET (filter by folder/label/starred/snoozed/search), POST (compose/draft), PATCH (bulk)
src/app/api/emails/[id]/route.ts  GET (thread), PATCH (single), DELETE (forever), PUT (reply)
src/app/api/emails/stats/route.ts folder/label/snoozed counts
src/app/api/labels/               CRUD for labels
src/app/api/contacts/             distinct senders/recipients for autocomplete
src/components/brand/             Animated Cirkle logo + brand defs
src/components/mail/               top-bar, sidebar, email-list/row, email-detail, compose-dialog, rich-text-editor, recipient-input, snooze-menu, star-button, theme-toggle, mail-app
src/hooks/                        use-mail (React Query), use-keyboard-shortcuts, use-mobile, use-toast
src/store/mail-store.ts          Zustand store (folder, label, search, selection, compose)
src/lib/                          types, email-utils (dates, snippet, snooze presets), seed-data
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Move to the next message |
| `k` / `↑` | Move to the previous message |
| `e` | Archive the selected message |
| `#` | Move the selected message to Trash |
| `s` | Toggle star |
| `c` | Compose a new message |
| `/` | Focus the search bar |
| `Esc` | Close compose / go back to list |
| `Cmd/Ctrl+Enter` | Send the composed message |

## Design tokens

| Token | Light | Dark |
|-------|-------|------|
| `--gold` | `hsl(39 45% 57%)` | `hsl(39 45% 57%)` |
| `--teal` | `hsl(195 56% 23%)` | `hsl(195 56% 23%)` |
| `--rose` | `hsl(351 41% 56%)` | `hsl(351 41% 56%)` |
| `--primary` | deep teal | gold |
| `--accent` | rose | rose |
| `--background` | cream | charcoal |

## License

MIT
