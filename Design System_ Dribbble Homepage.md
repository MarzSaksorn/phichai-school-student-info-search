---
name: Dribbble Homepage
colors:
  canvas: "#FFFFFF"
  ink: "#17151F"
  muted_ink: "#6F6B78"
  accent_pink: "#EA4C89"
  accent_lime: "#D8F05A"
  soft_pink: "#FFF3F8"
  dark_surface: "#191720"
  border: "#E9E7EC"
---

# Design System: Dribbble Homepage
**Source:** https://dribbble.com/
**Extraction note:** This document is extracted from the publicly rendered Dribbble homepage and its available HTML/CSS metadata, not from a local frontend repository. Exact values that are not exposed as stable design tokens are marked as visual approximations.

## 1. Visual Theme & Atmosphere

Dribbble presents itself as a polished creative marketplace: bright, editorial, and highly visual, with enough product structure to support searching, hiring, publishing, saving, and browsing. The base is an open white canvas that lets portfolio imagery carry the color. Navigation and utility controls stay compact and dark, while pink is reserved for emphasis and selected language. The overall mood is confident and contemporary rather than playful or decorative.

The page balances a large, assertive hero statement with a dense stream of visual work. Its design language is intentionally close to a creative publication: oversized display typography, short promotional copy, compact metadata, and image-led cards. Generous horizontal breathing room is used around the hero, while the discovery area becomes more information-dense through tabs, search, popular tags, filters, and a multi-column grid.

## 2. Color Palette & Roles

### Primary Foundation

- **Paper White — `#FFFFFF`**: Main page canvas and the dominant background. The HTML exposes white as the page theme color.
- **Ink Black — `#17151F`**: Approximate primary text and navigation color. It reads as a soft near-black rather than absolute black.
- **Charcoal Surface — `#191720`**: Dark pill/button surface and high-contrast control background.
- **Hairline Gray — `#E9E7EC`**: Approximate divider, input, and subdued border color.

### Accent & Interactive

- **Dribbble Pink — `#EA4C89`**: Primary emphasis color for highlighted hero words, selected/active moments, and attention-drawing UI. Use sparingly so the pink remains a signal.
- **Acid Lime — `#D8F05A`**: Visual accent used in portfolio imagery and framing treatments. It works as a secondary creative accent rather than a general-purpose action color.
- **Soft Blush — `#FFF3F8`**: Approximate pale-pink promotional banner background, creating a light tonal break without introducing a heavy panel.

### Typography & Text Hierarchy

- **Primary text — `#17151F`**: Hero heading, navigation, card titles, and primary labels.
- **Secondary text — `#6F6B78`**: Supporting copy, metadata, muted navigation, and explanatory text.
- **Inverse text — `#FFFFFF`**: Text inside dark primary controls.

### Functional States

- **Success / confirmation — `#EAF7C4`**: Use a pale lime tint for positive confirmation or completed actions, harmonizing with the site’s creative lime accent.
- **Focus / active — `#EA4C89`**: Use the pink accent for visible keyboard focus or active selection, with a white or pale-pink halo where needed.
- **Error — `#C83B58`**: A restrained berry-red that remains distinct from the brand pink.
- **Informational neutral — `#F4F3F6`**: Quiet gray surface for non-promotional notices and secondary controls.

## 3. Typography Rules

### Hierarchy & Weights

The live page preloads **Mona Sans** and **WF Visual Sans** for the product interface. It also references **Source Serif 4** and **IBM Plex Mono** for supporting creative/editorial contexts. The interface should primarily use Mona Sans or WF Visual Sans: both read as contemporary, clean, and screen-optimized.

- **Display / hero heading:** approximately 56–64px on desktop, 700–800 weight, around 0.98–1.05 line height. Keep the measure narrow enough to create a strong two-line statement. Emphasized words may switch to Dribbble Pink.
- **Section heading:** approximately 28–36px, 700 weight, tight line height.
- **Card title:** approximately 14–16px, 600–700 weight, compact line height.
- **Body and feature bullets:** approximately 14–16px, 400–500 weight, 1.45–1.6 line height.
- **Navigation and utility labels:** approximately 13–14px, 600 weight. Keep labels short and avoid excessive tracking.
- **Metadata / counters:** approximately 12–13px, 500–600 weight, muted ink.
- **Mono accent:** IBM Plex Mono at 11–12px, 500 weight for technical tags, dimensions, or compact categorization when an explicit editorial/technical cue is useful.
- **Serif accent:** Source Serif 4 at 20–28px for occasional editorial pull quotes or campaign language, not for the primary application chrome.

### Spacing Principles

The system follows a compact 4px/8px rhythm. Use 8px as the base increment, with 12px and 16px for control internals, 24px for card and section gaps, and 40–64px for major layout breathing room. Headings should feel visually close to their supporting copy, while major section transitions should have clearly larger whitespace.

## 4. Component Stylings

### Buttons

Primary actions are dark, rounded pills with white text and a small icon or sparkle cue. Use approximately 44–48px height, 16–22px horizontal padding, and a 999px radius. The visual intent is confident and direct, not glossy. Hover states should brighten the surface slightly or lift it by 1–2px; avoid dramatic shadows. Secondary actions can use white with a thin gray border or a soft-pink tint. Pink is best used for emphasis within content rather than turning every button pink.

### Cards & Portfolio Containers

Portfolio cards are image-first and visually generous. Use a large rounded image container, approximately 12–18px radius, with overflow hidden and no heavy border. The page relies on the work itself for visual richness, so card chrome should be minimal. Metadata sits outside or directly below the image in a compact row with a title, creator/avatar, status badge, and engagement counters. Hover may reveal save/contact affordances, but the default state remains clean.

Some featured work can receive a colored frame or background treatment, especially acid lime, pale blue, blush, or charcoal. These treatments should feel like part of the artwork presentation rather than a generic dashboard card.

### Navigation

The desktop header is a compact horizontal bar: Dribbble wordmark at left, Explore/Hire Talent/Get Hired/Community in the central navigation, and Sign up / Log in on the right. Use a white background with dark text and generous side padding. Dropdown indicators are small and quiet. The Log in control is a dark pill; Sign up is a lighter text action.

The discovery navigation uses tab-like categories—Shots, Designers, Services—followed by a wide search field and a Popular filter. Maintain a clear hierarchy: section choice first, search second, sort/filter third. On smaller screens, collapse secondary navigation and preserve the search and primary browse intent.

### Inputs & Forms

The main search field is wide, horizontal, and visually quiet. Use a white or very pale surface, a subtle gray outline, 12–16px radius, and a pink search/action icon at the trailing edge. Placeholder text should be muted and sentence case. Focus should use a visible pink or dark outline plus a soft halo; do not rely on color alone.

### Domain-Specific Components

- **Hero service pitch:** A two-column block with a large left-aligned headline, a short three-item benefit list with pink check marks, and a dark pill CTA. The right side contains a framed featured visual with a rounded lime-toned edge and a compact creator badge.
- **Popular discovery strip:** A horizontal list of search topics such as dashboard, landing page, mobile app, portfolio, ecommerce, animation, illustration, and onboarding. Treat these as lightweight text links with a clear active/hover color rather than filled chips.
- **Shot tile metadata row:** A creator avatar/name, optional PRO badge, save/contact affordances, and engagement counters. Keep this row smaller and quieter than the artwork.

## 5. Layout Principles

### Grid & Structure

Use a centered responsive container with approximately 32–56px edge padding on desktop and 20px on mobile. The hero is a two-column layout with a text block around 45–50% width and a featured visual around 40–45% width. The work feed uses a fluid multi-column grid: four columns at wide desktop, three at medium desktop/tablet, and one or two columns on smaller screens depending on available width.

The page has a clear vertical sequence: global header, promotional banner, hero pitch, creator/social proof strip, discovery tabs, search and filters, then the shot grid. Do not introduce heavy sidebar chrome on the homepage.

### Whitespace Strategy

The hero receives generous top and bottom space, approximately 56–88px on desktop. The discovery feed is denser, using 20–32px grid gaps. Cards should have enough separation to let each image read as an individual piece, while the overall page should still feel browseable and active.

### Alignment & Visual Balance

The hero headline and benefits are left-aligned. The featured image balances the text block on the right and should have a strong rectangular silhouette with rounded corners. The feed aligns to a shared container edge. Keep controls on a single baseline where possible and preserve consistent image aspect ratios across the grid.

The visual hierarchy is primarily: artwork/image, hero headline, action, card title, then creator and engagement metadata. Promotional UI should not overpower the work feed.

### Responsive Behavior & Touch

The layout should be mobile-first in implementation even though the desktop composition is the reference. Collapse the hero to one column, move the image below the CTA, allow discovery tabs to scroll horizontally, and keep search full width. Preserve at least 44px touch targets for primary buttons, tab controls, and save/contact actions. Avoid shrinking card metadata below comfortable reading size; reduce columns before reducing type.

## 6. Design System Notes for Stitch Generation

### Language to Use

Describe the system as a bright, editorial creative marketplace with a white canvas, near-black typography, restrained Dribbble pink accents, rounded image-led portfolio cards, and confident pill-shaped actions. Ask for contemporary screen typography, a generous hero, and a dense but breathable discovery grid. Avoid gradients, glassmorphism, neon glow, excessive shadows, and generic SaaS dashboard styling.

### Color References

Use Paper White `#FFFFFF` as the canvas; Ink Black `#17151F` for text; Charcoal Surface `#191720` for primary controls; Dribbble Pink `#EA4C89` for emphasis; Soft Blush `#FFF3F8` for promotional surfaces; Acid Lime `#D8F05A` as a selective creative frame/accent; and Hairline Gray `#E9E7EC` for borders and quiet separators.

### Component Prompts

1. “Create a Dribbble-inspired creative marketplace homepage with a compact white header, dark rounded login button, pale-pink promotion banner, and a two-column hero. Use a large near-black heading with one phrase in vivid pink, three short benefit bullets with pink check marks, and a dark pill CTA. Pair it with a colorful rounded featured portfolio visual framed by acid lime.”
2. “Create a portfolio discovery feed with Shots / Designers / Services tabs, a wide search field, popular topic links, and a responsive four-column shot grid. Make the artwork dominant, use rounded image containers, minimal card chrome, compact creator metadata, small PRO badges, and quiet engagement counters.”
3. “Restyle the interface as a polished editorial design community: Mona Sans or a similar contemporary sans for UI, optional Source Serif 4 for editorial accents, white space, near-black type, restrained pink emphasis, subtle gray borders, and no gradients or glass effects.”

### Incremental Iteration

Start with the spacing and hierarchy before adding decorative detail: header, hero split, discovery controls, then card grid. Keep the hero heading large and short. If the page feels too generic, strengthen the editorial contrast by increasing display type scale, using pink only on selected words and icons, and giving the featured visual a stronger colored frame. If it feels too dense, increase section whitespace rather than adding more card decoration. Verify mobile behavior by collapsing the hero, keeping search visible, and preserving comfortable touch targets.

## References

- [1]: https://dribbble.com/ "Dribbble homepage"
