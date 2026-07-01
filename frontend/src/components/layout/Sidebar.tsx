'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, Wallet, BarChart3, Settings, type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { BRAND } from '@/lib/config/app';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const DEFAULT_NAV: NavSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Academics',
    items: [
      { label: 'Students', href: '/students', icon: GraduationCap },
      { label: 'Teachers', href: '/teachers', icon: Users },
      { label: 'Classes', href: '/classes', icon: BookOpen },
      { label: 'Timetable', href: '/timetable', icon: Calendar },
      { label: 'Attendance', href: '/attendance', icon: ClipboardList },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Fees', href: '/fees', icon: Wallet },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  collapsed?: boolean;
  open?: boolean;
  onClose?: () => void;
  sections?: NavSection[];
}

export function Sidebar({ collapsed = false, open = false, onClose, sections = DEFAULT_NAV }: SidebarProps) {
  const pathname = usePathname();
  return (
    <>
      <aside
        className={cn(
          'app-sidebar',
          collapsed && 'app-sidebar--collapsed',
          open && 'app-sidebar--open',
        )}
        aria-label="Primary navigation"
      >
        <div className="app-sidebar__brand">
          <span className="app-sidebar__brand-mark">{BRAND.name.slice(0, 2).toUpperCase()}</span>
          {!collapsed ? <span>{BRAND.name}</span> : null}
        </div>
        <nav className="app-sidebar__nav">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="app-sidebar__section">
                <span className="app-sidebar__section-label">{section.label}</span>
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn('app-sidebar__item', active && 'app-sidebar__item--active')}
                    aria-current={active ? 'page' : undefined}
                    onClick={onClose}
                  >
                    <span className="app-sidebar__item-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="app-sidebar__item-label">{item.label}</span>
                    {item.badge ? <span className="app-sidebar__item-badge">{item.badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="app-sidebar__footer">
          {!collapsed ? <span>v0.1.0</span> : null}
        </div>
      </aside>
      <div
        className={cn('app-sidebar-backdrop', open && 'app-sidebar-backdrop--visible')}
        onClick={onClose}
        aria-hidden="true"
      />
    </>
  );
}
