---
name: Aurelian Forest
colors:
  surface: '#fff9eb'
  surface-dim: '#e0dac7'
  surface-bright: '#fff9eb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf3e0'
  surface-container: '#f4eedb'
  surface-container-high: '#efe8d5'
  surface-container-highest: '#e9e2d0'
  on-surface: '#1e1c10'
  on-surface-variant: '#424843'
  inverse-surface: '#333024'
  inverse-on-surface: '#f7f0de'
  outline: '#727973'
  outline-variant: '#c1c8c2'
  surface-tint: '#456553'
  primary: '#032416'
  on-primary: '#ffffff'
  primary-container: '#1a3a2a'
  on-primary-container: '#82a48f'
  inverse-primary: '#abcfb8'
  secondary: '#7c5800'
  on-secondary: '#ffffff'
  secondary-container: '#ffc656'
  on-secondary-container: '#745200'
  tertiary: '#2a1d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#443100'
  on-tertiary-container: '#c2962b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c7ebd4'
  primary-fixed-dim: '#abcfb8'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#2d4d3c'
  secondary-fixed: '#ffdea7'
  secondary-fixed-dim: '#f5be4f'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5e4200'
  tertiary-fixed: '#ffdf9f'
  tertiary-fixed-dim: '#f0c052'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5c4300'
  background: '#fff9eb'
  on-background: '#1e1c10'
  surface-variant: '#e9e2d0'
  forest-deep: '#0a1d14'
  forest-mid: '#24503a'
  parchment-dark: '#f5e9c8'
  ink: '#0a0d0f'
  success-green: '#2ecc71'
  urgent-red: '#e74c3c'
  warning-amber: '#f39c12'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '900'
    lineHeight: '1.1'
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '900'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  metric-mono:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1'
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Outfit
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  label-uppercase:
    fontFamily: Sora
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 1.5px
  data-table:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1200px
  gutter: 16px
---

## Brand & Style

The design system is a sophisticated blend of "Parchment and Ink" heritage and high-tech performance. It is designed to evoke a sense of prestigious stability, appealing to a mature demographic (25-60) while maintaining the snappy responsiveness of a modern digital tool. 

The aesthetic is **Modern Traditionalist**. It leverages the organic warmth of a physical club environment—using rich greens and gold accents—and pairs it with the precision of developer-grade data visualization. 

**Design Principles:**
- **Tactile Depth:** Interfaces should feel physical. This is achieved through a subtle fractal noise (grain) overlay and layering that mimics stacked high-quality paper or glass.
- **Elite Precision:** Use of monospaced fonts for numerical data ensures that financial and gaming figures are treated with the seriousness of a trading terminal.
- **Warm Authority:** The color palette avoids clinical whites and harsh blacks, opting instead for cream neutrals and deep forest greens to build long-term trust.

## Colors

The palette is anchored by **Deep Forest Green** (Primary) and **Rich Gold** (Secondary). 

- **Primary & Surface:** Use `#fdf6e3` (Cream) for main page backgrounds to reduce eye strain and provide a "parchment" feel. In dark-mode specific modules (like Agent or Superadmin consoles), transition to `#0a0d0f` (Ink) as the base, using Forest Green for headers and interactive surfaces.
- **Accents:** Gold is used sparingly for primary actions, branding, and high-value metrics. It should never be used for large backgrounds; instead, use it for borders, icons, and text highlights.
- **Semantic Colors:** Green, Red, and Amber are used for status and financial deltas. These should be paired with low-opacity background "glows" (e.g., `rgba(success-green, 0.1)`) to maintain the tactile theme.

## Typography

This design system uses a tri-font strategy to balance character and clarity:
1. **Playfair Display (Serif):** Reserved for brand expression, page titles, and high-level card headers. It signals tradition and premium quality.
2. **Outfit (Sans-Serif):** The primary workhorse for UI instructions, body copy, and navigation. It provides a modern, geometric contrast to the serif.
3. **JetBrains Mono (Monospace):** Crucial for all "dynamic" data including ticket numbers, currency, timestamps, and IDs. It ensures alignment and high legibility in data-dense dashboards.

**Styling Rules:**
- All section labels (e.g., "RECENT ACTIVITY") must be in `label-uppercase` using the **Sora** font.
- Hero headlines should use a tight line-height to emphasize the thick strokes of the serif.

## Layout & Spacing

The system follows an **8px grid rhythm** (with 4px sub-steps for micro-adjustments).

- **Grid Model:** A 12-column fluid grid is used for desktop. For data-heavy dashboards (Agent/Admin), use a **fixed-sidebar + fluid-content** model. The sidebar remains at 240px (desktop) and collapses to 64px (tablet).
- **Margins:** Main content containers use 32px padding on desktop, 24px on tablet, and 16px on mobile.
- **Spacing Logic:** Use `lg` (24px) to separate distinct functional sections and `md` (16px) for internal card padding. Use `sm` (8px) for related elements like a label and its input field.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism**, rather than heavy drop shadows.

- **The Layered Stack:** 
    1. **Level 0 (Background):** Cream parchment (Light) or Deep Ink (Dark).
    2. **Level 1 (Cards):** Use a 1px border (`parchment-dark` or `rgba(255,255,255,0.07)`) with a flat background.
    3. **Level 2 (Active/Hover):** Apply a soft ambient shadow: `0 8px 32px rgba(26,58,42,0.12)`.
- **Glassmorphism:** Overlays, Modals, and Sticky Headers must use `backdrop-filter: blur(12px)` with a semi-transparent surface (`rgba(255,255,255,0.7)` for light mode or `rgba(10, 13, 15, 0.8)` for dark mode).
- **Texture:** Apply a global SVG fractal noise filter at `0.04` opacity to all `body` elements to give the UI a tangible, printed-on-paper quality.

## Shapes

The shape language is refined and approachable.
- **Standard Cards:** Use `rounded-lg` (16px) to create a soft, friendly container.
- **Buttons & Inputs:** Use `rounded-md` (10px) to provide a more structured, tool-like feel.
- **Pills/Badges:** Always use the `99px` (Pill) setting for status indicators and category tags.
- **Focus States:** Use a 2px offset border in `secondary-color_hex` (Gold) for all interactive focus states.

## Components

- **Buttons:**
    - *Primary:* Solid Forest Green with Gold text. Uses a subtle vertical gradient from `forest-mid` to `forest-deep`.
    - *Secondary:* Ghost style with a 1.5px Forest Green border and Gold text.
    - *CTA (Golden):* Reserved for "Buy" or "Live" actions. Solid Gold background with Ink text.
- **Cards:** White or Cream-tinted surfaces. All cards must have a 1px solid border in `parchment-dark`.
- **Inputs:** Backgrounds should be a shade darker than the page background. Labels are `label-uppercase`. Use `JetBrains Mono` for number-only inputs.
- **Chips & Pills:** Use "dim" backgrounds (10-15% opacity of the status color) with high-saturation text for the status (e.g., a "Live" badge has a `rgba(urgent-red, 0.1)` background and solid `urgent-red` text).
- **HUD/Data Cells:** Specifically for the game interfaces, use dark surfaces with monospaced text and a 1px gold border to denote active selections or "winning" numbers.