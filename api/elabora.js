export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, inviaEmail, emailDest, emailOggetto, emailTesto } = req.body;

    // Modalità invio email
    if (inviaEmail) {
      if (!emailDest || !emailOggetto || !emailTesto) {
        return res.status(400).json({ error: 'Dati email mancanti' });
      }

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Pistolesi Ortofrutta <onboarding@resend.dev>',
          to: [emailDest],
          subject: emailOggetto,
          text: emailTesto
        })
      });

      if (!resendRes.ok) {
        const err = await resendRes.json();
        return res.status(resendRes.status).json({ error: err.message || 'Errore invio email' });
      }

      return res.status(200).json({ success: true });
    }

    // Modalità elaborazione ordine con Claude
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt mancante' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Errore API' });
    }

    const data = await response.json();
    const testo = data.content[0].text;

    return res.status(200).json({ testo });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
