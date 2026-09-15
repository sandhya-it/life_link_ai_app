import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Port must be 3000 according to system guidelines
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Lazy load the Gemini client to avoid crashes on startup
  let aiClient: GoogleGenAI | null = null;
  function getAiClient() {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '') {
        try {
          aiClient = new GoogleGenAI({
            apiKey: apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });
          console.log('Gemini API client initialized successfully.');
        } catch (err) {
          console.error('Error initializing Gemini client:', err);
          aiClient = null;
        }
      } else {
        console.warn('GEMINI_API_KEY environment variable is not defined or is placeholder. Falling back to offline first-aid assistant.');
      }
    }
    return aiClient;
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // High-fidelity Multi-lingual Text-to-Speech Endpoint (Tamil, Hindi, English)
  app.all('/api/tts', async (req, res) => {
    try {
      const text = (req.method === 'POST' ? req.body?.text : req.query?.text) as string || '';
      const lang = (req.method === 'POST' ? req.body?.language : req.query?.lang) as string || 'en';

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis' });
        return;
      }

      const targetLang = lang === 'ta' ? 'ta' : lang === 'hi' ? 'hi' : 'en';

      // Clean text: remove markdown asterisks, hashes, urls, bullet characters
      const cleanText = text
        .replace(/[*#_`~>]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[-•]\s*/g, '. ')
        .replace(/\n+/g, '. ')
        .replace(/\s+/g, ' ')
        .trim();

      // Split into phrases/sentences (up to ~160 chars) so Google TTS delivers natural prosody
      const chunks: string[] = [];
      const sentences = cleanText.split(/([.!?,;\n।])/);
      let currentChunk = '';

      for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        if (!part) continue;
        if ((currentChunk + part).length > 160) {
          if (currentChunk.trim()) chunks.push(currentChunk.trim());
          currentChunk = part;
        } else {
          currentChunk += part;
        }
      }
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }

      // Limit max chunks to 10 to keep synthesis response snappy and lightweight
      const finalChunks = chunks.slice(0, 10);

      // Fetch native audio chunks and concatenate into single MP3 stream
      const audioBuffers: Buffer[] = [];
      for (const chunk of finalChunks) {
        if (!chunk.trim()) continue;
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${targetLang}&client=tw-ob&q=${encodeURIComponent(chunk.trim())}`;
        const ttsRes = await fetch(ttsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://translate.google.com/'
          }
        });
        if (ttsRes.ok) {
          const ab = await ttsRes.arrayBuffer();
          audioBuffers.push(Buffer.from(ab));
        }
      }

      if (audioBuffers.length === 0) {
        res.status(502).json({ error: 'Failed to generate speech audio' });
        return;
      }

      const combinedAudio = Buffer.concat(audioBuffers);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', combinedAudio.length.toString());
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(combinedAudio);

    } catch (err: any) {
      console.error('TTS endpoint error:', err);
      res.status(500).json({ error: 'TTS processing failed' });
    }
  });

  // AI First-Aid streaming endpoint
  app.post('/ai/first-aid', async (req, res) => {
    const { message, language } = req.body;
    
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const langName = language === 'ta' ? 'Tamil' : language === 'hi' ? 'Hindi' : 'English';
    
    // Set headers for SSE/Streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const client = getAiClient();

    if (client) {
      try {
        const systemInstruction = `You are LifeLink AI's Emergency First Aid Assistant. 
Your goal is to provide calm, clear, highly actionable, and professional step-by-step first-aid and medical guidance.
CRITICAL: You MUST write your entire response exclusively in the ${langName} language. Use script characters appropriate for ${langName}.
Keep response focused, scannable with bullet points, and highly professional.
Always start with a brief 1-sentence reassurance, then provide steps.
At the very end of your advice, always append this warning block in ${langName}: 'Disclaimer: This is AI first-aid advice. For life-threatening emergencies, tap the SOS button on your screen immediately to dispatch emergency professionals.'`;

        const stream = await client.models.generateContentStream({
          model: 'gemini-3.5-flash',
          contents: message,
          config: {
            systemInstruction,
            temperature: 0.3,
          }
        });

        for await (const chunk of stream) {
          if (chunk.text) {
            res.write(chunk.text);
          }
        }
        res.end();
        return;
      } catch (err: any) {
        console.error('Error in Gemini generation:', err);
        res.write(`Error generating AI response: ${err?.message || 'Unknown server error'}. Switching to fallback advice...\n\n`);
      }
    }

    // Fallback/Demo Response Generator (Runs offline or when API key is missing)
    try {
      const lowerMsg = message.toLowerCase();
      let responseText = '';

      if (language === 'ta') {
        if (lowerMsg.includes('bleed') || lowerMsg.includes('இரத்தம்') || lowerMsg.includes('காயம்')) {
          responseText = `**இரத்தப்போக்குக்கான முதலுதவி வழிகாட்டி:**\n\n1. **நேரடி அழுத்தம் கொடுங்கள்:** காயத்தின் மீது சுத்தமான துணி அல்லது துண்டைக் கொண்டு 5-10 நிமிடங்கள் பலமாக அழுத்தவும்.\n2. **காயத்தை உயர்த்துங்கள்:** முடிந்தால், காயம்பட்ட பகுதியை இதய மட்டத்திற்கு மேல் உயர்த்தவும்.\n3. **சுத்தம் செய்யுங்கள்:** காயம் சிறியதாக இருந்தால், சுத்தமான நீரால் கழுவவும்.\n4. **அமர்ந்திருக்கச் செய்யுங்கள்:** நோயாளிக்கு மயக்கம் வராமல் தடுக்க அவரை அமர வைக்கவும்.\n\n_துறப்பு: இது AI முதலுதவி அறிவுரை மட்டுமே. உயிருக்கு ஆபத்தான அவசரநிலைகளுக்கு, உடனடியாக SOS பொத்தானை அழுத்தவும்._`;
        } else if (lowerMsg.includes('burn') || lowerMsg.includes('தீக்காயம்')) {
          responseText = `**தீக்காயங்களுக்கான முதலுதவி வழிகாட்டி:**\n\n1. **குளிர்விக்கவும்:** தீக்காயமடைந்த இடத்தில் உடனடியாக ஓடும் குளிர்ந்த நீரை 10-20 நிமிடங்கள் ஊற்றவும். பனிக்கட்டியைப் பயன்படுத்த வேண்டாம்.\n2. **மூடி வைக்கவும்:** காயம் அடைந்த பகுதியை சுத்தமான, ஒட்டாத துணியால் மெதுவாக மூடவும்.\n3. **ஆபரணங்களை அகற்றவும்:** வீக்கம் ஏற்படுவதற்குள் இறுக்கமான மோதிரங்கள், வளையல்களை அகற்றவும்.\n\n_துறப்பு: இது AI முதலுதவி அறிவுரை மட்டுமே. உயிருக்கு ஆபத்தான அவசரநிலைகளுக்கு, உடனடியாக SOS பொத்தானை அழுத்தவும்._`;
        } else {
          responseText = `வணக்கம்! நான் உங்கள் லைஃப்லிங்க் AI முதலுதவி உதவியாளர். தயவுசெய்து காயங்கள் அல்லது அவசரநிலைகள் பற்றிய உங்கள் கேள்விகளைக் கேளுங்கள். (எ.கா: இரத்தப்போக்கு, தீக்காயம், மூச்சுத்திணறல்)\n\n_துறப்பு: இது AI முதலுதவி அறிவுரை மட்டுமே. உயிருக்கு ஆபத்தான அவசரநிலைகளுக்கு, உடனடியாக SOS பொத்தானை அழுத்தவும்._`;
        }
      } else if (language === 'hi') {
        if (lowerMsg.includes('bleed') || lowerMsg.includes('खून') || lowerMsg.includes('चोट')) {
          responseText = `**रक्तस्राव (Bleeding) के लिए प्राथमिक चिकित्सा:**\n\n1. **सीधा दबाव डालें:** साफ कपड़े या पट्टी से घाव पर 5-10 मिनट तक लगातार दबाव बनाए रखें।\n2. **प्रभावित हिस्से को उठाएं:** यदि संभव हो, तो चोट वाले हिस्से को दिल के स्तर से ऊपर उठाएं।\n3. **शांत रखें:** मरीज को आराम से बिठाएं या लेटाएं।\n4. **साफ करें:** खून रुकने के बाद घाव को साफ पानी से धोएं।\n\n_अस्वीकरण: यह केवल एआई द्वारा प्रदान की गई प्राथमिक चिकित्सा सलाह है। गंभीर आपातकाल में, तुरंत एसओएस (SOS) बटन दबाएं।_`;
        } else if (lowerMsg.includes('burn') || lowerMsg.includes('जलना') || lowerMsg.includes('आग')) {
          responseText = `**जलने (Burns) के लिए प्राथमिक चिकित्सा:**\n\n1. **ठंडा करें:** जले हुए हिस्से पर तुरंत 10-15 मिनट के लिए ठंडा बहता पानी डालें। बर्फ का उपयोग न करें।\n2. **ढकें:** प्रभावित क्षेत्र को साफ, सूती पट्टी से हल्के हाथों से ढकें।\n3. **गहने निकालें:** सूजन शुरू होने से पहले टाइट अंगूठी या कड़े आदि निकाल दें।\n\n_अस्वीकरण: यह केवल एआई द्वारा प्रदान की गई प्राथमिक चिकित्सा सलाह है। गंभीर आपातकाल में, तुरंत एसओएस (SOS) बटन दबाएं।_`;
        } else {
          responseText = `नमस्ते! मैं आपका लाइफलिंक एआई प्राथमिक चिकित्सा सहायक हूं। कृपया अपनी समस्या बताएं ताकि मैं आपको चरण-दर-चरण मार्गदर्शन प्रदान कर सकूं। (जैसे: खून बहना, जलना, सांस फूलना)\n\n_अस्वीकरण: यह केवल एआई द्वारा प्रदान की गई प्राथमिक चिकित्सा सलाह है। गंभीर आपातकाल में, तुरंत एसओएस (SOS) बटन दबाएं।_`;
        }
      } else {
        // English Default
        if (lowerMsg.includes('bleed') || lowerMsg.includes('cut') || lowerMsg.includes('wound')) {
          responseText = `**Emergency Bleeding Control First-Aid:**\n\n1. **Apply Direct Pressure:** Press firmly on the wound with a clean cloth or bandage for 5-10 continuous minutes.\n2. **Elevate the Injury:** Raise the wounded body part above heart level if possible.\n3. **Keep Calm and Seat Patient:** Have the victim sit or lie down to prevent dizziness or fainting.\n4. **Clean & Protect:** Wash minor cuts with mild soap and water once bleeding stops, then dress appropriately.\n\n_Disclaimer: This is AI first-aid advice. For life-threatening emergencies, tap the SOS button on your screen immediately to dispatch emergency professionals._`;
        } else if (lowerMsg.includes('burn')) {
          responseText = `**Emergency Burn Care First-Aid:**\n\n1. **Cool the Burn:** Run cool (not cold) tap water over the burn for 10 to 20 minutes. Do NOT apply ice.\n2. **Remove Constrictions:** Gently slip off rings, belts, or tight jewelry before swelling begins.\n3. **Cover Loosely:** Wrap with clean, non-stick gauze to protect the blistered skin.\n4. **Do NOT Pop Blisters:** Popping blisters increases risk of infection.\n\n_Disclaimer: This is AI first-aid advice. For life-threatening emergencies, tap the SOS button on your screen immediately to dispatch emergency professionals._`;
        } else if (lowerMsg.includes('choke') || lowerMsg.includes('choking')) {
          responseText = `**Emergency Choking (Heimlich Maneuver) Guide:**\n\n1. **Encourage Coughing:** If the person can speak, cough, or breathe, encourage them to cough forcefully.\n2. **Give 5 Back Blows:** Stand behind them, bend them forward, and deliver 5 firm blows between their shoulder blades with the heel of your hand.\n3. **Give 5 Abdominal Thrusts:** If blocked, wrap your arms around their waist, place a fist above their navel, and pull inward and upward quickly 5 times.\n4. **Repeat:** Alternate between back blows and abdominal thrusts until block is cleared.\n\n_Disclaimer: This is AI first-aid advice. For life-threatening emergencies, tap the SOS button on your screen immediately to dispatch emergency professionals._`;
        } else {
          responseText = `Hello! I am your LifeLink AI First-Aid Assistant. 
Please ask any emergency or first-aid question (e.g., "how to treat a burn", "what to do for bleeding"). 
I am here to guide you step-by-step through standard emergency responses.

_Disclaimer: This is AI first-aid advice. For life-threatening emergencies, tap the SOS button on your screen immediately to dispatch emergency professionals._`;
        }
      }

      // Stream the mock text in chunks to simulate a real typewriter streaming effect
      const chunks = responseText.split(' ');
      for (let i = 0; i < chunks.length; i++) {
        res.write(chunks[i] + ' ');
        await new Promise(resolve => setTimeout(resolve, 35));
      }
      res.end();
    } catch (err) {
      console.error('Error in mock response streaming:', err);
      res.status(500).end('Internal Server Error in first-aid response.');
    }
  });

  // Vite integration for asset serving and hot reloading in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
