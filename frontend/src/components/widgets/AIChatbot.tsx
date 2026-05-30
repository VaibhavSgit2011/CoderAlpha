"use client";

import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Sparkles, MessageSquare, Trash2, ArrowUpRight, Loader2 } from 'lucide-react';
import ApiService from '@/services/apiService';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  timestamp?: Date;
}

export default function AIChatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'ai',
      text: "Hello! I am your AlphaTrade AI Market Intelligence Analyst. I analyze live financial news streams, public sentiment vectors, and historical datasets through RAG-grounded memory networks.\n\nAsk me any question about specific stock tickers (like **AAPL**, **NVDA**, **TSLA**) or general macroeconomic trends!",
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Auto-scroll to bottom of thread
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Load conversation history on mount
    const loadHistory = async () => {
      try {
        const history = await ApiService.getChatHistory();
        if (history && history.length > 0) {
          setMessages(history.map(msg => ({
            sender: msg.sender,
            text: msg.text,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
          })));
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };
    loadHistory();
  }, []);

  const handleSend = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText) return;

    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: queryText, timestamp: new Date() }]);
    setLoading(true);

    try {
      // Call real Express backend RAG endpoint (passing symbol if query matches)
      const matches = queryText.match(/\b([A-Z]{1,5})\b/);
      const symbol = matches ? matches[1] : undefined;
      
      const result = await ApiService.chatWithMarket(queryText, symbol);
      
      setMessages((prev) => [
        ...prev, 
        { sender: 'ai', text: result.response, timestamp: new Date() }
      ]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        { 
          sender: 'ai', 
          text: `Connection Error: ${err.message || 'The backend chat pipeline was unreachable. Please ensure the Express server is active.'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear your local and database chat timeline?')) {
      try {
        await ApiService.clearChatHistory();
        setMessages([
          {
            sender: 'ai',
            text: "Chat timeline cleared. Ask me anything about specific stock tickers or general market structures!",
          }
        ]);
      } catch (err: any) {
        console.error('Failed to clear database chat history:', err);
        alert(`Failed to clear chat history from database: ${err.message || err}`);
      }
    }
  };

  const suggestionChips = [
    "Why is NVDA sentiment rising?",
    "Suggest long trade targets in Tech",
    "Analyze Tesla delivery estimates",
    "What is Apple's primary threat?",
  ];

  return (
    <div className="flex flex-col h-[76vh] w-full bg-[#131b2c]/30 rounded-2xl overflow-hidden border border-[#242f48]/50 select-text relative">
      
      {/* Dynamic Chat Header */}
      <div className="p-4 px-6 border-b border-[#242f48]/70 flex justify-between items-center bg-[#090d16]/30">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 bg-gradient-to-tr from-[#00f0ff] to-[#00ffaa] rounded-xl flex items-center justify-center filter drop-shadow-[0_0_5px_rgba(0,240,255,0.4)] animate-pulse">
            <Bot className="h-5 w-5 text-[#0d1321]" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">AlphaTrade AI</h3>
            <span className="text-[9.5px] font-black text-accent-green uppercase flex items-center space-x-1 tracking-wider mt-0.5 glow-green-text">
              <span className="h-1.5 w-1.5 bg-accent-green rounded-full animate-ping" />
              <span>Personalised RAG Memory Active</span>
            </span>
          </div>
        </div>
        <button 
          onClick={handleClearHistory}
          className="p-2 bg-[#121824]/60 border border-[#242f48]/70 hover:border-accent-red/50 hover:bg-accent-red/10 text-[#8a98b5] hover:text-accent-red rounded-xl transition-all cursor-pointer"
          title="Clear Conversation Logs"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Message Feed Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, idx) => {
          const isUser = msg.sender === 'user';
          return (
            <div key={idx} className={`flex items-start space-x-3.5 ${isUser ? 'justify-end' : ''} animate-fadeIn`}>
              {/* Bot Icon */}
              {!isUser && (
                <div className="h-8 w-8 bg-[#1a2336] border border-[#2d3b59] rounded-lg flex items-center justify-center shrink-0">
                  <Bot className="h-4.5 w-4.5 text-accent-cyan" />
                </div>
              )}

              {/* Message Bubble */}
              <div className={`p-4 rounded-2xl text-xs leading-relaxed max-w-[76%] shadow-lg text-left select-text whitespace-pre-line
                ${isUser
                  ? 'bg-[#1b253b] border border-accent-cyan/20 text-white rounded-tr-sm' 
                  : 'bg-[#090d16]/65 border border-[#242f48]/70 text-[#e2e8f0] rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>

              {/* User Avatar */}
              {isUser && (
                <img 
                  src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&h=60&fit=crop&crop=face" 
                  alt="User" 
                  className="h-8 w-8 rounded-lg object-cover border border-[#242f48] shrink-0"
                />
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center space-x-3 animate-pulse">
            <div className="h-8 w-8 bg-[#1a2336] border border-[#2d3b59] rounded-lg flex items-center justify-center shrink-0">
              <Bot className="h-4.5 w-4.5 text-accent-green" />
            </div>
            <div className="flex items-center bg-[#090d16]/40 border border-[#242f48]/70 rounded-xl p-3.5 px-4.5 text-xs text-[#8a98b5] font-semibold space-x-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-green" />
              <span>Ingesting Firestore memory & OpenRouter context...</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Suggestion Chips and Chat Inputs */}
      <div className="p-4 border-t border-[#242f48]/70 bg-[#090d16]/30">
        
        {/* Suggestion Chips */}
        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-2 mb-4">
            {suggestionChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => handleSend(chip)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#121824]/50 border border-[#242f48]/70 hover:border-accent-cyan/50 hover:bg-[#1a2336]/40 rounded-xl text-[10.5px] font-extrabold text-[#8a98b5] hover:text-white transition-all cursor-pointer uppercase tracking-wider"
              >
                <span>{chip}</span>
                <ArrowUpRight className="h-3 w-3 text-accent-cyan" />
              </button>
            ))}
          </div>
        )}

        {/* Text Input area */}
        <div className="relative">
          <textarea
            placeholder="Type your investment inquiry here... (Supports general topics & specific tickers like AAPL)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="w-full bg-[#090d16]/60 border border-[#242f48]/70 rounded-2xl pl-4 pr-14 py-3 text-xs text-white placeholder-[#5b6e92] focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/30 resize-none h-18 font-semibold"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="absolute right-4.5 bottom-5.5 p-2 bg-gradient-to-tr from-[#00f0ff] to-[#00ffaa] text-[#0d1321] rounded-xl transition-all duration-200 hover:scale-105 cursor-pointer filter drop-shadow-[0_0_5px_rgba(0,240,255,0.4)] disabled:opacity-50 disabled:scale-100"
          >
            <Send className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

    </div>
  );
}
