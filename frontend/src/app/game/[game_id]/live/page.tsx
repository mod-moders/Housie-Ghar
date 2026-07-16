"use client";
import { use } from "react";
import { LiveBoardContent } from "@/components/LiveBoardContent";

export default function LiveBoardPage({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  return <LiveBoardContent gameId={game_id} />;
}
