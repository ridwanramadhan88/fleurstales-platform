/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Inter Tight"', 'Inter', 'sans-serif'],
      },
      // Nudge the two smallest steps of the type scale up. This app used
      // text-xs (12px) and text-sm (14px) for a lot of primary UI copy, not
      // just fine print, which read as too small on real screens. Bumping
      // the scale here fixes every call site at once instead of hand-editing
      // the ~225 places that reference these utilities.
      fontSize: {
        // '2xs' formalizes the caption/micro-label size that was previously
        // hand-typed as a dozen near-identical arbitrary values
        // (text-[0.7rem]…text-[0.78rem]) across almost every page. Collapsing
        // them into one token is what actually makes captions look
        // consistent from screen to screen.
        '2xs': ['0.75rem', { lineHeight: '1rem' }], // 12px
        xs: ['0.8125rem', { lineHeight: '1.15rem' }], // 13px (was 12px)
        sm: ['0.9375rem', { lineHeight: '1.4rem' }], // 15px (was 14px)
      },
      boxShadow: {
        'ios-sm': '0 1px 2px hsl(240 30% 30% / 0.05), 0 1px 1px hsl(240 30% 30% / 0.03)',
        'ios': '0 1px 2px hsl(240 30% 30% / 0.04), 0 10px 24px -6px hsl(240 30% 30% / 0.10)',
        'ios-lg': '0 2px 4px hsl(240 30% 30% / 0.05), 0 20px 48px -12px hsl(240 30% 30% / 0.18)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          page: 'hsl(var(--surface-page))',
          card: 'hsl(var(--surface-card))',
          panel: 'hsl(var(--surface-panel))',
          track: 'hsl(var(--surface-track))',
          selected: 'hsl(var(--surface-selected))',
          footer: 'hsl(var(--surface-footer))',
          popover: 'hsl(var(--surface-popover))',
          neutral: 'hsl(var(--surface-neutral-badge))',
          warning: 'hsl(var(--surface-warning))',
          success: 'hsl(var(--surface-success))',
          info: 'hsl(var(--surface-info))',
          error: 'hsl(var(--surface-error))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        // Full ladder derived from --radius so every corner in the app
        // scales together when the token changes. `xs` formalizes the 8px
        // radius that was previously hand-typed as `rounded-[8px]` in ~15
        // files; `sm` likewise replaces the equivalent `rounded-[10px]`.
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xs: 'calc(var(--radius) - 6px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
