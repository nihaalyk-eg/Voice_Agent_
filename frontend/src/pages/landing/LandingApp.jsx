import { useState } from 'react';
import { motion } from 'framer-motion';

const AGENTS = [
  {
    id: 'voice',
    label: 'Voice Agent',
    subtitle: 'Real-time AI maintenance intake over telephone',
    icon: 'fa-solid fa-phone-volume',
    tag: 'WebRTC · OpenAI Realtime',
    href: '/voice',
    fillColor: 'hsl(240 12% 8%)',
    accentColor: 'hsl(240 8% 55%)',
  },
  {
    id: 'email',
    label: 'Email Agent',
    subtitle: 'Intelligent email parsing and automatic work order creation',
    icon: 'fa-solid fa-envelope-open-text',
    tag: 'LLM · Azure OpenAI',
    href: '/email',
    fillColor: 'hsl(210 20% 9%)',
    accentColor: 'hsl(210 12% 50%)',
  },
];

function AgentCard({ label, subtitle, icon, tag, href, fillColor }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.a
      href={href}
      className="landing-card"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Bottom-to-top fill */}
      <motion.div
        className="landing-card-fill"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: hovered ? 1 : 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: fillColor }}
      />

      <div className="landing-card-content">
        {/* Icon */}
        <motion.div
          className="landing-card-icon"
          animate={{
            color: hovered ? 'rgba(255,255,255,0.9)' : 'hsl(240 10% 12%)',
            scale: hovered ? 1.08 : 1,
          }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <i className={icon} />
        </motion.div>

        {/* Label + subtitle */}
        <div className="landing-card-text">
          <motion.h2
            animate={{ color: hovered ? '#ffffff' : 'hsl(240 10% 4%)' }}
            transition={{ duration: 0.3 }}
          >
            {label}
          </motion.h2>
          <motion.p
            animate={{ color: hovered ? 'rgba(255,255,255,0.55)' : 'hsl(240 4% 46%)' }}
            transition={{ duration: 0.3 }}
          >
            {subtitle}
          </motion.p>
        </div>

        {/* Tag + arrow row */}
        <div className="landing-card-meta">
          <motion.span
            className="landing-card-tag"
            animate={{
              color: hovered ? 'rgba(255,255,255,0.4)' : 'hsl(240 4% 64%)',
              borderColor: hovered ? 'rgba(255,255,255,0.15)' : 'hsl(240 5.9% 88%)',
            }}
            transition={{ duration: 0.3 }}
          >
            {tag}
          </motion.span>

          <motion.div
            className="landing-card-arrow"
            animate={{
              x: hovered ? 6 : 0,
              color: hovered ? 'rgba(255,255,255,0.8)' : 'hsl(240 4% 64%)',
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <i className="fa-solid fa-arrow-right" />
          </motion.div>
        </div>
      </div>
    </motion.a>
  );
}

export default function LandingApp() {
  return (
    <div className="landing-root">
      {/* Brand bar */}
      <motion.header
        className="landing-header"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="landing-logo">
          <i className="fa-solid fa-bolt" />
        </div>
        <span className="landing-brand">Zora</span>
        <span className="landing-brand-sub">AI Intake Platform</span>
      </motion.header>

      {/* Cards */}
      <main className="landing-cards">
        {AGENTS.map((agent, i) => (
          <div key={agent.id} className="landing-card-wrapper" style={{ animationDelay: `${i * 80}ms` }}>
            <AgentCard {...agent} />
            {i < AGENTS.length - 1 && <div className="landing-divider" />}
          </div>
        ))}
      </main>
    </div>
  );
}
