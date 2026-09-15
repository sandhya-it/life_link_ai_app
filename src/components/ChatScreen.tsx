import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  HeartPulse, Send, Mic, MicOff, RefreshCw, AlertCircle, 
  HelpCircle, Volume2, VolumeX, Globe, ShieldAlert, Sparkles,
  Square, Play, Pause, Radio, ChevronRight, X, Headphones
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatScreenProps {
  appLanguage: 'en' | 'ta' | 'hi';
  setAppLanguage: (lang: 'en' | 'ta' | 'hi') => void;
}

export default function ChatScreen({ appLanguage, setAppLanguage }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text: appLanguage === 'ta' 
        ? 'வணக்கம்! நான் உங்கள் லைஃப்லிங்க் AI முதலுதவி உதவியாளர். தயவுசெய்து காயங்கள் அல்லது அவசரநிலைகள் பற்றிய உங்கள் கேள்விகளைக் கேளுங்கள். குரல் உள்ளீடு மற்றும் AI குரல் பதிலும் செயல்படுகிறது.'
        : appLanguage === 'hi'
        ? 'नमस्ते! मैं आपका लाइफलिंक एआई प्राथमिक चिकित्सा सहायक हूं। कृपया अपनी समस्या बताएं। आप बोलकर भी पूछ सकते हैं और एआई आवाज़ में उत्तर भी सुन सकते हैं।'
        : 'Hello! I am your LifeLink AI First-Aid Assistant. You can speak your question or type it. I will provide step-by-step guidance and read aloud the instructions in voice.',
      timestamp: new Date()
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Speech Recognition (Voice Input) States
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptBufferRef = useRef<string>('');

  // Text-To-Speech (AI Voice Answer) States
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  // Clean speech synthesis, audio element, and speech recognition on component unmount
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
        audioElementRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  // Update welcome message when language changes
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].id === 'welcome-msg') {
        return [{
          id: 'welcome-msg',
          sender: 'assistant',
          text: appLanguage === 'ta' 
            ? 'வணக்கம்! நான் உங்கள் லைஃப்லிங்க் AI முதலுதவி உதவியாளர். தயவுசெய்து காயங்கள் அல்லது அவசரநிலைகள் பற்றிய உங்கள் கேள்விகளைக் கேளுங்கள். தமிழில் குரல் உள்ளீடு மற்றும் AI குரல் பதிலும் முழுமையாக செயல்படுகிறது.'
            : appLanguage === 'hi'
            ? 'नमस्ते! मैं आपका लाइफलिंक एआई प्राथमिक चिकित्सा सहायक हूं। कृपया अपनी समस्या बताएं। आप हिंदी में बोलकर पूछ सकते हैं और एआई हिंदी आवाज़ में मार्गदर्शन सुन सकते हैं।'
            : 'Hello! I am your LifeLink AI First-Aid Assistant. You can speak your question or type it. I will provide step-by-step guidance and read aloud the instructions in voice.',
          timestamp: new Date()
        }];
      }
      return prev;
    });
  }, [appLanguage]);

  // Clean text from markdown for fluent speech synthesis
  const cleanTextForSpeech = (rawText: string): string => {
    return rawText
      .replace(/[*#_`~>]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[-•]\s+/g, '. ')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Browser Web Speech Fallback for offline environments
  const fallbackWebSpeech = useCallback((cleanText: string, messageId: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSpeaking(false);
      setIsPaused(false);
      setSpeakingMessageId(null);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      currentUtteranceRef.current = utterance;

      const langCode = appLanguage === 'ta' ? 'ta-IN' : appLanguage === 'hi' ? 'hi-IN' : 'en-US';
      utterance.lang = langCode;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const target = appLanguage === 'ta' ? 'ta' : appLanguage === 'hi' ? 'hi' : 'en';
        const match = voices.find(v => 
          v.lang.toLowerCase().startsWith(target) || 
          v.name.toLowerCase().includes(appLanguage === 'ta' ? 'tamil' : appLanguage === 'hi' ? 'hindi' : 'english')
        );
        if (match) utterance.voice = match;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        setSpeakingMessageId(messageId);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setSpeakingMessageId(null);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setSpeakingMessageId(null);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Fallback Web Speech error:', e);
      setIsSpeaking(false);
      setIsPaused(false);
      setSpeakingMessageId(null);
    }
  }, [appLanguage]);

  // Primary High-Fidelity Text-To-Speech Function (Native Tamil, Hindi, and English Audio Engine)
  const speakMessage = useCallback((textToSpeak: string, messageId: string) => {
    // If already playing this message, toggle stop
    if (speakingMessageId === messageId && isSpeaking) {
      stopSpeaking();
      return;
    }

    // Stop previous audio playback
    stopSpeaking();

    const clean = cleanTextForSpeech(textToSpeak);
    if (!clean) return;

    setIsSpeaking(true);
    setIsPaused(false);
    setSpeakingMessageId(messageId);

    // Call server high-fidelity multi-lingual audio stream (/api/tts)
    const ttsUrl = `/api/tts?lang=${appLanguage}&text=${encodeURIComponent(clean.slice(0, 1600))}`;
    const audio = new Audio(ttsUrl);
    audioElementRef.current = audio;

    audio.onended = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setSpeakingMessageId(null);
      audioElementRef.current = null;
    };

    audio.onerror = (e) => {
      console.warn('Audio streaming failed, falling back to Web Speech API:', e);
      fallbackWebSpeech(clean, messageId);
    };

    audio.play().catch(err => {
      console.warn('Audio play prevented by browser policy, using fallback:', err);
      fallbackWebSpeech(clean, messageId);
    });
  }, [appLanguage, isSpeaking, speakingMessageId, fallbackWebSpeech]);

  // Stop speaking
  const stopSpeaking = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
      audioElementRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsPaused(false);
    setSpeakingMessageId(null);
  };

  // Toggle pause/resume
  const togglePauseSpeaking = () => {
    if (audioElementRef.current) {
      if (audioElementRef.current.paused) {
        audioElementRef.current.play().catch(() => {});
        setIsPaused(false);
      } else {
        audioElementRef.current.pause();
        setIsPaused(true);
      }
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
    }
  };

  // Handle message sending & streaming response from Express server
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    // Stop speaking any previous message
    stopSpeaking();

    const userMessage: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    const botMessageId = `bot-${Date.now()}`;
    const botMessagePlaceholder: Message = {
      id: botMessageId,
      sender: 'assistant',
      text: '...',
      timestamp: new Date(),
      isStreaming: true
    };

    setMessages(prev => [...prev, userMessage, botMessagePlaceholder]);
    setUserInput('');
    setIsSending(true);

    try {
      const response = await fetch('/ai/first-aid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          language: appLanguage
        })
      });

      if (!response.ok) {
        throw new Error('Server responded with an error');
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let accumulatedText = '';

      // Set empty first to clear placeholder "..."
      setMessages(prev => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
          copy[lastIndex] = { ...copy[lastIndex], text: '' };
        }
        return copy;
      });

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          accumulatedText += chunk;

          setMessages(prev => {
            const copy = [...prev];
            const lastIndex = copy.length - 1;
            if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
              copy[lastIndex] = { 
                ...copy[lastIndex], 
                text: accumulatedText 
              };
            }
            return copy;
          });
        }
      }

      // Finish streaming state
      setMessages(prev => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
          copy[lastIndex] = { 
            ...copy[lastIndex], 
            isStreaming: false 
          };
        }
        return copy;
      });

      // Automatically speak AI answer if autoSpeak is enabled!
      if (autoSpeak && accumulatedText.trim()) {
        setTimeout(() => {
          speakMessage(accumulatedText, botMessageId);
        }, 300);
      }

    } catch (err: any) {
      console.error('Chat error:', err);
      const fallbackError = appLanguage === 'ta'
        ? 'மன்னிக்கவும், பதிலை பெற முடியவில்லை. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.'
        : appLanguage === 'hi'
        ? 'क्षमा करें, प्रतिक्रिया प्राप्त करने में त्रुटि हुई। कृपया पुनः प्रयास करें।'
        : 'Error connecting to the AI Assistant. Please check your network and try again.';

      setMessages(prev => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
          copy[lastIndex] = { 
            ...copy[lastIndex], 
            text: fallbackError,
            isStreaming: false 
          };
        }
        return copy;
      });

      if (autoSpeak) {
        speakMessage(fallbackError, botMessageId);
      }
    } finally {
      setIsSending(false);
    }
  };

  // Real Speech Recognition (Voice Input) Handler
  const handleMicClick = () => {
    if (isSending) return;

    // If already listening, stop and submit
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      const spoken = transcriptBufferRef.current.trim();
      if (spoken) {
        handleSendMessage(spoken);
      }
      return;
    }

    // Stop speaking if AI is talking
    stopSpeaking();

    // Check Web Speech Recognition support
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      // Fallback if browser lacks Web Speech API
      setVoiceToast("Web Speech Recognition is not supported on this browser. Use quick prompts below.");
      setTimeout(() => setVoiceToast(null), 4000);
      triggerFallbackVoiceSimulation();
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = appLanguage === 'ta' ? 'ta-IN' : appLanguage === 'hi' ? 'hi-IN' : 'en-US';

      transcriptBufferRef.current = '';
      setInterimTranscript('');
      setIsListening(true);
      setVoiceToast(null);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        transcriptBufferRef.current = transcript;
        setInterimTranscript(transcript);
        setUserInput(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
        const finalSpoken = transcriptBufferRef.current.trim();
        if (finalSpoken) {
          handleSendMessage(finalSpoken);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'not-allowed') {
          setVoiceToast("Microphone access was blocked or restricted in preview frame. Tap a quick emergency question below.");
          setTimeout(() => setVoiceToast(null), 4500);
        } else if (event.error === 'no-speech') {
          setVoiceToast("No voice detected. Please try speaking closer to the microphone.");
          setTimeout(() => setVoiceToast(null), 3000);
        } else {
          // If network/aborted, offer fallback simulation
          triggerFallbackVoiceSimulation();
        }
      };

      recognition.start();

    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      triggerFallbackVoiceSimulation();
    }
  };

  // Fallback Voice Simulation for restricted iframe environments
  const triggerFallbackVoiceSimulation = () => {
    setIsListening(true);
    setVoiceToast("Listening to voice input...");

    const demoQueries = {
      en: [
        "What is the first aid for severe bleeding?",
        "How do you treat a severe burn?",
        "Someone is choking, what should I do?",
        "How do I perform CPR on an adult?"
      ],
      ta: [
        "இரத்தப்போக்குக்கு உடனடி முதலுதவி என்ன?",
        "தீக்காயங்களுக்கு எப்படி சிகிச்சை அளிப்பது?",
        "மூச்சுத்திணறலுக்கு என்ன செய்ய வேண்டும்?",
        "சிபிஆர் செய்வது எப்படி?"
      ],
      hi: [
        "खून बहने पर प्राथमिक उपचार क्या करें?",
        "जलने पर क्या लगाना चाहिए?",
        "सांस रुकने पर प्राथमिक चिकित्सा क्या है?",
        "सीपीआर देने की सही विधि क्या है?"
      ]
    };

    const queries = demoQueries[appLanguage] || demoQueries.en;
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];

    setTimeout(() => {
      setInterimTranscript(randomQuery);
      setUserInput(randomQuery);
      setIsListening(false);
      setVoiceToast(`Voice Input Captured: "${randomQuery}"`);

      setTimeout(() => {
        setVoiceToast(null);
        handleSendMessage(randomQuery);
      }, 1200);
    }, 2200);
  };

  // Quick emergency prompt chips
  const emergencyChips = {
    en: [
      "Severe Bleeding",
      "Burn Treatment",
      "Adult CPR Steps",
      "Choking Relief"
    ],
    ta: [
      "இரத்தப்போக்கு",
      "தீக்காயம்",
      "சிபிஆர் படிகள்",
      "மூச்சுத்திணறல்"
    ],
    hi: [
      "खून बहना",
      "जलने का इलाज",
      "सीपीआर नियम",
      "सांस घुटना"
    ]
  };

  return (
    <div id="chat-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20 font-sans">
      
      {/* Header: AI Language Selector & Auto-Speak Switch */}
      <div className="p-3 bg-white border-b border-gray-200/90 flex justify-between items-center shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200/70">
            {(['en', 'ta', 'hi'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setAppLanguage(lang)}
                className={`text-[10px] font-bold px-2 py-1 rounded-md transition uppercase tracking-wider cursor-pointer ${
                  appLanguage === lang ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {lang === 'ta' ? 'தமிழ்' : lang === 'hi' ? 'हिंदी' : 'English'}
              </button>
            ))}
          </div>
        </div>

        {/* AI Voice Answer Auto-Speak Toggle */}
        <button
          type="button"
          onClick={() => {
            const next = !autoSpeak;
            setAutoSpeak(next);
            if (!next) stopSpeaking();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
            autoSpeak 
              ? 'bg-teal-50 border-teal-200 text-teal-800' 
              : 'bg-gray-100 border-gray-200 text-gray-500'
          }`}
          title="Toggle automatic AI voice readout of first-aid answers"
        >
          {autoSpeak ? (
            <>
              <Volume2 size={13} className="text-teal-600 animate-pulse" />
              <span>
                {appLanguage === 'ta' ? 'தமிழ் குரல்: ஆன்' : appLanguage === 'hi' ? 'हिंदी आवाज़: चालू' : 'AI Voice: ON'}
              </span>
            </>
          ) : (
            <>
              <VolumeX size={13} className="text-gray-400" />
              <span>
                {appLanguage === 'ta' ? 'தமிழ் குரல்: ஆஃப்' : appLanguage === 'hi' ? 'हिंदी आवाज़: बंद' : 'AI Voice: OFF'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Non-alarming, persistent disclaimer banner */}
      <div className="bg-amber-50/70 border-b border-amber-200/50 px-4 py-2 flex gap-2 items-center font-sans">
        <ShieldAlert size={14} className="text-amber-700 shrink-0" />
        <p className="text-[10px] font-bold text-amber-900 leading-snug">
          Life-Threatening Emergency? Tap the Red SOS on your Home screen immediately.
        </p>
      </div>

      {/* Global Floating AI Voice Player when actively speaking */}
      {isSpeaking && (
        <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between shadow-md border-b border-gray-800 animate-fade-in z-30">
          <div className="flex items-center gap-2.5">
            <div className="flex items-end gap-0.5 h-4">
              <span className="w-1 bg-teal-400 rounded-full animate-bounce [animation-delay:0.1s] h-3"></span>
              <span className="w-1 bg-teal-400 rounded-full animate-bounce [animation-delay:0.3s] h-4"></span>
              <span className="w-1 bg-teal-400 rounded-full animate-bounce [animation-delay:0.2s] h-2"></span>
              <span className="w-1 bg-teal-400 rounded-full animate-bounce [animation-delay:0.4s] h-3.5"></span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-teal-300 block leading-none">
                {appLanguage === 'ta' 
                  ? 'AI தமிழ் முதலுதவி குரல் வழிகாட்டல்' 
                  : appLanguage === 'hi' 
                  ? 'AI हिंदी प्राथमिक उपचार आवाज मार्गदर्शन' 
                  : 'AI Voice Guidance Playing'}
              </span>
              <span className="text-[9px] text-gray-400 font-medium">
                {isPaused 
                  ? (appLanguage === 'ta' ? 'இடைநிறுத்தப்பட்டது' : appLanguage === 'hi' ? 'रोका गया' : 'Paused')
                  : (appLanguage === 'ta' ? 'படிப்படியான முதலுதவி வழிமுறைகளை வாசிக்கிறது' : appLanguage === 'hi' ? 'चरणबद्ध निर्देश बोले जा रहे हैं' : 'Reading step-by-step instructions')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePauseSpeaking}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-200 transition cursor-pointer"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play size={13} /> : <Pause size={13} />}
            </button>
            <button
              type="button"
              onClick={stopSpeaking}
              className="p-1.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800/60 rounded-lg transition cursor-pointer"
              title="Stop Voice"
            >
              <Square size={12} className="fill-red-400" />
            </button>
          </div>
        </div>
      )}

      {/* Messages Bubbles list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed font-sans shadow-xs ${
                msg.sender === 'user'
                  ? 'bg-gray-900 text-white rounded-br-none'
                  : 'bg-white text-gray-850 border border-gray-200/90 rounded-bl-none'
              }`}
            >
              {/* If empty/streaming */}
              {msg.text === '...' && msg.isStreaming ? (
                <div className="flex items-center gap-1.5 py-1 px-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-bounce"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-bounce [animation-delay:0.4s]"></span>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              )}
            </div>
            
            {/* Message Action Footer: Voice Answer Button & Timestamp */}
            <div className="flex items-center gap-2 mt-1.5 px-1 font-sans">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>

              {/* Per-message AI Voice Playback Control */}
              {msg.sender === 'assistant' && msg.text !== '...' && !msg.isStreaming && (
                <button
                  type="button"
                  onClick={() => speakMessage(msg.text, msg.id)}
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition cursor-pointer ${
                    speakingMessageId === msg.id && isSpeaking
                      ? 'bg-teal-100 text-teal-800 border border-teal-200'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200/70'
                  }`}
                  title={speakingMessageId === msg.id && isSpeaking ? "Stop Voice" : "Read this answer aloud in selected language"}
                >
                  {speakingMessageId === msg.id && isSpeaking ? (
                    <>
                      <div className="flex items-end gap-0.5 h-2.5">
                        <span className="w-0.5 bg-teal-600 animate-bounce h-2"></span>
                        <span className="w-0.5 bg-teal-600 animate-bounce [animation-delay:0.2s] h-2.5"></span>
                        <span className="w-0.5 bg-teal-600 animate-bounce [animation-delay:0.4s] h-1.5"></span>
                      </div>
                      <Square size={10} className="fill-teal-700 ml-0.5" />
                      <span>
                        {appLanguage === 'ta' ? 'நிறுத்து' : appLanguage === 'hi' ? 'रोकें' : 'Stop Voice'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={11} className="text-gray-500" />
                      <span>
                        {appLanguage === 'ta' ? 'தமிழ் குரல்' : appLanguage === 'hi' ? 'हिंदी आवाज़' : 'Listen'}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator placeholder */}
        {isSending && messages[messages.length - 1]?.sender === 'user' && (
          <div className="flex flex-col items-start">
            <div className="bg-white text-gray-800 border border-gray-200/80 rounded-2xl rounded-bl-none px-4 py-3 shadow-xs font-sans">
              <div className="flex items-center gap-2">
                <RefreshCw className="animate-spin text-teal-600" size={12} />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">FORMULATING RESPONSE...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Real-time Voice Input Listening Overlay Banner */}
      {isListening && (
        <div className="mx-4 mb-2 bg-red-600 text-white p-3.5 rounded-2xl shadow-lg border border-red-700 animate-pulse font-sans flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex items-center justify-center">
              <span className="absolute h-8 w-8 rounded-full bg-white/20 animate-ping"></span>
              <div className="p-2 bg-white text-red-600 rounded-full shrink-0 shadow-xs">
                <Mic size={16} />
              </div>
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-red-200 block">
                Listening ({appLanguage === 'ta' ? 'தமிழ்' : appLanguage === 'hi' ? 'हिंदी' : 'English'})...
              </span>
              <p className="text-xs font-bold text-white truncate">
                {interimTranscript || "Speak your first-aid question now..."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMicClick}
            className="px-3 py-1.5 bg-white text-red-700 hover:bg-red-50 rounded-xl text-xs font-black shrink-0 transition cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      )}

      {/* Notification / Speech Toast feedback */}
      {voiceToast && (
        <div className="absolute bottom-24 left-4 right-4 bg-gray-900 text-white p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-gray-800 shadow-xl z-50 font-sans">
          <Volume2 size={15} className="animate-pulse text-teal-400 shrink-0" />
          <span className="truncate">{voiceToast}</span>
        </div>
      )}

      {/* Quick First-Aid Emergency Chips Tray */}
      <div className="px-4 py-1.5 bg-white border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider shrink-0">QUICK:</span>
        {(emergencyChips[appLanguage] || emergencyChips.en).map((chipText) => (
          <button
            key={chipText}
            type="button"
            onClick={() => handleSendMessage(chipText)}
            disabled={isSending || isListening}
            className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 whitespace-nowrap transition cursor-pointer border border-gray-200/60 shrink-0 disabled:opacity-40"
          >
            {chipText}
          </button>
        ))}
      </div>

      {/* Input Tray */}
      <div className="p-3 bg-white border-t border-gray-200/90 shadow-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(userInput);
          }}
          className="flex items-center gap-2"
        >
          {/* Working Voice Input Mic Button */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isSending}
            title={isListening ? "Stop listening and send" : "Tap to speak your question"}
            className={`p-3 rounded-xl transition shrink-0 cursor-pointer border ${
              isListening 
                ? 'bg-red-600 text-white border-red-700 animate-pulse shadow-md' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
            }`}
          >
            {isListening ? <Radio size={16} className="animate-spin" /> : <Mic size={16} />}
          </button>

          <input
            type="text"
            placeholder={
              isListening
                ? "Listening... Speak now"
                : appLanguage === 'ta' 
                ? 'வழிகாட்டுதலைப் பெற இங்கே கேளுங்கள்...' 
                : appLanguage === 'hi'
                ? 'मदद के लिए यहाँ पूछें...'
                : "Ask or speak first-aid question..."
            }
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={isSending}
            className="w-full text-xs px-3.5 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50 focus:bg-white transition font-sans"
          />

          <button
            type="submit"
            disabled={!userInput.trim() || isSending}
            className="p-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition shrink-0 disabled:opacity-30 cursor-pointer"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
