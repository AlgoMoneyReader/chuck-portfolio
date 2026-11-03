import { FiMessageCircle } from "react-icons/fi";

export default function CommunityPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-5 animate-fade-in">
      <h1 className="text-xl font-bold text-white mb-4">커뮤니티</h1>
      <div className="card text-center py-14 space-y-3">
        <FiMessageCircle size={32} className="mx-auto text-gray-600" />
        <p className="text-sm font-semibold text-white">게시판 준비 중</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          카카오·구글 계정으로 로그인하고<br />닉네임으로 글을 쓰는 게시판이 곧 열립니다.
        </p>
      </div>
    </main>
  );
}
