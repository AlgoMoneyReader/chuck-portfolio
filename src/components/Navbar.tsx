"use client";

import Link from "next/link";
import Image from "next/image";
import { FaInstagram } from "react-icons/fa";
import { FiSearch } from "react-icons/fi";

export default function Navbar() {
  return (
    <nav className="bg-navy-sub/95 backdrop-blur-md border-b border-navy-border">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-mark.png" alt="" width={30} height={30} priority
            className="rounded-lg ring-1 ring-white/10" />
          <span className="text-gold font-black text-[17px] tracking-tight">알읽남</span>
          <span className="text-electric-blue/60 text-xs hidden sm:block font-medium">@alliknam</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link href="/analyze" aria-label="종목 검색"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
            <FiSearch size={19} />
          </Link>
          <a href="https://www.instagram.com/alliknam" target="_blank" rel="noopener noreferrer"
            aria-label="알읽남 인스타그램"
            className="group flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/5">
            <FaInstagram size={18} className="text-gray-500 group-hover:text-pink-400 transition-colors" />
          </a>
        </div>
      </div>
    </nav>
  );
}
