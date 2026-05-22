'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Terminal, Settings, LogOut,
  Server, Shield, HardDrive, Tag, Globe, Gamepad2, X,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',           label: 'Dashboard', icon: LayoutDashboard },
  { href: '/console',    label: 'Console',   icon: Terminal         },
  { href: '/properties', label: 'Properties',icon: Settings         },
  { href: '/gamerules',  label: 'Gamerules', icon: Gamepad2         },
  { href: '/allowlist',  label: 'Allow List',icon: Shield           },
  { href: '/backups',    label: 'Backups',   icon: HardDrive        },
  { href: '/version',    label: 'Version',   icon: Tag              },
  { href: '/worlds',     label: 'Worlds',    icon: Globe            },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <aside
      className={`
        fixed md:sticky top-0 inset-y-0 left-0 z-30
        w-56 shrink-0 flex flex-col h-screen
        border-r border-panel-border bg-panel-card
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
    >
      {/* Brand + mobile close */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-panel-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/30 shrink-0">
            <Server className="w-3.5 h-3.5 text-green-400" />
          </div>
          <span className="text-sm font-bold text-white">Bedrock Panel</span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-lg text-slate-500 hover:text-white hover:bg-panel-hover transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-panel-hover text-white border border-panel-border'
                  : 'text-slate-400 hover:text-white hover:bg-panel-hover'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-green-400' : ''}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-panel-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Logout
        </button>
      </div>
    </aside>
  );
}

