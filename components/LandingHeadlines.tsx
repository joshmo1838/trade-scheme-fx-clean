"use client";
import { useEffect, useState } from "react";

const slides = [
  {
    title: "Welcome to",
    highlight: "Trade Scheme FX",
    description: "An independent trading workspace for market learning, planning and customer-controlled Deriv Demo tools.",
  },
  {
    title: "Trade with",
    highlight: "better structure",
    description: "Explore market tools, understand your setups, and make your own decisions with a clearer workspace.",
  },
  {
    title: "Free bots",
    highlight: "ready to explore",
    description: "Learn how trading bots work, review the available tools and practice with virtual funds when Demo execution is enabled.",
  },
];

export default function LandingHeadlines() {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;
    const timer = window.setInterval(() => {
      setSlideIndex(current => (current + 1) % slides.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, []);

  const slide = slides[slideIndex];
  return (
    <div key={slideIndex} className="senfxHeadlineStage" aria-live="off">
      <h1>{slide.title} <span>{slide.highlight}</span></h1>
      <p>{slide.description}</p>
    </div>
  );
}
