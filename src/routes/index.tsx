import { createFileRoute } from "@tanstack/react-router";
import { MulticamApp } from "@/components/multicam/MulticamApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MULTI-CAM POV — Offline Multicam Production" },
      { name: "description", content: "Capture, cut, grade, mix, and export synchronized multicam productions offline." },
      { property: "og:title", content: "MULTI-CAM POV" },
      { property: "og:description", content: "An offline multicam camera and post-production suite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <MulticamApp />;
}
