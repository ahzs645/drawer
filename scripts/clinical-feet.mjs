/**
 * Twelve foot views reconstructed as editable cubic/quadratic Bezier artwork.
 *
 * The curves below were designed by looking at the supplied sheet. No pixel
 * contour, raster-to-path conversion, embedded bitmap, or external font is used.
 * All six views have deliberately separate silhouette and surface-detail paths.
 * The source is substantially bilateral: its right-hand set is reproduced with
 * mirrored control geometry, positioned against each source pair independently.
 * "Left" and "Right" follow the supplied captions; the view names and landmarks
 * are editorial navigation aids, not a clinically validated anatomical atlas.
 *
 * Source coordinates are retained in the authored curves for easy comparison;
 * each SVG fragment and each landmark is exposed in its own local asset frame.
 */

const SOURCE = {
  filename: 'Twelve-view left and right foot chart(1).png',
  width: 1816,
  height: 866,
};

const VIEWS = [
  {
    view: 'toe-front',
    title: 'Toe front',
    frame: { x: 100, y: 33, width: 194, height: 224 },
    mirrorAxisSum: 1815,
    shapes: [
      ['outline', 'Foot silhouette', `M 137.5 45
        C 134 63 130 77 127.6 91
        C 123.9 113 123.3 129 125.9 146
        C 123.4 162 117.5 174 112.8 190
        C 109.9 199 110.8 204 115.2 208
        C 112.6 218 111.7 226 115.5 233
        C 120.7 245 139 246 151.5 245
        C 164 244.6 174.9 241.2 176.8 230.4
        L 179.4 219.5
        C 181.3 239 188.1 246 200.8 246.4
        C 214.3 247.4 224.7 244.4 225.2 233.3
        C 235.2 238.7 245.5 236.8 246.4 227.7
        C 256.6 232.1 266 226.6 265.2 216.4
        C 275.8 220.9 281.3 215.1 282 207.4
        C 284.2 190 274.8 179.4 260.9 168.7
        C 253.8 154.1 241.5 139.8 231 124.5
        C 227 115.8 228.3 108.6 227.6 101.2
        C 227 88.3 220 80.1 221.4 69.8
        L 224.2 45`, '#fff'],
      ['ankle-crease', 'Front ankle crease', 'M 142.5 91 C 156 77 174 74 191 84'],
      ['ankle-inner', 'Inner ankle contour', 'M 139 109 C 131 126 128 144 126 156'],
      ['ankle-outer', 'Outer ankle contour', 'M 211 91 C 220 98 224 105 228 115'],
      ['hallux-fold', 'Great toe flexion fold', 'M 128 195 C 136 191 149 191 158 195'],
      ['hallux-nail', 'Great toe nail rim', 'M 127 208 C 137 200 151 201 162 208 M 130 204 C 139 199 152 199 160 204'],
      ['hallux-divider', 'Great toe outline', 'M 169 192 C 167.9 200 171.5 208 174.2 215 C 177.9 225 179 233 174.3 239 M 176 191 C 175 202 178.8 211 180.5 219'],
      ['toe-2-divider', 'Second toe outline', 'M 202.5 188 C 212.2 196 207.8 207 217 216 C 223.6 222 228.1 230 225.2 237.6'],
      ['toe-3-divider', 'Third toe outline', 'M 230 183.5 C 236 192 242.1 199 243 210 C 244.8 216 248.2 221 246.4 227.7'],
      ['toe-4-divider', 'Fourth toe outline', 'M 250.9 176 C 257 182 262.2 187.4 264 199.5 L 265.2 216.4'],
      ['toe-5-fold', 'Little toe dorsal fold', 'M 249 171 L 250.2 177 M 254 165.8 L 253.1 172.4'],
      ['nail-2', 'Second toe nail', 'M 197.6 220.9 C 200.6 216.5 211 216.5 216.1 220 C 222 224.1 218.6 228.9 209.7 229 C 199.4 229.2 194.6 226.4 197.6 220.9 Z', '#fff'],
      ['nail-3', 'Third toe nail', 'M 225.2 214.2 C 229.5 209.5 237.3 211 241.1 217.3 C 244.2 221.9 239.6 223.8 233.8 222.8 C 226.7 222 221.8 218.5 225.2 214.2 Z', '#fff'],
      ['nail-4', 'Fourth toe nail', 'M 248.3 208.7 C 250.9 204.1 257 205.4 260.5 211.1 C 263.5 217.4 259.8 218.2 253.8 216.6 C 248 215.2 246.7 212.1 248.3 208.7 Z', '#fff'],
      ['nail-5', 'Little toe nail', 'M 270.8 194.7 C 274 192.2 278.6 195.1 280.1 200.4 C 281.1 205.7 277.7 207 273.3 204.3 C 269.8 202.1 268.6 197.1 270.8 194.7 Z', '#fff'],
    ],
    landmarks: [
      ['ankle', 'Ankle crease', 166, 79, 'ankle-crease'],
      ['hallux', 'Great toe', 145, 205, 'hallux-nail'],
      ['toe-2', 'Second toe', 208, 224, 'nail-2'],
      ['toe-3', 'Third toe', 232, 219, 'nail-3'],
      ['toe-4', 'Fourth toe', 254, 212, 'nail-4'],
      ['toe-5', 'Little toe', 275, 200, 'nail-5'],
    ],
  },
  {
    view: 'plantar',
    title: 'Plantar',
    frame: { x: 345, y: 22, width: 168, height: 340 },
    mirrorAxisSum: 1816,
    shapes: [
      ['outline', 'Plantar foot silhouette', `M 374 188
        C 375 215 376 237 375 258
        C 369 278 367 298 373 318
        C 379 339 398 350 419 349
        C 441 348 456 332 465 313
        C 474 295 473 281 479 263
        C 493 219 498 175 498 141
        C 498 126 495 112 496 100
        C 497 88 491 78 483 79
        C 475 79 470 87 470 95
        C 473 85 474 78 471 68
        C 468 56 459 54 452 59
        C 453 48 445 40 436 43
        C 431 44 428 48 426 54
        C 429 44 424 35 416 34
        C 406 32 399 39 399 48
        C 393 35 379 34 370 42
        C 359 54 356 72 359 86
        C 361 98 357 111 357 128
        C 357 149 363 169 374 188 Z`, '#fff'],
      ['hallux-pad', 'Great toe pad', 'M 399 49 C 403 61 400 76 394 81 C 388 87 380 89 369 87'],
      ['toe-2-pad', 'Second toe pad', 'M 400 51 C 402 58 408 61 413 61 M 400 70 L 400 85'],
      ['toe-3-pad', 'Third toe pad', 'M 428 54 C 425 63 424 73 424 82 M 427 65 C 429 70 433 73 437 72'],
      ['toe-4-pad', 'Fourth toe pad', 'M 451 60 C 447 72 447 80 449 88 M 449 76 C 451 82 455 86 460 85'],
      ['toe-5-pad', 'Little toe pad', 'M 472 91 C 469 99 474 106 479 107 C 483 109 486 107 489 105'],
      ['ball-crease', 'Forefoot crease', 'M 368 101 C 390 94 413 77 435 84 C 456 89 474 105 488 113'],
      ['arch-crease', 'Plantar arch crease', 'M 422 124 C 422 145 414 162 399 172'],
    ],
    landmarks: [
      ['hallux', 'Great toe pad', 384, 85, 'hallux-pad'],
      ['toe-2', 'Second toe pad', 406, 59, 'toe-2-pad'],
      ['toe-3', 'Third toe pad', 432, 72, 'toe-3-pad'],
      ['toe-5', 'Little toe pad', 482, 107, 'toe-5-pad'],
      ['forefoot', 'Forefoot crease', 435, 84, 'ball-crease'],
      ['arch', 'Arch crease', 415, 153, 'arch-crease'],
      ['heel', 'Heel contour', 419, 348, 'outline'],
    ],
  },
  {
    view: 'heel',
    title: 'Heel rear',
    frame: { x: 733, y: 66, width: 180, height: 272 },
    mirrorAxisSum: 1853,
    shapes: [
      ['outline', 'Rear foot silhouette', `M 783 84
        C 785 111 791 129 789 151
        C 789 171 788 188 780 208
        C 777 219 778 224 782 229
        C 771 234 761 251 749 259
        C 741 263 744 274 750 281
        C 757 291 768 292 780 299
        C 790 318 805 325 826 325
        C 844 325 862 320 872 307
        L 879 294
        C 890 297 899 286 899 274
        C 900 258 884 242 881 232
        C 881 220 884 210 884 202
        C 889 190 894 182 891 168
        C 888 157 880 142 880 129
        L 880 79`, '#fff'],
      ['heel-contour', 'Heel and Achilles contours', `M 809 151
        C 809 175 807 195 800 215
        C 792 235 782 255 780 273
        C 777 285 778 292 780 299
        M 859 181 L 860 209
        C 861 230 871 253 876 278
        C 878 284 879 289 879 294`],
    ],
    landmarks: [
      ['ankle-outer', 'Outer ankle contour', 806, 190, 'heel-contour'],
      ['ankle-inner', 'Inner ankle contour', 860, 201, 'heel-contour'],
      ['heel', 'Heel bottom', 826, 325, 'outline'],
      ['heel-outer', 'Outer heel contour', 780, 281, 'heel-contour'],
      ['heel-inner', 'Inner heel contour', 877, 288, 'heel-contour'],
      ['foot-edge', 'Visible foot edge', 749, 279, 'outline'],
    ],
  },
  {
    view: 'medial',
    title: 'Medial side',
    frame: { x: 83, y: 310, width: 410, height: 247 },
    mirrorAxisSum: 1816,
    shapes: [
      ['outline', 'Side foot silhouette', `M 119 322
        C 120 351 124 378 120 399
        C 117 423 108 436 102 452
        C 94 470 91 485 98 501
        C 106 530 129 533 155 531
        C 182 529 203 522 222 519
        C 231 516 236 516 245 518
        L 294 524
        C 320 529 338 536 354 540
        C 373 547 390 544 404 539
        C 429 547 454 543 470 535
        C 481 528 485 516 476 508
        C 469 500 461 503 455 501
        C 453 494 443 493 430 493
        C 419 493 409 485 398 481
        C 382 474 365 467 345 457
        C 320 443 299 430 275 419
        C 263 405 254 389 255 375
        L 258 322`, '#fff'],
      ['ankle-crease', 'Ankle crease', 'M 153 424 C 177 440 201 433 217 410'],
      ['arch-crease', 'Arch contour', 'M 220 505 C 252 490 286 493 318 515'],
      ['forefoot-top', 'Top of forefoot', 'M 345 457 C 371 477 394 487 421 499 C 430 503 442 504 458 501'],
      ['lesser-toe-ridge', 'Lesser toe ridges', 'M 366 470 C 378 470 391 476 397 481 M 391 479 C 409 484 418 491 429 493'],
      ['hallux-nail', 'Great toe nail', 'M 446 505 C 452 502 461 502 466 503 C 474 506 472 513 466 515 C 461 517 454 517 449 516 C 442 515 442 509 446 505 Z', '#fff'],
      ['hallux-fold', 'Great toe flexion crease', 'M 424 508 C 419 514 420 521 424 522 C 430 525 435 513 430 507'],
      ['toe-ridge-fold', 'Toe ridge fold', 'M 443 495 C 441 499 444 502 448 503'],
    ],
    landmarks: [
      ['ankle', 'Ankle crease', 185, 432, 'ankle-crease'],
      ['heel', 'Heel contour', 116, 524, 'outline'],
      ['arch', 'Arch contour', 270, 497, 'arch-crease'],
      ['hallux', 'Great toe nail', 457, 510, 'hallux-nail'],
      ['forefoot', 'Forefoot ridge', 395, 485, 'forefoot-top'],
      ['toe-fold', 'Toe crease', 426, 519, 'hallux-fold'],
    ],
  },
  {
    view: 'lateral',
    title: 'Lateral side',
    frame: { x: 88, y: 568, width: 413, height: 257 },
    mirrorAxisSum: 1816,
    shapes: [
      ['outline', 'Oblique side foot silhouette', `M 337 580
        C 338 599 342 615 342 629
        C 341 643 333 655 320 665
        C 288 674 265 682 242 695
        C 220 707 202 711 184 717
        C 173 721 165 726 155 727
        C 142 729 129 727 117 726
        C 108 724 102 726 99 735
        C 95 746 99 754 112 759
        C 106 765 109 775 119 780
        C 122 782 127 782 131 779
        C 124 786 131 794 140 796
        C 146 798 152 796 156 793
        C 151 802 160 809 171 804
        L 180 800
        C 174 806 180 811 190 812
        C 202 813 215 808 222 805
        C 253 814 302 802 329 795
        C 350 790 365 782 383 781
        C 407 781 435 784 457 776
        C 479 769 488 751 488 732
        C 488 713 478 699 471 682
        C 460 657 462 625 467 581`, '#fff'],
      ['ankle-crease', 'Ankle crease', 'M 370 693 C 386 719 411 724 435 709'],
      ['hallux-divider', 'Great toe outline', 'M 112 759 C 131 756 137 749 152 746 C 160 744 169 742 177 741'],
      ['toe-2-divider', 'Second toe outline', 'M 129 779 C 142 777 151 766 164 762 C 174 758 184 755 195 751'],
      ['toe-3-divider', 'Third toe outline', 'M 151 793 C 167 789 173 776 187 770 C 194 766 201 763 207 760'],
      ['toe-4-divider', 'Fourth toe outline', 'M 175 804 C 187 798 191 790 204 786 L 212 782'],
      ['hallux-fold', 'Great toe joint fold', 'M 168 743 L 174 736 L 179 734'],
      ['toe-4-fold', 'Little toe joint fold', 'M 203 785 L 208 778 L 212 776'],
      ['nail-1', 'Great toe nail', 'M 108 728 C 115 724 125 729 135 728 C 139 729 135 736 131 737 C 122 740 112 738 110 735 Z', '#fff'],
      ['nail-2', 'Second toe nail', 'M 112 763 L 123 760 C 130 760 126 768 119 770 C 113 772 111 768 112 763 Z', '#fff'],
      ['nail-3', 'Third toe nail', 'M 130 775 C 134 772 142 772 143 776 C 144 780 135 783 131 781 Z', '#fff'],
      ['nail-4', 'Fourth toe nail', 'M 151 788 C 154 785 162 783 165 786 C 168 790 159 795 155 794 Z', '#fff'],
      ['nail-5', 'Little toe nail', 'M 179 796 C 182 791 189 791 194 795 C 198 800 191 804 186 803 Z', '#fff'],
    ],
    landmarks: [
      ['ankle', 'Ankle crease', 402, 717, 'ankle-crease'],
      ['heel', 'Heel contour', 474, 766, 'outline'],
      ['hallux', 'Great toe nail', 121, 733, 'nail-1'],
      ['toe-2', 'Second toe nail', 119, 766, 'nail-2'],
      ['toe-3', 'Third toe nail', 136, 777, 'nail-3'],
      ['toe-4', 'Fourth toe nail', 158, 789, 'nail-4'],
      ['toe-5', 'Little toe nail', 187, 798, 'nail-5'],
    ],
  },
  {
    view: 'dorsal-oblique',
    title: 'Dorsal oblique',
    frame: { x: 710, y: 408, width: 220, height: 397 },
    mirrorAxisSum: 1855,
    shapes: [
      ['outline', 'Dorsal foot silhouette', `M 803 422
        L 800 480
        C 799 495 796 506 799 517
        C 789 533 785 547 773 560
        C 757 579 749 596 744 615
        C 742 628 734 638 735 648
        C 727 659 722 674 722 686
        C 720 696 724 702 730 704
        C 726 713 729 723 737 727
        C 734 735 739 745 747 750
        C 742 760 747 771 758 773
        C 763 776 770 775 776 771
        C 770 781 778 789 790 792
        C 805 796 816 788 826 777
        C 834 768 839 758 840 747
        C 841 735 851 723 859 711
        C 871 694 871 678 870 656
        C 869 623 877 589 889 563
        C 903 545 913 528 916 508
        C 920 489 910 470 903 459
        L 917 423`, '#fff'],
      ['ankle-outer', 'Outer ankle fold', 'M 799 501 C 797 511 798 517 801 524'],
      ['ankle-inner', 'Inner ankle contour', 'M 903 459 C 899 474 903 491 895 507 C 890 520 882 528 876 533'],
      ['instep-tendon', 'Instep tendon contour', 'M 900 512 C 898 533 893 548 889 563'],
      ['forefoot-edge', 'Forefoot edge fold', 'M 738 647 L 733 653'],
      ['toe-5-divider', 'Little toe outline', 'M 759 669 C 743 675 743 690 731 706 C 726 714 730 722 737 725'],
      ['toe-5-fold', 'Little toe crease', 'M 749 677 L 750 668 L 753 663'],
      ['toe-4-divider', 'Fourth toe outline', 'M 774 682 C 750 693 747 708 739 725 C 733 737 740 746 747 749'],
      ['toe-3-divider', 'Third toe outline', 'M 783 700 C 765 707 773 723 755 740 C 741 755 746 767 758 771'],
      ['toe-2-divider', 'Second toe outline', 'M 797 717 C 797 730 788 743 786 749 C 781 760 778 767 776 771'],
      ['hallux-divider', 'Great toe outline', 'M 808 712 C 805 730 797 742 790 754 C 783 764 775 770 776 777'],
      ['hallux-fold', 'Great toe flexion creases', 'M 806 739 C 812 733 816 737 822 738 M 805 743 C 809 747 815 747 820 748'],
      ['nail-5', 'Little toe nail', 'M 723 692 C 728 688 732 692 733 697 L 729 703 C 725 702 722 697 723 692 Z', '#fff'],
      ['nail-4', 'Fourth toe nail', 'M 732 716 C 735 712 740 715 742 720 L 738 726 C 733 724 730 720 732 716 Z', '#fff'],
      ['nail-3', 'Third toe nail', 'M 741 736 C 746 731 752 735 754 740 C 754 744 750 748 747 749 C 742 746 739 741 741 736 Z', '#fff'],
      ['nail-2', 'Second toe nail', 'M 752 757 C 755 752 762 754 767 759 C 772 763 768 769 763 770 C 757 769 752 765 750 762 Z', '#fff'],
      ['nail-1', 'Great toe nail', 'M 783 757 C 791 750 803 751 809 759 C 811 765 807 774 802 778 C 793 778 782 773 779 771 C 779 765 782 760 783 757 Z', '#fff'],
    ],
    landmarks: [
      ['ankle', 'Inner ankle contour', 899, 492, 'ankle-inner'],
      ['instep', 'Instep contour', 895, 541, 'instep-tendon'],
      ['hallux', 'Great toe nail', 794, 766, 'nail-1'],
      ['toe-2', 'Second toe nail', 760, 762, 'nail-2'],
      ['toe-3', 'Third toe nail', 747, 740, 'nail-3'],
      ['toe-4', 'Fourth toe nail', 737, 720, 'nail-4'],
      ['toe-5', 'Little toe nail', 727, 696, 'nail-5'],
    ],
  },
];

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function makeAsset(spec, side) {
  const id = `foot-${side}-${spec.view}`;
  const { frame } = spec;
  const mirrored = side === 'right';
  const x = mirrored ? spec.mirrorAxisSum - frame.x - frame.width : frame.x;
  const name = `${side === 'left' ? 'Left' : 'Right'} foot — ${spec.title.toLowerCase()}`;
  const transform = mirrored
    ? `translate(${frame.width + frame.x} ${-frame.y}) scale(-1 1)`
    : `translate(${-frame.x} ${-frame.y})`;
  const shapes = spec.shapes.map(([suffix, label, d, fill]) =>
    `<path id="${id}-${suffix}" data-name="${escapeXml(label)}" d="${d.replace(/\s+/g, ' ').trim()}"${fill ? ` fill="${fill}"` : ''}/>`
  ).join('\n');
  return {
    id,
    name,
    side,
    view: spec.view,
    x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    inner: `<g id="${id}-artwork" data-name="${escapeXml(name)}" fill="none" stroke="#151515" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"><g id="${id}-source-frame" transform="${transform}">${shapes}</g></g>`,
    landmarks: spec.landmarks.map(([suffix, label, lx, ly, target]) => ({
      id: `${id}-${suffix}-landmark`,
      label,
      x: mirrored ? frame.width - (lx - frame.x) : lx - frame.x,
      y: ly - frame.y,
      targetId: `${id}-${target}`,
    })),
  };
}

export function buildFeetPack() {
  return {
    id: 'feet',
    title: 'Twelve-view left and right foot chart',
    source: { ...SOURCE },
    assets: ['left', 'right'].flatMap(side => VIEWS.map(spec => makeAsset(spec, side))),
    texts: [
      { id: 'feet-left-caption', text: 'Left', x: 462, y: 439, fontSize: 62, bold: true },
      { id: 'feet-right-caption', text: 'Right', x: 1230, y: 439, fontSize: 62, bold: true },
    ],
  };
}
