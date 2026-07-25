"use strict";
/* ============================================================================
   Profile pictures, shared by both sister sites.

   The database still stores the SAME emoji string it always did, so nobody's
   existing choice breaks and there is nothing to migrate. The emoji is only an
   ID now — what gets drawn is the line drawing below.

   Two rules make one set work on both sites:

   1. Everything is `currentColor`, so each site tints them with its own ink —
      white on goi's black page, pink on the kanji site's pale one.
   2. Everything is drawn as OUTLINES, not solid shapes. The first attempt used
      filled silhouettes with the details layered on top at partial opacity;
      rendered out, those details were invisible, because same colour over same
      colour barely differs. Outlines let the page show through, so the face of
      a cat reads on any background without knowing what that background is.

   Drawn on a 64x64 grid, legible down to 24px.
   ========================================================================== */
const AVA_S = `fill="none" stroke="currentColor" stroke-width="4"
  stroke-linecap="round" stroke-linejoin="round"`;

const AVATARS = {
  "🌸": `<g ${AVA_S}>
      <path d="M32 32c0-9-4-15-4-19a4 4 0 0 1 8 0c0 4-4 10-4 19z"/>
      <path d="M32 32c0-9-4-15-4-19a4 4 0 0 1 8 0c0 4-4 10-4 19z" transform="rotate(72 32 32)"/>
      <path d="M32 32c0-9-4-15-4-19a4 4 0 0 1 8 0c0 4-4 10-4 19z" transform="rotate(144 32 32)"/>
      <path d="M32 32c0-9-4-15-4-19a4 4 0 0 1 8 0c0 4-4 10-4 19z" transform="rotate(216 32 32)"/>
      <path d="M32 32c0-9-4-15-4-19a4 4 0 0 1 8 0c0 4-4 10-4 19z" transform="rotate(288 32 32)"/>
    </g><circle cx="32" cy="32" r="3.5" fill="currentColor"/>`,

  "🐱": `<g ${AVA_S}>
      <path d="M16 26 13 11l12 7"/><path d="M48 26l3-15-12 7"/>
      <path d="M13 34a19 17 0 0 0 38 0 19 17 0 0 0-38 0z"/>
      <path d="M12 32H4M12 38l-8 3M52 32h8M52 38l8 3"/>
    </g>
    <g fill="currentColor"><circle cx="25" cy="31" r="2.6"/><circle cx="39" cy="31" r="2.6"/></g>
    <path d="M28 40c2 2 6 2 8 0" ${AVA_S}/>`,

  "🦊": `<g ${AVA_S}>
      <path d="M12 18 9 7l13 7"/><path d="M52 18l3-11-13 7"/>
      <path d="M10 20c0 18 10 30 22 34 12-4 22-16 22-34-6-4-14-6-22-6s-16 2-22 6z"/>
    </g>
    <g fill="currentColor"><circle cx="24" cy="28" r="2.6"/><circle cx="40" cy="28" r="2.6"/>
      <circle cx="32" cy="41" r="3"/></g>`,

  "🐼": `<g ${AVA_S}>
      <circle cx="15" cy="17" r="7"/><circle cx="49" cy="17" r="7"/>
      <ellipse cx="32" cy="36" rx="20" ry="17"/>
    </g>
    <g fill="currentColor">
      <ellipse cx="24" cy="33" rx="4.5" ry="5.5"/><ellipse cx="40" cy="33" rx="4.5" ry="5.5"/>
      <ellipse cx="32" cy="43" rx="3.5" ry="2.5"/>
    </g>`,

  "🍡": `<g ${AVA_S}>
      <path d="M32 52v8"/>
      <circle cx="32" cy="15" r="8"/><circle cx="32" cy="33" r="8"/><circle cx="32" cy="51" r="8"/>
    </g>`,

  "🍜": `<g ${AVA_S}>
      <path d="M10 30h44c0 13-10 21-22 21S10 43 10 30z"/>
      <path d="M6 30h52"/>
      <path d="M22 20c0-5 4-5 4-10M32 18c0-5 4-5 4-10M42 20c0-5 4-5 4-10"/>
    </g>`,

  "🗻": `<g ${AVA_S}>
      <path d="M32 10 57 51H7z"/>
      <path d="M23 26c5 4 13 4 18 0"/>
    </g>`,

  "🎋": `<g ${AVA_S}>
      <path d="M26 58V16"/>
      <path d="M22 46h8M22 32h8"/>
      <path d="M26 22c7-8 16-10 22-8-2 8-11 14-22 8z"/>
      <path d="M26 36c6 6 14 7 19 5-2-7-10-11-19-5z"/>
    </g>`,

  "🌙": `<path d="M42 8a26 26 0 1 0 0 48 27 27 0 0 1 0-48z" ${AVA_S}/>`,

  "⭐": `<path d="M32 8l7.4 15 16.6 2.4-12 11.7 2.8 16.5L32 45.8 16.2 53.6 19 37.1 7 25.4 23.6 23z" ${AVA_S}/>`,

  "🐧": `<g ${AVA_S}>
      <ellipse cx="32" cy="38" rx="15" ry="17"/>
      <circle cx="32" cy="18" r="11"/>
      <path d="M17 34c-5 3-6 10-4 15M47 34c5 3 6 10 4 15"/>
      <path d="M25 54l-5 6M39 54l5 6"/>
    </g>
    <g fill="currentColor"><circle cx="27" cy="17" r="2.4"/><circle cx="37" cy="17" r="2.4"/></g>
    <path d="M32 21l4.5 3.5-4.5 3.5-4.5-3.5z" fill="currentColor"/>`,

  "🍥": `<g ${AVA_S}>
      <circle cx="32" cy="32" r="23"/>
      <path d="M32 15a17 17 0 1 0 17 17 12 12 0 1 1-12-12 7 7 0 0 0-5-5z"/>
    </g>`,
};

/* The 12 choices, in picker order. These strings are exactly what lands in
   the `avatar` column, unchanged from before. */
const AVATAR_KEYS = ["🌸","🐱","🦊","🐼","🍡","🍜","🗻","🎋","🌙","⭐","🐧","🍥"];

/* Full <svg> for one avatar. Returns "" for anything we have no drawing for,
   so the caller can fall back to showing the raw character. */
function avatarSVG(key){
  const body = AVATARS[key];
  if(!body) return "";
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${body}</svg>`;
}
