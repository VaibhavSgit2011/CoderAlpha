"use client";

import { useState } from 'react';
import { Rocket, Timer, Cpu, Newspaper, FileText, Compass, ServerCrash } from 'lucide-react';
import ApiService from '@/services/apiService';

export default function RequestReport() {
  const [ticker, setTicker] = useState('AAPL');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    const cleanTicker = ticker.trim().toUpperCase();
    if (!cleanTicker || cleanTicker.length > 5 || !/^[A-Z]+$/.test(cleanTicker)) {
      alert('Please enter a valid stock ticker symbol (e.g. AAPL, TSLA, NVDA).');
      return;
    }

    setIsGenerating(true);
    try {
      // Connect to the real Express report generation pipeline
      const result = await ApiService.generateReport(cleanTicker);
      alert(
        `SUCCESS!\n\nDue diligence dossier generation successfully initiated on backend with Report ID: ${result.reportId}.\n\n` +
        `Our Bright Data news scraper, Social Sentiment engine, and OpenRouter LLM are active. The completed report will appear shortly in your "AI Reports" Vault!`
      );
    } catch (err: any) {
      console.error('Report trigger failed:', err);
      alert(`Backend connection error: ${err.message || 'Server was unreachable.'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const featurePills = [
    { 
      title: "BRIGHT DATA SERP NEWS", 
      desc: "Real-time Google search indices scraped dynamically for fresh financial press flows.",
      icon: Newspaper,
      color: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/20"
    },
    { 
      title: "REDDIT SOCIAL SENTIMENT", 
      desc: "Firestore intelligence database queries recent social summaries and live market parameters.",
      icon: Compass,
      color: "text-accent-green bg-accent-green/10 border-accent-green/20"
    },
    { 
      title: "OPENROUTER HEAVY LLM", 
      desc: "Llama 3 70B & Gemini reasoning agents synthesize technical intelligence into structured dossiers.",
      icon: Cpu,
      color: "text-amber-500 bg-amber-500/10 border-amber-500/20"
    }
  ];

  return (
    <div className="flex flex-col h-[76vh] w-full justify-center items-center bg-[#131b2c]/30 rounded-2xl border border-[#242f48]/50 p-8 select-text relative">
      
      {/* Background neon glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] rounded-full bg-accent-cyan/5 blur-[100px] pointer-events-none" />

      {/* Title & Branding */}
      <div className="max-w-xl text-center flex flex-col items-center space-y-6">
        <div className="h-12 w-12 bg-gradient-to-tr from-[#00f0ff] to-[#00ffaa] rounded-2xl flex items-center justify-center filter drop-shadow-[0_0_8px_rgba(0,240,255,0.45)] mb-2 animate-bounce">
          <Rocket className="h-6 w-6 text-[#0d1321]" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wider">
            Agentic Due Diligence Generator
          </h2>
          <p className="text-xs text-[#8a98b5] leading-relaxed font-semibold mt-2.5">
            Compile professional, institutional-grade investment dossiers on any asset in seconds. Enter a ticker to trigger the automated scraping, embedding, and LLM analysis pipelines.
          </p>
        </div>

        {/* Input & Form */}
        <div className="w-full bg-[#090d16]/60 border border-[#242f48]/70 p-5 rounded-2xl flex flex-col space-y-4 shadow-xl">
          <div className="flex flex-col space-y-1.5 text-left">
            <label className="text-[10px] text-[#5b6e92] font-black uppercase tracking-wider pl-1.5 flex items-center space-x-1">
              <FileText className="h-3 w-3" />
              <span>STOCK TICKER SYMBOL</span>
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g. NVDA"
              className="px-4 py-3 bg-[#090d16]/70 border border-[#242f48]/70 rounded-xl text-sm text-white focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/20 font-black uppercase tracking-wider font-mono text-center"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-[#00f0ff] to-[#00ffaa] hover:opacity-90 text-[#090d16] font-black text-xs tracking-wider py-3.5 rounded-xl transition-all duration-200 glow-cyan-box flex items-center justify-center space-x-2 select-none uppercase cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Timer className="h-4.5 w-4.5 animate-spin" />
                <span>GENERATE DOSSIER PIPELINE ACTIVE...</span>
              </>
            ) : (
              <>
                <span>COMPILE SYSTEM INTELLIGENCE</span>
              </>
            )}
          </button>
        </div>

        {/* Pipeline Feature description pills */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-4 w-full text-left">
          {featurePills.map((pill, i) => (
            <div key={i} className="bg-[#131b2c]/40 border border-[#242f48]/40 p-4.5 rounded-xl space-y-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${pill.color}`}>
                <pill.icon className="h-4 w-4" />
              </div>
              <h4 className="text-[10px] font-black text-white uppercase tracking-wider leading-none">
                {pill.title}
              </h4>
              <p className="text-[10px] text-[#5b6e92] font-semibold leading-relaxed">
                {pill.desc}
              </p>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
}
