---
name: Atmospheric Precision
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#b9cbbc'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#849587'
  outline-variant: '#3b4a3f'
  surface-tint: '#00e38b'
  primary: '#f4fff3'
  on-primary: '#00391f'
  primary-container: '#00ff9d'
  on-primary-container: '#007143'
  inverse-primary: '#006d40'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#fefbfb'
  on-tertiary: '#303030'
  tertiary-container: '#e1dfde'
  on-tertiary-container: '#636262'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#56ffa8'
  primary-fixed-dim: '#00e38b'
  on-primary-fixed: '#002110'
  on-primary-fixed-variant: '#00522f'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e4e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 64px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin: 40px
  unit: 8px
---

## Brand & Style

This design system is built to evoke the intensity and focus of high-stakes environmental monitoring. The personality is professional, urgent, and technically precise. It prioritizes data clarity against a heavy, atmospheric backdrop to create a "command center" aesthetic.

The visual style is a fusion of **Modern Minimalism** and **High-Contrast Bold**. It relies on deep obsidian surfaces to provide an infinite sense of depth, allowing the neon green accents to pierce through the interface like tactical readouts. The goal is to make the user feel equipped with powerful, specialized tools.

## Colors

The palette is strictly monochromatic with a singular, high-vibrancy accent. 

- **Primary (#00FF9D):** Reserved exclusively for critical actions, active states, and data highlights. This color should be treated as a "light source" within the UI.
- **Surface Tiers:** The background uses a pure black (#0A0A0A) to maximize contrast. Secondary and tertiary greys are used for cards and nested containers to create structural hierarchy without introducing muddy tones.
- **Typography:** Headlines utilize pure white for maximum legibility, while secondary labels use a 60% opacity white to recede into the background.

## Typography

This design system utilizes **Manrope** for its core communication due to its geometric yet readable structure. It provides the "modern sans-serif" look requested while maintaining a technical edge.

For supplementary data, metadata, and "tech-readout" labels, **Space Grotesk** is introduced. Its wider apertures and monospaced-adjacent feel reinforce the storm-tracking, data-heavy narrative. 

- **Display Text:** Use heavy weights and tight tracking for a bold, impactful presence.
- **Labels:** Use uppercase Space Grotesk for secondary info (e.g., timestamps, coordinates, or category tags) to differentiate from narrative body text.

## Layout & Spacing

The layout follows a **Fixed Grid** model on desktop to maintain a controlled, editorial feel, while transitioning to a fluid model on smaller viewports. 

A strict 8px spacing power-of-two scale is applied to all margins and padding to ensure mathematical harmony. Large vertical gaps (80px–120px) are encouraged between major sections to let the moody background imagery breathe and to prevent the interface from feeling cluttered or claustrophobic.

## Elevation & Depth

In this dark environment, depth is achieved through **Tonal Layers** and **Subtle Blooms**.

- **Surfaces:** Higher-elevation elements (like cards or modals) are indicated by lighter grey fills (#1A1A1A or #262626), never by traditional drop shadows.
- **Glow Effects:** Primary buttons and active data points utilize a subtle "bloom" (a soft, blurred outer glow using the primary #00FF9D color at 20% opacity) to simulate the look of an illuminated screen.
- **Borders:** Use low-contrast 1px strokes (#333333) to define boundaries on secondary elements, keeping the UI sharp and technical.

## Shapes

The shape language is **Soft** but disciplined. A 4px (0.25rem) base radius is applied to standard UI elements like input fields and cards to prevent the interface from feeling overly aggressive or "brutalist."

Interactive components like buttons may occasionally use a fully pill-shaped radius to distinguish them as primary touchpoints, but the overarching architectural elements should remain subtly rounded to maintain a serious, high-tech tone.

## Components

- **Buttons:** Primary buttons feature a solid #00FF9D fill with black text. Secondary buttons should use a ghost style (1px border in #00FF9D or white) to ensure the primary action remains the brightest point on the screen.
- **Inputs:** Darker than the surface they sit on, using a 1px border that glows (changes to #00FF9D) upon focus.
- **Cards:** Borderless with a #1A1A1A background. Content inside cards should follow a strict alignment to the internal grid.
- **Data Visualizations:** Charts and graphs should exclusively use the primary neon green for the data lines, with muted grey grids to keep the focus on the metrics.
- **Status Indicators:** Use the primary neon green for "Active" or "Safe" states. For "Danger" or "Alert" states, use a high-chroma Red, but keep it sparse to protect the brand's primary color identity.