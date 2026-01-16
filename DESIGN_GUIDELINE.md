# Game Creator - Design Guideline

## Design Philosophy

**"Kashiwa Sato × Nintendo"**
極限のミニマル × 遊び心 × 本物のガラス

---

## 1. Color Palette

### Primary Color (Signature Red)
Nintendo Redをモダンに解釈したアクセントカラー

| Name | Value | Usage |
|------|-------|-------|
| `--red` | `#FF3B30` | Primary buttons, accents, user messages |
| `--red-light` | `rgba(255, 59, 48, 0.1)` | Hover backgrounds, focus rings |
| `--red-glow` | `rgba(255, 59, 48, 0.4)` | Box shadows, glowing effects |

### Neutral Grays
クリーンでプロフェッショナルなグレースケール

| Name | Value | Usage |
|------|-------|-------|
| `--white` | `#FFFFFF` | Backgrounds, cards |
| `--black` | `#000000` | Code blocks |
| `--gray-50` | `#FAFAFA` | Card backgrounds (subtle) |
| `--gray-100` | `#F5F5F5` | Page background, dividers |
| `--gray-200` | `#E5E5E5` | Borders, disabled states |
| `--gray-400` | `#A3A3A3` | Placeholder text, subtle labels |
| `--gray-600` | `#525252` | Secondary text, icons |
| `--gray-900` | `#171717` | Primary text, headings |

### Semantic Colors
| Name | Value | Usage |
|------|-------|-------|
| Connected (Green) | `#10B981` / `#34C759` | Status indicators |
| Error | `--red` with light bg | Error messages, alerts |

### Glass Effect
すりガラス効果でモダンな奥行き感を演出

| Name | Value |
|------|-------|
| `--glass-white` | `rgba(255, 255, 255, 0.72)` |
| `--glass-white-strong` | `rgba(255, 255, 255, 0.88)` |
| `--glass-border` | `rgba(255, 255, 255, 0.5)` |
| `--glass-shadow` | `0 8px 32px rgba(0, 0, 0, 0.08)` |
| `--blur` | `24px` |

---

## 2. Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

### Font Weights
| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text |
| Medium | 500 | Labels, secondary text |
| Semi-bold | 600 | Buttons, emphasized text |
| Bold | 700 | Headings, important labels |
| Extra-bold | 800 | Hero headings |

### Font Sizes
| Size | Usage | Example |
|------|-------|---------|
| `0.6875rem` (11px) | Tiny labels, letter-spaced | "MY GAMES" section label |
| `0.75rem` (12px) | Hints, timestamps | "後から変更できます" |
| `0.8125rem` (13px) | Small buttons, status | Connection status |
| `0.875rem` (14px) | Form labels, secondary text | Form labels |
| `0.9375rem` (15px) | Message text, buttons | Chat messages |
| `1rem` (16px) | Body text, inputs | Input fields |
| `1.25rem` (20px) | Section headings | Modal titles |
| `1.75rem` (28px) | Hero headings | Login title |

### Letter Spacing
- **Tight** (`-0.02em` to `-0.03em`): Headings
- **Normal** (0): Body text
- **Wide** (`0.05em` to `0.15em`): Uppercase labels, brand text

### Monospace Font (Code)
```css
font-family: 'SF Mono', Monaco, monospace;
font-size: 0.8125rem;
```

---

## 3. Spacing System

8px Grid System を採用

| Token | Value | Usage |
|-------|-------|-------|
| `--s-4` | 4px | Micro spacing |
| `--s-8` | 8px | Small gaps |
| `--s-12` | 12px | Icon-text gaps |
| `--s-16` | 16px | Standard padding |
| `--s-24` | 24px | Section padding |
| `--s-32` | 32px | Large padding |
| `--s-48` | 48px | Hero sections |
| `--s-64` | 64px | Page margins |

---

## 4. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--r-8` | 8px | Small buttons, tags |
| `--r-12` | 12px | Inputs, cards |
| `--r-16` | 16px | Message bubbles, panels |
| `--r-24` | 24px | Modals, large cards |
| `--r-full` | 9999px | Pills, circular buttons |

---

## 5. Shadows

### Elevation Levels
```css
/* Level 1: Cards on hover */
box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);

/* Level 2: Floating buttons */
box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);

/* Level 3: Modals */
box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);

/* Level 4: Large modals */
box-shadow: 0 32px 80px rgba(0, 0, 0, 0.2);

/* Glass shadow */
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);

/* Red glow (primary buttons) */
box-shadow: 0 4px 12px rgba(255, 59, 48, 0.4);
```

---

## 6. Motion & Animation

### Easing
```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--duration: 0.4s;
```

### Standard Transitions
```css
/* Quick interactions */
transition: all 0.2s ease;

/* Smooth transitions */
transition: all 0.4s var(--ease-out);

/* Bouncy/playful */
transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Keyframe Animations
| Name | Usage |
|------|-------|
| `fadeIn` | General fade in |
| `slideUp` | Content appearing from below |
| `scaleIn` | Scale from 95% to 100% |
| `messageIn` | Chat message entrance |
| `modalFadeIn` | Modal overlay fade |
| `modalSlideUp` | Modal content slide up |
| `pulse` | Processing status |
| `squish-to-pill` | Create button morphing |

---

## 7. Components

### Primary Button (Red)
```css
background: var(--red);
color: var(--white);
border: none;
border-radius: var(--r-12); /* or --r-full for pill */
padding: var(--s-16) var(--s-24);
font-weight: 600;
box-shadow: 0 4px 12px var(--red-glow);

/* Hover */
transform: translateY(-2px);
box-shadow: 0 8px 24px var(--red-glow);
```

### Secondary Button (Ghost)
```css
background: var(--white);
border: 1px solid var(--gray-200);
color: var(--gray-600);
border-radius: var(--r-12);
padding: var(--s-16);

/* Hover */
background: var(--gray-100);
color: var(--gray-900);
```

### Icon Button
```css
width: 36px; /* or 40px */
height: 36px;
background: transparent;
border: none;
border-radius: var(--r-8);
color: var(--gray-400);

/* Hover */
background: var(--gray-100);
color: var(--gray-600);
```

### Input Field
```css
padding: var(--s-16);
background: var(--white);
border: 2px solid var(--gray-200);
border-radius: var(--r-12);
font-size: 1rem;

/* Focus */
border-color: var(--red);
box-shadow: 0 0 0 4px var(--red-light);
```

### Card
```css
background: var(--gray-50);
border-radius: var(--r-16);
padding: var(--s-24);
border: 1px solid transparent;

/* Hover */
background: var(--white);
border-color: var(--gray-200);
transform: translateY(-4px);
box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
```

### Modal
```css
/* Overlay */
background: rgba(0, 0, 0, 0.4);
backdrop-filter: blur(12px);

/* Content */
background: var(--white);
border-radius: var(--r-24);
box-shadow: 0 32px 80px rgba(0, 0, 0, 0.2);
```

### Glass Panel
```css
background: var(--glass-white);
backdrop-filter: blur(var(--blur));
-webkit-backdrop-filter: blur(var(--blur));
border: 1px solid var(--glass-border);
```

### Message Bubble (User)
```css
background: var(--red);
color: var(--white);
border-radius: var(--r-24);
border-bottom-right-radius: var(--r-8);
box-shadow: 0 4px 16px var(--red-glow);
```

### Message Bubble (Assistant)
```css
background: var(--glass-white-strong);
backdrop-filter: blur(16px);
border: 1px solid var(--glass-border);
color: var(--gray-900);
border-radius: var(--r-24);
border-bottom-left-radius: var(--r-8);
box-shadow: var(--glass-shadow);
```

### Tab
```css
padding: var(--s-16) var(--s-24);
background: transparent;
border: none;
border-bottom: 2px solid transparent;
color: var(--gray-400);
font-weight: 600;

/* Active */
color: var(--red);
border-bottom-color: var(--red);
```

### Status Indicator (Dot)
```css
width: 8px;
height: 8px;
background: #10B981;
border-radius: 50%;
box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
```

### Error State
```css
background: rgba(255, 59, 48, 0.1);
border: 1px solid rgba(255, 59, 48, 0.2);
color: var(--red);
```

---

## 8. Layout Patterns

### Header (Sticky Glass)
```css
position: sticky;
top: 0;
z-index: 100;
background: rgba(255, 255, 255, 0.9);
backdrop-filter: blur(20px);
border-bottom: 1px solid var(--gray-100);
```

### Grid
```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
gap: var(--s-16);
```

### Flex Container
```css
display: flex;
align-items: center;
gap: var(--s-12);
```

### Full-height View
```css
height: 100%;
height: 100dvh;
overflow: hidden;
```

---

## 9. Background

### Gradient Mesh
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 20% -10%, rgba(255, 59, 48, 0.15), transparent),
    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(255, 59, 48, 0.1), transparent),
    linear-gradient(180deg, var(--white) 0%, var(--gray-100) 100%);
  z-index: -1;
}
```

---

## 10. Interactive States

### Hover Effects
- **Buttons**: `transform: scale(1.02)` or `translateY(-2px)`
- **Cards**: `translateY(-4px)` + shadow increase
- **Icons**: Color change from `--gray-400` to `--gray-600`

### Focus States
- **Inputs**: Red border + 4px red light ring
- **Buttons**: Keyboard focus visible outline

### Active/Pressed
- **Buttons**: `transform: scale(0.98)` or `translateY(0)`

### Disabled States
- **Buttons**: `background: var(--gray-200)`, `color: var(--gray-400)`, `cursor: not-allowed`
- **Inputs**: Lower opacity, no focus ring

---

## 11. Icons

### Style
- **Stroke-based** (not filled)
- **Stroke width**: 2px (1.5px for larger icons)
- **Size**: 16px, 18px, 20px, 24px (common sizes)

### Library
Feather Icons style (custom SVG inline)

---

## 12. Responsive Breakpoints

```css
@media (max-width: 480px)   /* Mobile */
@media (max-width: 768px)   /* Tablet */
@media (min-width: 1024px)  /* Desktop */
```

---

## 13. Design Principles Summary

1. **Red as Signature** - Use sparingly for maximum impact
2. **Glass Morphism** - Depth through blur and transparency
3. **Generous Whitespace** - Let elements breathe
4. **Subtle Motion** - Smooth, purposeful animations
5. **Clean Typography** - Inter font, tight headings, readable body
6. **Consistent Radius** - 8/12/16/24px system
7. **Shadow Hierarchy** - Deeper = more elevated
8. **Touch-friendly** - Minimum 44px touch targets
