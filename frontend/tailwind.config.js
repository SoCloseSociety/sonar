/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy sonar namespace (kept for backward compat)
        sonar: {
          bg: '#030711',
          surface: '#060B16',
          'surface-2': '#0A1020',
          border: '#152030',
          'surface-light': '#1A2535',
          'surface-hover': '#0A1020',
        },
        // Bloomberg Terminal palette — primary design system
        t: {
          bg:          '#030711',
          panel:       '#060B16',
          surface:     '#0A1020',
          border:      '#152030',
          'border-hi': '#1E3050',
          // Primary accent — Bloomberg-inspired orange
          orange:      '#FF6D2A',
          'orange-dim': 'rgba(255,109,42,0.10)',
          'orange-mid': 'rgba(255,109,42,0.20)',
          // Secondary accent — SONAR electric cyan
          cyan:        '#00CFEB',
          'cyan-dim':  'rgba(0,207,235,0.09)',
          // Semantic
          green:       '#00E676',
          'green-dim': 'rgba(0,230,118,0.09)',
          red:         '#FF3A3A',
          'red-dim':   'rgba(255,58,58,0.09)',
          amber:       '#FFA800',
          'amber-dim': 'rgba(255,168,0,0.09)',
          // Text hierarchy
          white:  '#D0D9E8',
          muted:  '#4E6070',
          dim:    '#2A3545',
          xdim:   '#152030',
        },
        accent: {
          green:  '#00E676',
          red:    '#FF3A3A',
          amber:  '#FFA800',
          blue:   '#3b82f6',
          purple: '#8b5cf6',
          cyan:   '#00CFEB',
          orange: '#FF6D2A',
          pink:   '#ec4899',
        },
        severity: {
          critical: '#FF3A3A',
          high:     '#FF6D2A',
          medium:   '#FFA800',
          low:      '#00E676',
        },
        signal: {
          buy:    '#00E676',
          sell:   '#FF3A3A',
          strong: '#00CFEB',
          edge:   '#a855f7',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'monospace'],
        sans: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'glow':         'glow 2s ease-in-out infinite alternate',
        'glow-red':     'glowRed 2s ease-in-out infinite alternate',
        'glow-cyan':    'glowCyan 1.5s ease-in-out infinite alternate',
        'glow-orange':  'glowOrange 1.5s ease-in-out infinite alternate',
        'slide-in':     'slideIn 0.18s ease-out',
        'slide-up':     'slideUp 0.25s ease-out',
        'fade-in':      'fadeIn 0.25s ease-out',
        'shimmer':      'shimmer 2s linear infinite',
        'pulse-ring':   'pulseRing 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'border-flow':  'borderFlow 3s linear infinite',
        'blink':        'blink 1s step-end infinite',
      },
      keyframes: {
        glow: {
          '0%':   { boxShadow: '0 0 4px rgba(0,230,118,0.3)' },
          '100%': { boxShadow: '0 0 14px rgba(0,230,118,0.6)' },
        },
        glowRed: {
          '0%':   { boxShadow: '0 0 4px rgba(255,58,58,0.2)' },
          '100%': { boxShadow: '0 0 12px rgba(255,58,58,0.5)' },
        },
        glowCyan: {
          '0%':   { boxShadow: '0 0 4px rgba(0,207,235,0.2)' },
          '100%': { boxShadow: '0 0 10px rgba(0,207,235,0.4)' },
        },
        glowOrange: {
          '0%':   { boxShadow: '0 0 4px rgba(255,109,42,0.25)' },
          '100%': { boxShadow: '0 0 14px rgba(255,109,42,0.55)' },
        },
        slideIn: {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%':   { transform: 'scale(0.95)', opacity: '1' },
          '70%':  { transform: 'scale(1.15)', opacity: '0' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        borderFlow: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
      backgroundImage: {
        'gradient-radial':    'radial-gradient(var(--tw-gradient-stops))',
        'shimmer-gradient':   'linear-gradient(90deg,transparent,rgba(255,255,255,0.03),transparent)',
      },
    },
  },
  plugins: [],
};
