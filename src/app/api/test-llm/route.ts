import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const results: any = {}
  
  // Test Groq
  try {
    const groqKey = process.env.GROQ_API_KEY
    results.groqKey = groqKey ? groqKey.slice(0,10) + '...' : 'NOT SET'
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'Say hi' }] }),
    })
    results.groqStatus = resp.status
    results.groqResp = (await resp.text()).slice(0, 200)
  } catch(e: any) { results.groqError = e.message }
  
  // Test Gemini
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    results.geminiKey = geminiKey ? geminiKey.slice(0,10) + '...' : 'NOT SET'
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hi' }] }] }),
    })
    results.geminiStatus = resp.status
    results.geminiResp = (await resp.text()).slice(0, 200)
  } catch(e: any) { results.geminiError = e.message }

  // Test OpenRouter
  try {
    const orKey = process.env.OPENROUTER_API_KEY
    results.orKey = orKey ? orKey.slice(0,10) + '...' : 'NOT SET'
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'meta-llama/llama-3.1-8b-instruct:free', messages: [{ role: 'user', content: 'Say hi' }] }),
    })
    results.orStatus = resp.status
    results.orResp = (await resp.text()).slice(0, 200)
  } catch(e: any) { results.orError = e.message }

  return NextResponse.json(results)
}
