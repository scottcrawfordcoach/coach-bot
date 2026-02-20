# Coach Bot — ICF-Aligned Coaching Assistant

An AI coaching assistant that follows ICF (International Coaching Federation) PCC-level guidelines. The bot acts as a thinking partner — it asks open-ended questions, mirrors the client's language, and never gives advice.

## Architecture

```
┌──────────────┐        ┌───────────────────────┐        ┌──────────────┐
│  HTML Front   │──POST──▶  Supabase Edge Fn     │──read──▶  coach-specs  │
│  End (Chat)   │◀─JSON──│  (coach-bot)          │        │  bucket      │
└──────────────┘        │                       │        │  behavior.json│
                        │  ┌─────────────────┐  │        └──────────────┘
                        │  │  OpenAI API      │  │
                        │  │  (gpt-4o-mini)   │  │
                        │  └─────────────────┘  │
                        └───────────────────────┘
```

**All coaching behavior is driven by `behavior.json`** — the edge function is a thin pass-through that builds a system prompt from the policy file and extracts the `assistant_message` from the structured AI response.

## Quick Start

### 1. Install helper script dependencies

```bash
npm install
```

### 2. Configure environment

The `.env` file in the project root should contain:

```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 3. Upload behavior.json to Supabase Storage

```bash
npm run upload-behavior
```

This uploads `behavior.json` to the `coach-specs` storage bucket (must already exist in your Supabase project).

### 4. Deploy the Edge Function

```bash
npm run deploy
```

Or manually:

```bash
supabase functions deploy coach-bot --project-ref <your-project-ref>
```

Set the required secrets on the function:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available inside edge functions.)

### 5. Add the frontend to your website

Copy the contents of `frontend/coaching_assistant.html` into a Custom HTML block on your website. Update the `COACH_FUNCTION_URL` variable at the top of the `<script>` section to match your deployed function URL.

## Key Files

| File | Purpose |
|---|---|
| `behavior.json` | ICF coaching policy — state machine, protocols, question rules, non-negotiables |
| `supabase/functions/coach-bot/index.ts` | Deno edge function — loads policy, calls LLM, returns assistant_message |
| `frontend/coaching_assistant.html` | Drop-in HTML/CSS/JS chat UI — AI agnostic |
| `scripts/upload_behavior.js` | Node script to upload behavior.json to Supabase storage |

## Editing Coaching Behavior

All coaching logic lives in `behavior.json`. To change how the bot behaves:

1. Edit `behavior.json`
2. Run `npm run upload-behavior`
3. The edge function will pick up the new policy on the next request (no redeploy needed)

## Design Decisions

- **AI agnostic UI** — The frontend knows nothing about which AI provider is used. It sends messages and receives plain text replies.
- **Policy-driven** — The edge function is deliberately thin. All coaching logic, session structure, and guardrails live in `behavior.json`, making behavior changes a JSON edit + upload rather than a code change + deploy.
- **Structured output** — The LLM returns JSON with internal tracking fields (`next_state`, `moves_used`, `session_goal`) and a client-visible `assistant_message`. Only the message is forwarded to the UI.
- **Single-session** — Each conversation is treated as self-contained per ICF clean-session principles. History is stored in the browser's localStorage.
