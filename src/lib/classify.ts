export interface Classification {
  tipo: 'venda' | 'suporte' | 'reclamacao' | 'outro'
  tom: 'positivo' | 'neutro' | 'negativo'
  pontos: string[]
  proximosPasso: string
}

import { getSetting } from './settings'

export async function classifyConversation(messages: { direction: string; body: string; timestamp: Date }[]): Promise<Classification | null> {
  const apiKey = await getSetting('CLAUDE_API_KEY')
  if (!apiKey) return null
  if (messages.length < 2) return null

  const transcript = messages
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map(m => `[${m.direction === 'outbound' ? 'Agente' : 'Contato'}] ${m.body}`)
    .join('\n')

  const prompt = `Analise essa conversa WhatsApp entre agente e contato. Retorne APENAS um JSON valido sem markdown:
{
  "tipo": "venda|suporte|reclamacao|outro",
  "tom": "positivo|neutro|negativo",
  "pontos": ["ponto 1","ponto 2"],
  "proximosPasso": "proxima acao sugerida"
}

Conversa:
${transcript}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error('Claude API error:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    return JSON.parse(jsonMatch[0]) as Classification
  } catch (err) {
    console.error('Classification error:', err)
    return null
  }
}
