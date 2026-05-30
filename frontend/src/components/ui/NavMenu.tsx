"use client";

import {
  Home,
  List,
  TrendingUp,
  FileText,
  Settings as SettingsIcon,
  Newspaper,
  MessageSquare,
  FilePlus,
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', icon: Home },
  { name: 'Watchlist', icon: List },
  { name: 'Markets', icon: TrendingUp },
  { name: 'Request Report', icon: FilePlus },
  { name: 'AI Chatbot', icon: MessageSquare },
  { name: 'Live News', icon: Newspaper },
  { name: 'AI Reports', icon: FileText },
  { name: 'Settings', icon: SettingsIcon },
];

interface NavMenuProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function NavMenu({ activeTab, onTabChange }: NavMenuProps) {
  return (
    <nav className="p-4 space-y-1.5">
      {navItems.map((item) => (
        <button
          key={item.name}
          onClick={() => onTabChange(item.name)}
          className={`flex items-center space-x-3 w-full text-left text-sm font-semibold p-2.5 rounded-lg transition-all duration-200 select-none
          ${activeTab === item.name
            ? 'active-nav-glow text-accent-green border-l-2 border-l-accent-green glow-green-text'
            : 'text-[#8a98b5] hover:bg-dark-800/40 hover:text-white'}`}
        >
          <item.icon className="h-4.5 w-4.5" />
          <span>{item.name}</span>
        </button>
      ))}
    </nav>
  );
}
