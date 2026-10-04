/**
 * Editable reconstruction of the supplied four-view hand chart.
 *
 * Construction: a small, manually authored set of cubic Bezier contours,
 * palm folds, and nail outlines; no bitmap, contour tracing, or font glyphs.
 * The paired hands in the reference are nearly bilateral. This reconstruction
 * deliberately uses one palmar and one dorsal master, reflected for the
 * opposite side. That is a symmetry assumption, not an assertion that a real
 * person's left and right hands have identical anatomy. Chart labels are
 * independent text and are never reflected.
 *
 * Coordinates in the masters are hand-selected in the 1254 × 1254 source
 * chart. Each asset translates them into its own crop frame. Landmarks are
 * returned in local asset coordinates. The text coordinates are centered x
 * positions and SVG baseline y positions.
 *
 * This is a clinical illustration, not a measurement or diagnostic template.
 */

const SOURCE_SIZE = 1254;
const PALMAR_FRAME = { x: 171, y: 107, width: 346, height: 501 };
const DORSAL_FRAME = { x: 228, y: 632, width: 365, height: 499 };

// Each contour joins its neighbour at a shared endpoint. Splitting the
// silhouette into these named elements makes fingers selectable in Drawer.
const PALMAR_CONTOURS = [
  {
    id: 'wrist-radial',
    name: 'Wrist — thumb-side contour',
    d: 'M325 115 C327 138 331 158 332 178 C334 193 331 201 322 209',
  },
  {
    id: 'thumb',
    name: 'Thumb contour',
    d: 'M322 209 C309 222 296 235 282 249 C260 270 250 289 239 311 C231 329 215 346 199 362 C192 369 185 375 182 382 C179 391 192 398 207 397 C228 397 245 381 261 357 C273 338 280 327 292 326',
  },
  {
    id: 'index',
    name: 'Index finger contour',
    d: 'M292 326 C302 346 301 375 298 397 C294 418 287 440 283 459 C279 478 275 498 270 516 C264 536 263 558 277 562 C293 569 306 549 310 508 C316 494 320 479 321 465 C330 452 332 429 341 418',
  },
  {
    id: 'middle',
    name: 'Middle finger contour',
    d: 'M341 418 C344 451 338 482 339 514 C340 532 342 537 339 548 C337 567 338 590 349 597 C357 603 368 600 374 589 C383 575 379 548 380 531 C384 505 383 484 384 466 C384 449 385 436 387 430 C388 426 390 425 393 425',
  },
  {
    id: 'ring',
    name: 'Ring finger contour',
    d: 'M393 425 C393 443 396 461 400 475 C398 492 401 511 403 522 C399 542 398 563 406 576 C412 586 425 583 433 570 C441 555 440 542 439 520 C438 499 440 476 439 456 L437 420 C437 414 441 410 445 408',
  },
  {
    id: 'little',
    name: 'Little finger contour',
    d: 'M445 408 C449 419 452 431 459 443 C459 455 465 469 469 477 C472 492 477 513 486 521 C493 526 502 524 507 513 C512 503 508 488 505 475 L498 448 C494 431 490 414 487 400',
  },
  {
    id: 'palm-ulnar',
    name: 'Palm — little-finger-side contour',
    d: 'M487 400 C481 388 483 373 485 358 C489 337 489 312 488 286 C488 261 478 244 469 234',
  },
  {
    id: 'wrist-ulnar',
    name: 'Wrist — little-finger-side contour',
    d: 'M469 234 C463 227 463 215 459 202 C454 187 450 179 451 167 C452 151 457 125 459 115',
  },
];

const PALMAR_DETAILS = [
  {
    id: 'thumb-web',
    name: 'Thumb–index web fold',
    d: 'M292 326 C298 324 303 324 309 323',
  },
  {
    id: 'palm-thumb-fold',
    name: 'Palm fold — thumb side',
    d: 'M330 316 C370 309 396 275 395 220',
    strokeWidth: 2.8,
  },
  {
    id: 'palm-ulnar-fold',
    name: 'Palm fold — little-finger side',
    d: 'M403 262 C407 299 419 334 441 350',
    strokeWidth: 2.8,
  },
  {
    id: 'index-middle-web',
    name: 'Index–middle web fold',
    d: 'M340 416 C344 418 347 419 351 420',
  },
  {
    id: 'middle-ring-web',
    name: 'Middle–ring web fold',
    d: 'M388 426 C392 425 396 423 400 422',
  },
  {
    id: 'ring-little-web',
    name: 'Ring–little web fold',
    d: 'M437 415 C441 410 445 407 449 405',
  },
];

const DORSAL_CONTOURS = [
  {
    id: 'wrist-ulnar',
    name: 'Wrist — little-finger-side contour',
    d: 'M253 1123 C264 1091 279 1048 286 1020',
  },
  {
    id: 'dorsum-ulnar',
    name: 'Dorsum — little-finger-side contour',
    d: 'M286 1020 C293 1000 278 974 271 952 C261 926 263 905 261 880 C260 848 258 826 249 800',
  },
  {
    id: 'little',
    name: 'Little finger contour',
    d: 'M249 800 C247 790 243 781 241 775 C236 761 233 743 241 735 C250 726 264 730 270 744 C274 753 274 763 277 777 C284 802 292 829 300 838',
  },
  {
    id: 'ring',
    name: 'Ring finger contour',
    d: 'M300 838 C304 844 298 815 297 809 L287 758 C282 732 278 711 281 690 C282 679 288 672 298 672 C311 671 316 686 318 704 C322 733 331 758 336 790 C339 807 340 820 343 819',
  },
  {
    id: 'middle',
    name: 'Middle finger contour',
    d: 'M343 819 C348 818 344 797 345 783 L341 710 C341 686 337 666 342 652 C346 640 354 637 363 640 C379 642 383 660 385 684 C385 713 390 740 389 768 L389 802 C389 818 392 825 398 820',
  },
  {
    id: 'index',
    name: 'Index finger contour',
    d: 'M398 820 C403 815 405 796 409 782 C413 765 414 744 418 730 C422 713 420 691 431 676 C439 665 454 666 461 675 C470 688 466 708 465 724 C461 750 463 776 460 797 C456 831 454 850 459 877 C461 887 464 896 466 902',
  },
  {
    id: 'thumb',
    name: 'Thumb contour',
    d: 'M466 902 C479 897 490 875 502 861 C517 844 535 833 549 828 C562 824 575 829 582 834 C589 842 585 852 578 862 C565 876 545 892 533 908 C522 923 515 940 510 954 C499 973 480 994 468 1008',
  },
  {
    id: 'wrist-radial',
    name: 'Wrist — thumb-side contour',
    d: 'M468 1008 C453 1023 430 1029 422 1046 C412 1068 407 1098 399 1123',
  },
];

const DORSAL_DETAILS = [
  {
    id: 'little-nail',
    name: 'Little fingernail',
    d: 'M241 742 C242 736 248 733 253 734 C260 734 262 739 264 746 L265 754 C259 760 251 762 244 759 C242 754 241 748 241 742 Z',
    strokeWidth: 2.7,
  },
  {
    id: 'ring-nail',
    name: 'Ring fingernail',
    d: 'M286 682 C288 676 293 674 300 675 C307 675 310 680 311 686 L313 698 C306 704 295 705 287 701 C285 695 285 688 286 682 Z',
    strokeWidth: 2.7,
  },
  {
    id: 'middle-nail',
    name: 'Middle fingernail',
    d: 'M347 649 C349 643 355 641 362 642 C370 643 373 650 373 658 L373 669 C367 676 354 676 346 672 C344 665 345 655 347 649 Z',
    strokeWidth: 2.7,
  },
  {
    id: 'index-nail',
    name: 'Index fingernail',
    d: 'M437 677 C441 672 449 670 455 674 C461 678 461 685 460 695 C454 702 441 702 433 697 C433 688 434 681 437 677 Z',
    strokeWidth: 2.7,
  },
  {
    id: 'thumb-nail',
    name: 'Thumbnail',
    d: 'M553 837 C561 830 571 830 579 835 C586 841 583 851 577 859 C571 866 565 870 558 866 C548 862 545 855 548 847 C549 843 551 839 553 837 Z',
    strokeWidth: 2.7,
  },
  {
    id: 'thumb-web',
    name: 'Thumb–index web fold',
    d: 'M466 902 C468 910 469 918 469 925',
  },
];

const PALMAR_LANDMARKS = [
  ['wrist', 'Wrist centre', 392, 166],
  ['palm', 'Palm centre', 398, 366],
  ['thumb-tip', 'Thumb tip', 199, 390, 'thumb'],
  ['index-tip', 'Index fingertip', 283, 560, 'index'],
  ['middle-tip', 'Middle fingertip', 360, 598, 'middle'],
  ['ring-tip', 'Ring fingertip', 417, 581, 'ring'],
  ['little-tip', 'Little fingertip', 494, 523, 'little'],
  ['thumb-web', 'Thumb–index web', 296, 325, 'thumb-web'],
  ['palm-thumb-fold', 'Palm fold — thumb side', 365, 300, 'palm-thumb-fold'],
  ['palm-ulnar-fold', 'Palm fold — little-finger side', 418, 319, 'palm-ulnar-fold'],
  ['index-middle-web', 'Index–middle web', 341, 418, 'index-middle-web'],
  ['middle-ring-web', 'Middle–ring web', 391, 425, 'middle-ring-web'],
  ['ring-little-web', 'Ring–little web', 443, 410, 'ring-little-web'],
];

const DORSAL_LANDMARKS = [
  ['wrist', 'Wrist centre', 348, 1061],
  ['dorsum', 'Dorsum centre', 377, 891],
  ['thumb-tip', 'Thumb tip', 583, 841, 'thumb'],
  ['index-tip', 'Index fingertip', 447, 669, 'index'],
  ['middle-tip', 'Middle fingertip', 358, 639, 'middle'],
  ['ring-tip', 'Ring fingertip', 298, 673, 'ring'],
  ['little-tip', 'Little fingertip', 252, 731, 'little'],
  ['thumb-nail', 'Thumbnail centre', 564, 849, 'thumb-nail'],
  ['index-nail', 'Index fingernail centre', 447, 687, 'index-nail'],
  ['middle-nail', 'Middle fingernail centre', 360, 657, 'middle-nail'],
  ['ring-nail', 'Ring fingernail centre', 299, 689, 'ring-nail'],
  ['little-nail', 'Little fingernail centre', 253, 747, 'little-nail'],
  ['thumb-web', 'Thumb–index web', 466, 902, 'thumb-web'],
];

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

function joinedSilhouette(contours) {
  // Every subsequent M repeats the prior contour endpoint. Replacing it by L
  // preserves the authored cubics and produces one opaque, closed fill.
  return contours.map((part, index) => index ? part.d.replace(/^M/, 'L') : part.d).join(' ') + ' Z';
}

function shapeMarkup(id, contours, details) {
  const fill = `<path id="${id}-silhouette" data-name="Hand silhouette" d="${joinedSilhouette(contours)}" fill="#ffffff" stroke="none"/>`;
  const paths = [...contours, ...details].map((part) => (
    `<path id="${id}-${part.id}" data-name="${escapeXml(part.name)}" d="${part.d}"${part.strokeWidth ? ` stroke-width="${part.strokeWidth}"` : ''}/>`
  ));
  return `${fill}\n<g id="${id}-linework" data-name="Editable hand contours and details" fill="none" stroke="#111111" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">\n${paths.join('\n')}\n</g>`;
}

function makeAsset({ id, name, frame, contours, details, landmarks, side, view, mirror }) {
  const art = `<g id="${id}-geometry" data-name="${escapeXml(name)}" transform="translate(${-frame.x} ${-frame.y})">\n${shapeMarkup(id, contours, details)}\n</g>`;
  return {
    id,
    name,
    x: mirror ? SOURCE_SIZE - frame.x - frame.width : frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    inner: mirror
      ? `<g id="${id}-mirror" data-name="Bilateral reconstruction" transform="translate(${frame.width} 0) scale(-1 1)">\n${art}\n</g>`
      : art,
    side,
    view,
    landmarks: landmarks.map(([suffix, label, x, y, target]) => ({
      id: `${id}-${suffix}-landmark`,
      label,
      x: mirror ? frame.width - (x - frame.x) : x - frame.x,
      y: y - frame.y,
      ...(target ? { targetId: `${id}-${target}` } : {}),
    })),
  };
}

/** Four independent SVG assets plus editable chart labels. */
export function buildHandsPack() {
  return {
    id: 'hands',
    title: 'Hands — four palmar and dorsal views',
    source: {
      filename: 'Labeled hand views in four positions(1).png',
      width: SOURCE_SIZE,
      height: SOURCE_SIZE,
    },
    assets: [
      makeAsset({
        id: 'hand-right-palmar', name: 'Right hand — palm, fingers down',
        frame: PALMAR_FRAME, contours: PALMAR_CONTOURS, details: PALMAR_DETAILS,
        landmarks: PALMAR_LANDMARKS, side: 'right', view: 'palmar', mirror: false,
      }),
      makeAsset({
        id: 'hand-left-palmar', name: 'Left hand — palm, fingers down',
        frame: PALMAR_FRAME, contours: PALMAR_CONTOURS, details: PALMAR_DETAILS,
        landmarks: PALMAR_LANDMARKS, side: 'left', view: 'palmar', mirror: true,
      }),
      makeAsset({
        id: 'hand-left-dorsal', name: 'Left hand — dorsum, fingers up',
        frame: DORSAL_FRAME, contours: DORSAL_CONTOURS, details: DORSAL_DETAILS,
        landmarks: DORSAL_LANDMARKS, side: 'left', view: 'dorsal', mirror: false,
      }),
      makeAsset({
        id: 'hand-right-dorsal', name: 'Right hand — dorsum, fingers up',
        frame: DORSAL_FRAME, contours: DORSAL_CONTOURS, details: DORSAL_DETAILS,
        landmarks: DORSAL_LANDMARKS, side: 'right', view: 'dorsal', mirror: true,
      }),
    ],
    texts: [
      { id: 'hand-right-palmar-label', text: 'Right', x: 428.5, y: 77, fontSize: 84, bold: true, align: 'middle' },
      { id: 'hand-left-palmar-label', text: 'Left', x: 861, y: 76, fontSize: 84, bold: true, align: 'middle' },
      { id: 'hand-left-dorsal-label', text: 'Left', x: 400.5, y: 1211, fontSize: 84, bold: true, align: 'middle' },
      { id: 'hand-right-dorsal-label', text: 'Right', x: 868.5, y: 1211, fontSize: 84, bold: true, align: 'middle' },
    ],
  };
}
