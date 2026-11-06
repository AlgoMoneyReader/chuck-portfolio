"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiTrendingUp, FiFileText, FiCalendar, FiUser, FiBarChart2 } from "react-icons/fi";
import { TbBulb } from "react-icons/tb";

const TABS = [
  { href: "/",          label: "증시",     Icon: FiTrendingUp,    match: (p: string) => p === "/" || p.startsWith("/stock") || p.startsWith("/analyze") },
  { href: "/flow",      label: "매매동향", Icon: FiBarChart2,     match: (p: string) => p.startsWith("/flow") },
  { href: "/news",      label: "뉴스",     Icon: FiFileText,      match: (p: string) => p.startsWith("/news") },
  { href: "/calendar",  label: "캘린더",   Icon: FiCalendar,      match: (p: string) => p.startsWith("/calendar") },
  { href: "/community", label: "인사이트", Icon: TbBulb,          match: (p: string) => p.startsWith("/community") },
  { href: "/me",        label: "My",   Icon: FiUser,          match: (p: string) => ["/me", "/portfolio", "/admin", "/prompts"].some(x => p.startsWith(x)) },
];

export default function BottomTabBar() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      data-tour="bottomnav"
      className="fixed bottom-0 inset-x-0 z-30 bg-navy-sub/95 backdrop-blur-md border-t border-navy-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-3xl mx-auto grid grid-cols-6">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link key={href} href={href} data-tour={`tab-${href.slice(1) || "home"}`}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-gold" : "text-gray-500 hover:text-gray-300"
              }`}>
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
