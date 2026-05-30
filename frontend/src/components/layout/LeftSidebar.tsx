import NavMenu from '@/components/ui/NavMenu';
import WatchlistPanel from '@/components/widgets/WatchlistPanel';
import Logo from '@/components/ui/Logo';

interface LeftSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function LeftSidebar({ activeTab, onTabChange }: LeftSidebarProps) {
  return (
    <aside className="w-68 border-r border-[#1a2336] bg-[#090d16] flex flex-col justify-between h-screen select-none z-10">
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="p-5 border-b border-[#1a2336] flex items-center justify-between">
          <Logo />
        </div>
        <div className="mt-4 flex-1">
          <NavMenu activeTab={activeTab} onTabChange={onTabChange} />
        </div>
      </div>
      <div className="border-t border-[#1a2336] overflow-y-auto bg-[#0a0e17]/40 max-h-[48vh]">
        <WatchlistPanel />
      </div>
    </aside>
  );
}