import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center space-x-2.5 select-none group">
      {/* Premium custom SVG logo mimicking the branded 'A' icon with cyber-nodes and a 3D blue-to-gold trend arrow */}
      <svg className="w-9 h-9 transition-all duration-300 group-hover:scale-105" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Cyber cyan glow filter for nodes */}
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          {/* 3D drop shadow for the overlay trend line */}
          <filter id="arrow-shadow" x="-20%" y="-20%" width="145%" height="145%">
            <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#000000" floodOpacity="0.65" />
          </filter>

          {/* Cohesive blue-to-gold trend line gradient */}
          <linearGradient id="trend-grad" x1="16" y1="85" x2="80" y2="23" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00f3ff" />
            <stop offset="35%" stopColor="#006cff" />
            <stop offset="70%" stopColor="#ff9000" />
            <stop offset="100%" stopColor="#ffe600" />
          </linearGradient>
        </defs>

        {/* 1. Glowing cyber-mesh / data nodes in the background (focused behind the left leg) */}
        <g opacity="0.85">
          <line x1="22" y1="28" x2="10" y2="50" stroke="#00f3ff" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="10" y1="50" x2="18" y2="72" stroke="#00f3ff" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="18" y1="72" x2="32" y2="65" stroke="#00f3ff" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="32" y1="65" x2="35" y2="44" stroke="#00f3ff" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="35" y1="44" x2="22" y2="28" stroke="#00f3ff" strokeWidth="0.8" strokeOpacity="0.4" />
          
          <line x1="22" y1="28" x2="32" y2="65" stroke="#00f3ff" strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1="10" y1="50" x2="35" y2="44" stroke="#00f3ff" strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1="45" y1="18" x2="22" y2="28" stroke="#00f3ff" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="45" y1="18" x2="35" y2="44" stroke="#00f3ff" strokeWidth="0.8" strokeOpacity="0.4" />

          {/* Interactive node points */}
          <circle cx="22" cy="28" r="2" fill="#00f3ff" filter="url(#node-glow)" />
          <circle cx="10" cy="50" r="2" fill="#00f3ff" filter="url(#node-glow)" />
          <circle cx="18" cy="72" r="2" fill="#00f3ff" filter="url(#node-glow)" />
          <circle cx="32" cy="65" r="2" fill="#00f3ff" filter="url(#node-glow)" />
          <circle cx="35" cy="44" r="2.5" fill="#00f3ff" filter="url(#node-glow)" />
          <circle cx="45" cy="18" r="2" fill="#00f3ff" filter="url(#node-glow)" />
        </g>

        {/* 2. Bold geometric white 'A' brand letter with internal triangle cutout (evenodd fill-rule) */}
        <path 
          d="M 24 82 L 43 26 L 57 26 L 76 82 L 61 82 L 56 66 L 44 66 L 39 82 Z M 50 41 L 46 56 L 54 56 Z" 
          fill="#ffffff" 
          fillRule="evenodd"
          filter="drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45))"
        />

        {/* 3. 3D Beveled Trend Arrow overlay piercing the A */}
        <g filter="url(#arrow-shadow)">
          <path 
            d="M 16 85 L 34 50 L 46 66 L 80 23" 
            stroke="url(#trend-grad)" 
            strokeWidth="6" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          <path 
            d="M 72 26 L 88 18 L 81 34 Z" 
            fill="#ffe600" 
            stroke="#ff9900"
            strokeWidth="0.75"
            strokeLinejoin="round" 
          />
        </g>
      </svg>

      <span className="font-extrabold text-[16px] tracking-[0.06em] text-white flex items-center select-none uppercase font-sans">
        AlphaTrade
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f3ff] to-[#ffe600] ml-1.5 font-black drop-shadow-[0_0_8px_rgba(0,243,255,0.35)]">AI</span>
      </span>
    </Link>
  );
}