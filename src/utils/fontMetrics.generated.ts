/**
 * GENERATED FILE - do not edit by hand.
 *
 * Written by `pnpm gen:font-metrics` (`scripts/gen-font-metrics.ts`) from the
 * TrueType files that ship inside `@excalidraw/utils`. Regenerate after any
 * upgrade of that package.
 *
 * Advance widths are per printable-ASCII character (32..126),
 * normalised to an em of 1000 units. `lineHeight` values are copied
 * from Excalidraw's own `FONT_METADATA`, not measured - they are what
 * Excalidraw uses to lay the text out, so they have to match exactly.
 *
 * Kerning is not represented; see the header of the generator for why that is
 * safe here.
 */

export const FIRST_CHAR = 32;
export const LAST_CHAR = 126;
export const NORMALISED_UPEM = 1000;

export interface GeneratedFontMetrics {
  family: string;
  lineHeight: number;
  fallbackAdvance: number;
  advances: readonly number[];
}

export const FONT_METRICS: Record<number, GeneratedFontMetrics> = {
  // Excalifont
  5: {
    family: "Excalifont",
    lineHeight: 1.25,
    fallbackAdvance: 526,
    advances: [
      400, 314, 371, 783, 721, 928, 718, 218, 441, 402, 525, 550, 257, 411, 274, 561,
      664, 427, 700, 608, 585, 618, 640, 558, 636, 629, 264, 298, 550, 550, 550, 466,
      829, 676, 761, 629, 780, 707, 661, 780, 573, 545, 569, 613, 543, 766, 632, 767,
      698, 768, 736, 622, 857, 730, 592, 786, 628, 564, 832, 472, 589, 497, 510, 670,
      600, 576, 555, 504, 605, 537, 497, 555, 567, 244, 328, 533, 225, 663, 526, 600,
      537, 539, 412, 543, 553, 548, 525, 693, 591, 530, 572, 504, 299, 544, 669,
    ],
  },
  // Nunito
  6: {
    family: "Nunito",
    lineHeight: 1.35,
    fallbackAdvance: 572,
    advances: [
      261, 233, 405, 600, 600, 933, 701, 226, 326, 326, 451, 600, 233, 427, 233, 290,
      600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 233, 233, 600, 600, 600, 447,
      947, 733, 679, 675, 747, 586, 551, 729, 764, 262, 331, 634, 548, 858, 741, 771,
      637, 771, 673, 618, 607, 731, 694, 1104, 655, 601, 593, 324, 290, 324, 600, 500,
      361, 533, 587, 465, 587, 534, 340, 590, 572, 237, 241, 508, 301, 861, 572, 560,
      587, 587, 365, 483, 358, 565, 518, 844, 530, 517, 466, 361, 270, 361, 600,
    ],
  },
  // Lilita One
  7: {
    family: "Lilita One",
    lineHeight: 1.15,
    fallbackAdvance: 551,
    advances: [
      188, 287, 460, 833, 531, 798, 667, 301, 430, 422, 557, 602, 305, 525, 229, 573,
      639, 406, 525, 528, 598, 524, 575, 500, 570, 565, 277, 277, 484, 580, 450, 584,
      867, 655, 594, 561, 616, 493, 472, 621, 644, 429, 462, 620, 435, 907, 648, 696,
      570, 706, 590, 531, 502, 628, 661, 953, 683, 615, 563, 385, 587, 385, 687, 636,
      350, 517, 520, 424, 565, 486, 375, 516, 501, 273, 271, 531, 272, 788, 551, 513,
      555, 511, 396, 450, 368, 544, 521, 752, 557, 537, 454, 362, 628, 362, 459,
    ],
  },
  // Comic Shanns
  8: {
    family: "Comic Shanns",
    lineHeight: 1.25,
    fallbackAdvance: 550,
    advances: [
      550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550,
      550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550,
      550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550,
      550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550,
      550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550,
      550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550,
    ],
  },
  // Liberation Sans
  9: {
    family: "Liberation Sans",
    lineHeight: 1.15,
    fallbackAdvance: 556,
    advances: [
      278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
      1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
      333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
      556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
    ],
  },
};
