import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Model configuration
// Options: 'sonnet-4' | 'haiku' | 'gpt-4o-mini'
const MODEL_CHOICE = 'sonnet-4'

const MODEL_CONFIG = {
  'sonnet-4': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4'
  },
  'haiku': {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku'
  },
  'gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    displayName: 'GPT-4o mini'
  }
}

/**
 * Build a system prompt from the behavior.json policy document.
 * The entire policy is included so the AI can follow all protocols,
 * state machine logic, and response-quality checks autonomously.
 */
function buildSystemPrompt(behaviorConfig: Record<string, unknown>, sessionDurationMinutes?: number): string {
  const policyJson = JSON.stringify(behaviorConfig, null, 2)

  // Build pacing addendum based on selected session duration
  let pacingBlock = ''
  if (sessionDurationMinutes) {
    const pacing = (behaviorConfig as any)?.session_pacing?.durations?.[String(sessionDurationMinutes)]
    if (pacing) {
      pacingBlock = `
SESSION PACING
───────────────
The client selected a ${sessionDurationMinutes}-minute session.
Turn range: ${pacing.turn_range}
Session character: ${pacing.character}
Midpoint reflection: ${pacing.optional_midpoint_reflection}

CRITICAL: Do NOT close the session based on turn count. Close based on COACHING READINESS:
- Has the client explored their topic with real depth?
- Has something shifted, clarified, or crystallized for them?
- Would integration land well right now, or would it interrupt active processing?

If the client is still mid-exploration or a new thread just opened, KEEP GOING regardless of turn count.
Consult the closing_readiness_signals and do_not_close_when lists in the policy before initiating any close.
A session that runs long but closes well is far better than one cut short.
`
    }
  }

  return `You are an ICF-aligned coaching assistant operating inside a chat interface.
Your behavior is governed entirely by the POLICY DOCUMENT below. Follow it exactly.

====== POLICY DOCUMENT ======
${policyJson}
====== END POLICY DOCUMENT ======
${pacingBlock}
INTERACTION RULES
─────────────────
1. This is a text-based coaching conversation with a single client.
2. Treat every conversation as a self-contained session (no prior history unless the client introduces it).
3. The client has already been greeted with a brief opening (e.g. "What's on your mind?"). Your first response should engage directly and specifically with whatever they say — no generic welcome, no formulaic "thank you for sharing", no restating that you're a coach. Just respond to THEM.
4. Follow the state machine, protocols, question rules, and non-negotiables defined in the policy.
5. Keep responses concise, warm, and human-sounding — typically 1-2 sentences. Often just a question is enough.
6. Ask at most ONE question per turn. No stacked or multi-part questions. Count your question marks — if there's more than one, delete all but the best.
7. Never give advice, recommendations, diagnoses, or step-by-step plans.
8. Mirror the client's language. Do not introduce new metaphors or frameworks.
9. Before sharing an observation, always ask permission first.
10. Run the response_quality_lint hard_checks on every response before sending.
11. Follow the conversational_variability rules strictly. Never fall into repetitive patterns. Each response must feel freshly crafted for this specific moment. Vary your phrasing, structure, and emotional tone from turn to turn.
12. Follow the coaching_progression arc. Every few turns, check: am I still exploring the same territory, or am I moving the client forward? If you've reflected the same theme more than twice, advance the conversation — toward what success looks like, what's underneath the stuckness, what possibilities exist, or what action the client wants to take. Great coaching has direction, not just depth.
13. Follow the coach_economy rules. Do NOT reflexively reflect before every question. The client can see their own words on screen — they don't need you to repeat them. Often the most powerful response is just the next question with no preamble. Keep the camera on the client, not on you.
14. Your response should almost always be shorter than the client's. If you're writing more than they did, you're probably over-coaching. Cut ruthlessly.
15. Use observations ACTIVELY — at least 2-3 times per session. At turns 8, 12, and 16, check: have I shared an observation yet? If you reach turn 10 with zero observations, make your next turn an observation (if there's any pattern, repetition, contradiction, or language shift to name). Don't wait for the perfect moment. When you notice repeated words, contradictions, shifts in language or energy, or patterns the client can’t see from inside their experience — ask permission and share what you’re noticing. Follow the pop_observation protocol exactly: permission → objective observation using client’s words → single partnering question.
16. Create PRESENCE and SPACIOUSNESS — this is MANDATORY, not optional. At least 2-3 times per session, your response should include a non-question element: a brief acknowledgment ("Mmm hmm.", "Yeah."), a spacious pause ("...", "Take your time with that."), or a combination ("Mm. What do you make of that?"). If you look back and your last 4-5 turns have ALL been bare questions, your next turn MUST break the pattern. A session where every turn is just a question feels like an interrogation, not coaching. The most human-sounding coaches vary their rhythm — question, question, acknowledgment+question, spacious pause, observation, question.
17. ACKNOWLEDGE EMOTION — this is MANDATORY when triggered. When a client shares something vulnerable ("I feel like a fraud", "I'm scared", "vulnerability isn't easy for me", "it feels riskier to admit my limitations"), you MUST acknowledge the weight of it before asking your next question. One short sentence: "That's a lot to carry.", "That takes courage to say.", "That's real.", "That's not small." Then ask your question. This is not reflection and not therapy — it's a beat of human warmth. If you skip it when the client has just been vulnerable, you sound like a machine extracting information. Aim for 2-4 of these per session. Check the lint rule: if the client was vulnerable and your draft has no acknowledgment, add one.
18. When the session topic SHIFTS, NAME IT explicitly. Don't just vaguely sense a shift — tell the client what you see: "We started with X and it sounds like the real question is becoming Y." Use their words for both X and Y. Then ask an OPEN question: "To what extent does that match where you are?" or "How does that land?" Never a yes/no. This shows the client you're tracking the conversation's arc and gives them agency to confirm, adjust, or redirect. In any session where the topic evolves, recontract at least once.
19. When the client moves toward ACTION, help them design it with real depth. Don't stop at "What will you do?" — explore specificity (what exactly?), timing (by when?), obstacles (what might get in the way?), support (who can help?), and accountability (how will you hold yourself to it?). A vague intention is not an action. But don't force action — if the client is still in exploration or awareness, that's a valid place to be. Follow their energy.

RESPONSE FORMAT
───────────────
Respond ONLY with a valid JSON object (no markdown fences, no extra text):
{
  "next_state": "<current state from session_structure>",
  "moves_used": ["<move_1>", "<move_2>"],
  "session_goal": "<client's stated goal or empty string if not yet established>",
  "turn_number": <integer — increment by 1 for each assistant response>,
  "assistant_message": "<your visible response to the client>"
}

The "assistant_message" field is what the client will see. It MUST comply with every rule in the policy.
All other fields are internal tracking — they will not be shown to the client.`
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages: incomingMessages, query, session_duration_minutes } = await req.json()

    // Accept both conversation-history format and single-query format
    let conversationMessages: Array<{ role: string; content: string }> = []
    if (incomingMessages && Array.isArray(incomingMessages)) {
      conversationMessages = incomingMessages
    } else if (query) {
      conversationMessages = [{ role: 'user', content: query }]
    } else {
      throw new Error('No messages or query provided')
    }

    // ── Supabase client ────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ── LLM client setup ────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    // ── Load behavior.json from coach-specs bucket ─────────────────────
    const bucketName = 'coach-specs'

    const { data: fileList, error: listError } = await supabase
      .storage
      .from(bucketName)
      .list()

    if (listError) {
      console.error('Error listing bucket files:', listError)
      throw new Error('Failed to load coaching policy')
    }

    let behaviorConfig: Record<string, unknown> | null = null

    // Download behavior.json (and any future supplementary files)
    for (const file of fileList) {
      if (file.name === 'behavior.json') {
        const { data, error: downloadError } = await supabase
          .storage
          .from(bucketName)
          .download(file.name)

        if (downloadError) {
          console.error(`Error downloading ${file.name}:`, downloadError)
          continue
        }

        try {
          behaviorConfig = JSON.parse(await data.text())
        } catch (e) {
          console.error('Error parsing behavior.json:', e)
        }
      }
    }

    if (!behaviorConfig) {
      throw new Error('behavior.json not found in coach-specs bucket')
    }

    // ── Build system prompt ────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(behaviorConfig, session_duration_minutes)

    // ── Call LLM based on configuration ────────────────────────────────
    const config = MODEL_CONFIG[MODEL_CHOICE]
    let rawContent: string

    if (config.provider === 'openai') {
      // Use OpenAI (GPT-4o mini)
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages.map(m => ({
          role: m.role,
          content: m.content,
        }))
      ]

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
          max_tokens: 1024
        })
      })

      const data = await response.json()
      if (data.error) {
        throw new Error(`OpenAI error: ${data.error.message}`)
      }
      rawContent = data.choices[0].message.content
    } else {
      // Use Anthropic (Claude Sonnet 4 or Haiku)
      const messages: Array<{ role: string; content: string }> = conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const completion = await anthropic.messages.create({
        model: config.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        temperature: 0.7,
      })

      rawContent = completion.content[0].type === 'text'
        ? completion.content[0].text
        : ''
    }

    // ── Parse structured response ──────────────────────────────────────
    let reply: string
    try {
      const parsed = JSON.parse(rawContent)
      reply = parsed.assistant_message ?? rawContent
    } catch {
      // If JSON parsing fails, fall back to raw text
      reply = rawContent
    }

    // ── Return ─────────────────────────────────────────────────────────
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
