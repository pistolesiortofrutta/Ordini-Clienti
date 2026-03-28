module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    if (!prompt) return res.status(400).json({ error: 'Prompt mancante' });

    // 1. Verifica variabili Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: `Variabili mancanti: URL=${!!supabaseUrl} KEY=${!!supabaseKey}` });
    }

    // 2. Leggi categorie
    const catRes = await fetch(`${supabaseUrl}/rest/v1/categorie?attiva=eq.true&order=ordine.asc&select=id,nome,icona`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });

    if (!catRes.ok) {
      const catErr = await catRes.text();
      return res.status(500).json({ error: `Errore categorie Supabase: ${catErr}` });
    }

    const categorie = await catRes.json();

    // 3. Leggi prodotti
    const prodRes = await fetch(`${supabaseUrl}/rest/v1/prodotti?attivo=eq.true&order=nome.asc&select=nome,categoria_id`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });

    if (!prodRes.ok) {
      const prodErr = await prodRes.text();
      return res.status(500).json({ error: `Errore prodotti Supabase: ${prodErr}` });
    }

    const prodotti = await prodRes.json();

    // 4. Costruisci catalogo
    let catalogo = '';
    for (const cat of categorie) {
      const emoji = cat.icona || '📦';
      const prodottiCat = prodotti
        .filter(p => p.categoria_id === cat.id)
        .map(p => `  - ${p.nome}`)
        .join('\n');
      catalogo += `${emoji} ${cat.nome.toUpperCase()}\n${prodottiCat}\n\n`;
    }

    // 5. Prompt completo
    const promptCompleto = `${prompt}

CATALOGO PRODOTTI PISTOLESI ORTOFRUTTA (usa questi nomi e categorie esatti):
${catalogo}

Regole aggiuntive sul catalogo:
- Usa SEMPRE i nomi dei prodotti esatti come appaiono nel catalogo
- Se un prodotto nel messaggio non è nel catalogo, abbinalo al prodotto più simile del catalogo
- Se proprio non trovi un abbinamento, mettilo in EXTRA con il nome corretto
- Usa SEMPRE le categorie esatte del catalogo, nell'ordine in cui appaiono`;

    // 6. Chiama Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: promptCompleto }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Errore API Claude' });
    }

    const data = await response.json();
    return res.status(200).json({ testo: data.content[0].text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
