import { Suspense } from "react";
import HomeTabs from "@/components/HomeTabs";

export default function Home() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-5 animate-fade-in">
      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <HomeTabs />
      </Suspense>
    </main>
  );
}
