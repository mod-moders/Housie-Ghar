# Housie Ghar: Website Theme & Design System Specification

This document defines the branding guidelines, visual styling, color systems, typography, and frontend CSS recipes for **Housie Ghar**. The design system establishes a high-energy, modern game-like interface utilizing a **default Dark Mode** and pop-art elements that match the visual character of the company's logos.

---

## 1. Core Brand Aesthetics & Design Principles

The user interface must look premium, modern, and exciting, avoiding plain gray templates or typical enterprise dashboards.
1.  **The Game is the Hero:** All UI layout choices are built around active draw sessions. Dynamic data (called numbers, highlighted ticket matrices, and drawn cage indicators) are emphasized with high contrast.
2.  **Warm Confidence:** The design combines rich dark backdrops (simulating premium casino felt) with bright, energetic pop-art borders and stars. It avoids clean, clinical minimalism in favor of a festive community event aesthetic.
3.  **Visual Transparency:** Progress bars, ticket grids, countdown timers, and booking notifications are animated and fully visible, establishing trust and clarity.
4.  **Mobile-First Execution:** Because players participate primarily on their phones, the layout priority is optimized for small screens, using responsive sticky elements for checks and CTA triggers.

---

## 2. Color Palette & Typography

To ensure branding is consistent with the corporate logo assets, styling must adhere strictly to the following color tokens:

### A. The Core Color Tokens (Hex Mapping)
*   **Backdrop Base:** Deep Black/Charcoal (`#0B0B0C` to `#121214` radial gradient). Anchors the layouts and simulates a premium gaming table.
*   **Primary Neon Pink:** `#F43F5E` (sampled from the "HOUSIE" letters in the logo). Used for main headers, active page indicators, active draw highlighting, and winner celebration states.
*   **Secondary Electric Cyan:** `#06B6D4` (sampled from the "GHAR" letters in the logo). Used for ticket selection grids, live chat tags, loading indicators, and active number highlights.
*   **Action Gold / Yellow:** `#FBBF24` (sampled from the cage structure and comic stars). Reserved for major Call-to-Action (CTA) triggers (e.g., "BOOK NOW", "CONFIRM"), urgency alerts ("Fast Filling!"), and cage highlight rings.
*   **Success Green:** `#10B981` (sampled from the leaf elements in the logo). Used for "Available" ticket status, ledger credits, and successful bookings.
*   **Muted Slate Grey:** `#4B5563` to `#374151`. Used for "Sold Out" grayscales and disabled/unclickable fields.

### B. Typography Definitions
*   **Display Headers & Titles:** Large, heavy, rounded sans-serif font family (e.g., *Outfit* or *Lexend Deca*) styled with a prominent retro comic shadow:
    ```css
    text-shadow: 3px 3px 0px #000000, 4px 4px 10px rgba(244, 63, 94, 0.4);
    ```
*   **Data & Numbers:** High-contrast monospaced font family (e.g., *DM Mono* or *JetBrains Mono*) for number cells, ticket matrices, countdown intervals, and wallet ledgers.

---

## 3. UI Component Styles

### A. Glassmorphic Navigation Bar
*   **Placement:** Fixed at the top of the screen (`sticky top-0 z-50`).
*   **Styling:** Semi-transparent base with background blur, matching a gaming console overlay:
    ```css
    background: rgba(11, 11, 12, 0.75);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    ```
*   **Assets:** The circular spinning **Logo 1** badge sits on the left side of the navbar, and a pulsing neon key icon routing to the **Staff Login** is on the far right.

### B. Pop-Art Game Cards
*   **Normal State:** Rounded rectangular panels with a deep indigo (`#1E1B4B`) backdrop, sharp borders, and a neon blue glow.
*   **Urgency State (>= 80% capacity):** Border shifts to a pulsing pink-to-gold gradient, and the card tilts slightly (`hover:rotate-1`).
*   **Sold Out State:** Visual opacity drops to `0.5` with a grayscale filter overlay, and a bold, thick-bordered diagonal "SOLD OUT" badge spans the card center.

### C. Selection Grid Cells
*   **Available:** Clean, dark container with thin green borders that glow on hover.
*   **Locked:** Pulsing warm amber container (`#FBBF24`) displaying a lock icon and a mini loading spinner.
*   **Sold:** Solid gray container with strikethrough text, fully disabled from click interactions.

---

## 4. Animations & Micro-Interactions

### A. 3D Gold Tambola Cage (Logo 1 Model)
*   **Placement:** Displayed in the center of the Live Game room.
*   **Behavior:** Features a 3D hexagonal cage wireframe that spins rapidly for 0.6 seconds when a new draw is triggered.
*   **Ball Pop-out:** The called number ball pops out from the center, scaling up (`transform: scale(2.5)`) and fading into focus, then translating smoothly into the called-numbers tray.

### B. Pop-Art Explosion Win Overlay
*   **Trigger:** Fires the millisecond the win engine registers a winning ticket.
*   **Visual Sequence:**
    1.  **Yellow Comic Burst:** An SVG pop-art yellow burst (matching Logo 2's backdrop outline) explodes from the screen center, scaling with an elastic ease effect.
    2.  **Star Rain:** Small yellow and pink stars eject from the burst center, flying outwards with CSS rotation offsets and gravity physics before fading out.
    3.  **Winner Title:** The winner's "Housie Name" scales up in Neon Pink with a thick drop shadow, accompanied by a pulsing neon banner displaying the claim amount.

### C. Live Emoji Reaction Stream
*   **Behavior:** Floating icons (🔥, 👏, 🎉, 🤩) float up the screen and drift horizontally using a sine-wave path.
*   **Performance:** Run via fire-and-forget CSS animations to avoid database updates or main-thread rendering lag.

---

## 5. CSS Implementation Recipes

Developers must implement the design using these custom CSS recipes:

### Recipe 1: Neon Pulsing Borders
```css
/* Neon Pulsing Rings for Game Cards and Selection Modals */
.neon-glow-cyan {
    border: 2px solid #06B6D4;
    box-shadow: 0 0 5px #06B6D4, 
                0 0 15px rgba(6, 182, 212, 0.4), 
                inset 0 0 5px rgba(6, 182, 212, 0.2);
    animation: cyanPulse 2s infinite alternate;
}

.neon-glow-pink {
    border: 2px solid #F43F5E;
    box-shadow: 0 0 5px #F43F5E, 
                0 0 15px rgba(244, 63, 94, 0.4), 
                inset 0 0 5px rgba(244, 63, 94, 0.2);
    animation: pinkPulse 2s infinite alternate;
}

@keyframes cyanPulse {
    0% { box-shadow: 0 0 4px #06B6D4, 0 0 8px rgba(6, 182, 212, 0.3); }
    100% { box-shadow: 0 0 8px #06B6D4, 0 0 20px rgba(6, 182, 212, 0.6); }
}

@keyframes pinkPulse {
    0% { box-shadow: 0 0 4px #F43F5E, 0 0 8px rgba(244, 63, 94, 0.3); }
    100% { box-shadow: 0 0 8px #F43F5E, 0 0 20px rgba(244, 63, 94, 0.6); }
}
```

### Recipe 2: Pop-Art Comic Buttons
```css
/* Comic styled button with offsets, drop-shadow, and color shifts */
.btn-pop-art {
    background-color: #FBBF24; /* Yellow Gold */
    color: #0B0B0C;
    font-family: 'Lexend Deca', sans-serif;
    font-weight: 900;
    border: 4px solid #000000;
    border-radius: 8px;
    box-shadow: 4px 4px 0px #000000;
    transition: transform 0.1s ease, box-shadow 0.1s ease;
    position: relative;
    overflow: hidden;
}

.btn-pop-art:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0px #000000;
    background-color: #F43F5E; /* Turns Neon Pink on Hover */
    color: #FFFFFF;
}

.btn-pop-art:active {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0px #000000;
}
```

### Recipe 3: Ticket Cell Cross-Out Highlight
```css
/* Visual highlight when a ticket number matches a drawn value */
.ticket-cell-hit {
    position: relative;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, rgba(18, 18, 20, 0) 70%);
    color: #10B981 !important; /* Green */
    font-weight: bold;
}

.ticket-cell-hit::before {
    content: "✕"; /* Classic pen-cross marker */
    position: absolute;
    font-size: 2.2rem;
    color: rgba(244, 63, 94, 0.75); /* Neon pink pen mark */
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-10deg);
    animation: penInkDraw 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

@keyframes penInkDraw {
    0% { transform: translate(-50%, -50%) rotate(-45deg) scale(0); opacity: 0; }
    100% { transform: translate(-50%, -50%) rotate(-10deg) scale(1); opacity: 1; }
}
```

### Recipe 4: Floating Reactions Animation
```css
/* Sine-wave reaction float engine */
.emoji-reaction-float {
    position: absolute;
    bottom: 0;
    pointer-events: none;
    animation: floatUp 3s ease-out forwards;
}

@keyframes floatUp {
    0% { 
        transform: translateY(0) translateX(0) scale(1); 
        opacity: 0; 
    }
    10% { 
        opacity: 1; 
    }
    90% { 
        opacity: 1; 
    }
    100% { 
        transform: translateY(-80vh) translateX(var(--oscillation)) scale(1.6); 
        opacity: 0; 
    }
}
```
