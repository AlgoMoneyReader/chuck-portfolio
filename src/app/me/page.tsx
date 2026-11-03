import Link from "next/link";
import { FiPieChart, FiCpu, FiLock, FiInstagram, FiChevronRight, FiUser } from "react-icons/fi";

const MENU = [
  { href: "/portfolio", Icon: FiPieChart, title: "포트폴리오", desc: "보유 종목 실시간 손익 관리" },
  { href: "/analyze", Icon: FiCpu, title: "AI 종목 분석", desc: "종목 검색과 AI 리서치 보고서" },
  { href: "/admin", Icon: FiLock, title: "운영자", desc: "운영자 전용 메뉴 (비밀번호)" },
];

export default function MePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-16 h-16 rounded-2xl bg-navy-card border border-navy-border flex items-center justify-center">
          <FiUser size={28} className="text-gray-500" />
        </div>
        <p className="text-sm text-gray-400">카카오·구글 로그인은 곧 열립니다</p>
      </div>

      <section>
        <p className="text-xs font-semibold text-gray-500 mb-2 px-1">메뉴</p>
        <ul className="card !p-0 divide-y divide-navy-border">
          {MENU.map(({ href, Icon, title, desc }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-4 px-4 py-4 hover:bg-white/5">
                <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-cyan-brand"><Icon size={18} /></span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
                </span>
                <FiChevronRight className="text-gray-600" />
              </Link>
            </li>
          ))}
          <li>
            <a href="https://www.instagram.com/alliknam" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-4 px-4 py-4 hover:bg-white/5">
              <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-pink-400"><FiInstagram size={18} /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-white">알읽남 인스타그램</span>
                <span className="block text-xs text-gray-500 mt-0.5">@alliknam</span>
              </span>
              <FiChevronRight className="text-gray-600" />
            </a>
          </li>
        </ul>
      </section>

      <section className="card bg-navy-sub/50">
        <p className="text-sm font-bold text-white mb-2">알읽남 채널 소개</p>
        <p className="text-gray-400 text-xs leading-relaxed">
          <span className="text-gold font-bold">알읽남</span>은 알고리즘으로 읽어주는 남자의 줄임말입니다.
          매일 쏟아지는 뉴스와 시장 데이터를 AI가 분석해 핵심 인사이트만 전달합니다.
        </p>
      </section>

      <p className="text-center text-[10px] text-gray-600">알읽남 Investment Dashboard</p>
    </main>
  );
}
