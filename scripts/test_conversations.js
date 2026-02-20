/**
 * test_conversations.js
 *
 * Automated coaching conversation tester.
 * GPT-4o plays a simulated client; the live Supabase edge function
 * (Claude Sonnet + behavior.json) responds as the coach.
 *
 * Usage:
 *   node scripts/test_conversations.js          → lists available scenarios
 *   node scripts/test_conversations.js 1         → runs scenario 1
 *   node scripts/test_conversations.js 1 2 3     → runs scenarios 1, 2, 3
 *
 * Each completed conversation is saved as a Markdown transcript in
 * scripts/transcripts/  for use as training material.
 *
 * Requires: OPENAI_API_KEY in .env
 */

// Load .env manually (no dotenv dependency needed)
const fs = require('fs')
const path = require('path')
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
    }
  }
}

const http = require('http')

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const COACH_FUNCTION_URL = 'https://yxndmpwqvdatkujcukdv.supabase.co/functions/v1/coach-bot'

// ── Live HTML viewer ────────────────────────────────────────────────────────

let liveHtml = ''
let liveServer = null
const LIVE_PORT = 3391

function buildLiveHtml(scenario, messages, status) {
  const statusLabel = status === 'running'
    ? '<span style="color:#4ade80">● Live</span>'
    : '<span style="color:#94a3b8">● Complete</span>'

  let bubbles = ''
  for (const m of messages) {
    if (m.role === 'coach') {
      bubbles += `<div class="bubble coach"><div class="label">Coach</div>${escHtml(m.content)}</div>\n`
    } else {
      bubbles += `<div class="bubble client"><div class="label">Client</div>${escHtml(m.content)}</div>\n`
    }
  }

  if (status === 'running') {
    bubbles += `<div class="typing"><span></span><span></span><span></span></div>\n`
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Live Coaching — ${escHtml(scenario.name)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; background:#0f172a; color:#e2e8f0; }
  .header { position:fixed; top:0; left:0; right:0; background:#1e293b; border-bottom:1px solid #334155; padding:16px 24px; z-index:10; display:flex; justify-content:space-between; align-items:center; }
  .header h1 { font-size:16px; font-weight:600; }
  .header .meta { font-size:13px; color:#94a3b8; }
  .chat { padding:80px 24px 40px; max-width:720px; margin:0 auto; }
  .bubble { padding:12px 16px; border-radius:12px; margin-bottom:12px; max-width:85%; line-height:1.55; font-size:15px; white-space:pre-wrap; }
  .bubble .label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
  .coach { background:#1e3a5f; margin-right:auto; border-bottom-left-radius:4px; }
  .coach .label { color:#60a5fa; }
  .client { background:#2d1b4e; margin-left:auto; border-bottom-right-radius:4px; }
  .client .label { color:#c084fc; }
  .typing { display:flex; gap:4px; padding:12px 16px; margin-right:auto; }
  .typing span { width:8px; height:8px; background:#60a5fa; border-radius:50%; animation:bounce 1.4s infinite; }
  .typing span:nth-child(2) { animation-delay:0.2s; }
  .typing span:nth-child(3) { animation-delay:0.4s; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
  .end-marker { text-align:center; color:#64748b; font-size:13px; margin-top:24px; padding:12px; border-top:1px solid #334155; }
</style>
</head><body>
<div class="header">
  <h1>${escHtml(scenario.name)} &mdash; ${scenario.duration} min</h1>
  <div class="meta">${statusLabel}</div>
</div>
<div class="chat" id="chat">
${bubbles}
${status !== 'running' ? '<div class="end-marker">Session complete</div>' : ''}
</div>
<script>
  const chat = document.getElementById('chat');
  chat.scrollTop = chat.scrollHeight;
  ${status === 'running' ? 'setTimeout(() => location.reload(), 1500);' : ''}
</script>
</body></html>`
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function startLiveServer() {
  return new Promise((resolve) => {
    liveServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(liveHtml || '<html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:40px"><h2>Waiting for scenario to start...</h2></body></html>')
    })
    liveServer.listen(LIVE_PORT, () => {
      console.log(`  \x1b[36m▶ Live viewer: http://localhost:${LIVE_PORT}\x1b[0m`)
      resolve()
    })
  })
}

function stopLiveServer() {
  if (liveServer) liveServer.close()
}

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env')
  process.exit(1)
}

// ── Simulated client scenarios ──────────────────────────────────────────────

const CLIENT_SCENARIOS = [
  {
    name: 'Career crossroads',
    duration: 60,
    persona: `You are a 35-year-old marketing manager named Jordan. You've been offered a promotion to VP but it means relocating to another city. Your partner has a great job here and your kids are settled in school. You're torn. You tend to talk about the logistics first but the real issue is that you feel guilty no matter which choice you make. You're conversational, a bit anxious, and tend to use phrases like "I just don't know" and "it's like being pulled in two directions." Keep your responses realistic — 1-3 sentences, casual, the way a real person texts. Don't over-explain. Sometimes be brief. Sometimes trail off. You're a real person, not a writing exercise.`,
    opening: "I got offered a big promotion but I'd have to move cities and I'm not sure it's worth it"
  },
  {
    name: 'Gym inclusion (coach-as-client)',
    duration: 15,
    persona: `You are a gym owner / personal trainer named Alex. One of your long-term clients told you they don't feel included in the training group. The others talk about social events and it triggers your client. Nobody is being mean — your client just feels left out. You want to support them but you're not sure if this is a coaching issue or something deeper. You're practical and direct. Keep responses short — 1-2 sentences. You sometimes second-guess yourself. You use phrases like "I mean" and "the thing is."`,
    opening: "I have a client who says they don't feel included in my gym's training group. They hear others talking about social stuff and it triggers them. Nobody's being mean though."
  },
  {
    name: 'Procrastination and self-worth',
    duration: 30,
    persona: `You are a 28-year-old freelance designer named Sam. You keep procrastinating on a big project for an important client. You know you're capable but something stops you every time you sit down to work. Deep down you're afraid that if you really try and it's not good enough, it proves something about you. But you don't say that right away — you start by talking about "just not being able to focus." You're reflective when prompted but tend to stay surface-level unless the coach helps you go deeper. Keep responses natural — 1-3 sentences, sometimes just a few words.`,
    opening: "I keep putting off this big design project and I can't figure out why. I know I need to do it but I just... don't."
  },
  {
    name: 'Leadership identity shift',
    duration: 60,
    persona: `You are a 42-year-old software engineer named Priya who was recently promoted to engineering director. You were great as an individual contributor but now you manage 15 people and you feel like a fraud. You miss coding. You're not sure you want this. You're articulate and thoughtful but struggle with vulnerability. You intellectualize things. When the coach asks how you feel, you tend to answer with what you think first. Keep responses 2-4 sentences. You're not dramatic — more quietly conflicted.`,
    opening: "I got promoted to engineering director three months ago and honestly I'm not sure I'm cut out for it. I keep wanting to jump back into the code instead of leading."
  }
]

// ── GPT-5.2 simulated client ───────────────────────────────────────────────

async function getClientResponse(persona, conversationHistory, coachMessage) {
  const messages = [
    {
      role: 'system',
      content: `You are playing a coaching CLIENT in a realistic simulation. Stay in character completely.

${persona}

RULES:
- Respond ONLY as the client. Never break character.
- Keep your responses natural and realistic in length.
- Respond to what the coach actually said. Don't script ahead.
- If the coach asks a question, answer it honestly from your character's perspective.
- Sometimes be brief ("yeah, exactly" or "hmm, I hadn't thought of that"). 
- Sometimes open up more. Just be a real person.
- Do NOT act like an AI. No perfect answers. Be messy, human, uncertain.
- Do NOT try to close or wrap up the session yourself. That's the coach's job. Keep engaging until the coach initiates the close.
- If the coach begins wrapping up (asking what you're taking away, what stands out, etc.), respond genuinely and naturally — reflect on what shifted or what you're leaving with.
- Output ONLY your response as the client. No labels, no quotes, no stage directions.`
    }
  ]

  // Add conversation history
  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      // Client messages → assistant role (because GPT is playing the client)
      messages.push({ role: 'assistant', content: msg.content })
    } else {
      // Coach messages → user role (prompting GPT to respond as client)
      messages.push({ role: 'user', content: msg.content })
    }
  }

  // Add the latest coach message
  messages.push({ role: 'user', content: coachMessage })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.9,
      max_tokens: 200
    })
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(`OpenAI error: ${data.error.message}`)
  }
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`Invalid OpenAI response: ${JSON.stringify(data)}`)
  }
  return data.choices[0].message.content.trim()
}

// ── Call the live coaching edge function ────────────────────────────────────

async function getCoachResponse(conversationHistory, sessionDuration) {
  const response = await fetch(COACH_FUNCTION_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({
      messages: conversationHistory,
      session_duration_minutes: sessionDuration
    })
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(`Coach error: ${data.error}`)
  }
  if (!data.reply) {
    throw new Error(`No reply in response: ${JSON.stringify(data)}`)
  }
  return data.reply
}

// ── Run a single conversation ──────────────────────────────────────────────

async function runConversation(scenario, maxTurns = 50) {
  const divider = '═'.repeat(70)
  const thinDivider = '─'.repeat(70)

  console.log(`\n${divider}`)
  console.log(`  SCENARIO: ${scenario.name}`)
  console.log(`  Duration: ${scenario.duration} min`)
  console.log(divider)

  const conversationHistory = []
  const liveMessages = []
  let turnCount = 0

  // Initial greeting from coach (hardcoded like the frontend)
  const initialGreeting = "Hey. What's on your mind?"
  liveMessages.push({ role: 'coach', content: initialGreeting })
  liveHtml = buildLiveHtml(scenario, liveMessages, 'running')
  console.log(`\n  🟢 COACH [0]: ${initialGreeting}`)

  // Client's opening message
  const clientOpening = scenario.opening
  conversationHistory.push({ role: 'user', content: clientOpening })
  liveMessages.push({ role: 'client', content: clientOpening })
  liveHtml = buildLiveHtml(scenario, liveMessages, 'running')
  console.log(`\n  🔵 CLIENT [1]: ${clientOpening}`)

  // Conversation loop
  while (turnCount < maxTurns) {
    turnCount++

    // Get coach response
    let coachReply
    try {
      coachReply = await getCoachResponse(conversationHistory, scenario.duration)
      if (!coachReply || typeof coachReply !== 'string') {
        throw new Error(`Invalid coach response: ${JSON.stringify(coachReply)}`)
      }
    } catch (err) {
      console.error(`\n  ❌ Coach error at turn ${turnCount}: ${err.message}`)
      break
    }

    conversationHistory.push({ role: 'assistant', content: coachReply })
    liveMessages.push({ role: 'coach', content: coachReply })
    liveHtml = buildLiveHtml(scenario, liveMessages, 'running')
    console.log(`\n  🟢 COACH [${turnCount}]: ${coachReply}`)

    // Check if the coach is closing the session
    const closingPhrases = [
      'draw our conversation to a close',
      'before we wrap up',
      'as we close',
      'to close out',
      'wrapping up',
      'end our session',
      'acknowledge yourself',
      'as we come to the end',
      'what are you taking away',
      'what do you want to take with you',
      'what stands out most',
      'what do you want to hold onto',
      'what landed for you',
      'before we finish',
      'as we bring this to a close',
      'what will you carry forward',
      'what did it take for you'
    ]
    const isClosing = closingPhrases.some(p => coachReply.toLowerCase().includes(p))

    if (isClosing && turnCount > 3) {
      // Let the client respond to the closing
      turnCount++
      let closingResponse
      try {
        closingResponse = await getClientResponse(
          scenario.persona,
          conversationHistory,
          coachReply
        )
      } catch (err) {
        console.error(`\n  ❌ Client error: ${err.message}`)
        break
      }
      conversationHistory.push({ role: 'user', content: closingResponse })
      liveMessages.push({ role: 'client', content: closingResponse })
      liveHtml = buildLiveHtml(scenario, liveMessages, 'running')
      console.log(`\n  🔵 CLIENT [${turnCount}]: ${closingResponse}`)

      // One final coach response
      try {
        const finalCoach = await getCoachResponse(conversationHistory, scenario.duration)
        conversationHistory.push({ role: 'assistant', content: finalCoach })
        liveMessages.push({ role: 'coach', content: finalCoach })
        liveHtml = buildLiveHtml(scenario, liveMessages, 'complete')
        console.log(`\n  🟢 COACH [final]: ${finalCoach}`)
      } catch (err) {
        // Fine if this fails
      }

      break
    }

    // Get client response
    turnCount++
    let clientReply
    try {
      clientReply = await getClientResponse(
        scenario.persona,
        conversationHistory,
        coachReply
      )
    } catch (err) {
      console.error(`\n  ❌ Client error at turn ${turnCount}: ${err.message}`)
      break
    }

    conversationHistory.push({ role: 'user', content: clientReply })
    liveMessages.push({ role: 'client', content: clientReply })
    liveHtml = buildLiveHtml(scenario, liveMessages, 'running')
    console.log(`\n  🔵 CLIENT [${turnCount}]: ${clientReply}`)

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500))
  }

  liveHtml = buildLiveHtml(scenario, liveMessages, 'complete')

  console.log(`\n${thinDivider}`)
  console.log(`  Session ended after ${turnCount} exchanges`)
  console.log(`  Messages in history: ${conversationHistory.length}`)
  console.log(thinDivider)

  return conversationHistory
}

// ── Markdown export ─────────────────────────────────────────────────────────

function saveTranscript(scenario, conversationHistory) {
  const transcriptDir = path.join(__dirname, 'transcripts')
  if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true })

  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const timeStr = now.toTimeString().slice(0, 5).replace(':', '')
  const slug = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
  const fileName = `${dateStr}_${timeStr}_${slug}.md`
  const filePath = path.join(transcriptDir, fileName)

  const turns = conversationHistory.length
  const coachTurns = conversationHistory.filter(m => m.role === 'assistant').length
  const clientTurns = conversationHistory.filter(m => m.role === 'user').length

  let md = `# Coaching Transcript: ${scenario.name}\n\n`
  md += `| Field | Value |\n`
  md += `|-------|-------|\n`
  md += `| **Date** | ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} |\n`
  md += `| **Duration setting** | ${scenario.duration} min |\n`
  md += `| **Coach model** | Claude 3 Haiku (claude-3-haiku-20240307) |\n`
  md += `| **Client model** | GPT-4o (simulated) |\n`
  md += `| **Total exchanges** | ${turns} (${coachTurns} coach, ${clientTurns} client) |\n`
  md += `| **Persona** | ${scenario.name} |\n\n`

  md += `## Client persona\n\n`
  md += `> ${scenario.persona}\n\n`

  md += `---\n\n`
  md += `## Conversation\n\n`

  // Opening greeting (not in history)
  md += `**Coach:** Hey. What's on your mind?\n\n`

  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      md += `**Client:** ${msg.content}\n\n`
    } else {
      md += `**Coach:** ${msg.content}\n\n`
    }
  }

  md += `---\n\n`
  md += `## Notes\n\n`
  md += `_Add coaching observations, quality notes, or ICF competency flags here._\n`

  fs.writeFileSync(filePath, md, 'utf8')
  return { fileName, filePath }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).map(Number).filter(n => !isNaN(n))

  // No arguments → list scenarios
  if (args.length === 0) {
    console.log('\n🧪 COACHING ASSISTANT - CONVERSATION TESTER\n')
    console.log('  Available scenarios:\n')
    CLIENT_SCENARIOS.forEach((s, i) => {
      console.log(`    ${i + 1}. ${s.name}  (${s.duration} min)`)
    })
    console.log('\n  Usage:  node scripts/test_conversations.js <number>')
    console.log('  Example: node scripts/test_conversations.js 1')
    console.log('  Multiple: node scripts/test_conversations.js 1 3\n')
    return
  }

  // Validate indices
  for (const idx of args) {
    if (idx < 1 || idx > CLIENT_SCENARIOS.length) {
      console.error(`❌ Scenario ${idx} doesn't exist. Valid: 1-${CLIENT_SCENARIOS.length}`)
      process.exit(1)
    }
  }

  console.log('\n🧪 COACHING ASSISTANT - CONVERSATION TESTER')
  console.log('   Coach: Claude Sonnet (live edge function)')
  console.log('   Client: GPT-4o (simulated personas)')
  console.log(`   Running: ${args.length} scenario(s)\n`)

  await startLiveServer()

  for (const idx of args) {
    const scenario = CLIENT_SCENARIOS[idx - 1]

    try {
      const history = await runConversation(scenario)
      const { fileName } = saveTranscript(scenario, history)
      console.log(`\n  📄 Transcript saved → scripts/transcripts/${fileName}`)
    } catch (err) {
      console.error(`\n❌ Scenario "${scenario.name}" failed: ${err.message}`)
    }

    // Pause between scenarios if running multiple
    if (args.length > 1) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  stopLiveServer()
  console.log('\n✅ Done.\n')
}

main().catch(console.error)
