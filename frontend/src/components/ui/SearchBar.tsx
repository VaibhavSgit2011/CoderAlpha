"use client";

import { useState } from 'react';
import { Search } from 'lucide-react';

export default function SearchBar() {
  const [query, setQuery] = useState('');

  return (
    <div className="relative w-80 lg:w-110 select-none">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <Search className="h-4.5 w-4.5 text-[#8a98b5]" />
      </div>
      <input
        type="text"
        placeholder="Search tickers & keywords..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl bg-[#121824]/60 border border-[#242f48]/70 pl-10.5 pr-4 py-2.2 text-sm text-white placeholder-[#5b6e92] focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/40 transition-all duration-200"
      />
    </div>
  );
}
