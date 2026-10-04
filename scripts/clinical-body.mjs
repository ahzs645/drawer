/**
 * Four-view body chart, manually reconstructed from the supplied illustration.
 *
 * These are authored cubic Bezier constructions, with explicit anatomical
 * contours, creases and facial features. No thresholding, bitmap tracing,
 * contour extraction, raster embedding or third-party body art is used.
 * Bilateral constructions share proportions; the two profile drawings use a
 * reflected construction, as do the nearly reflected views in the reference.
 * The profiles deliberately describe facing direction, not clinical laterality.
 *
 * All landmark positions are ILLUSTRATIVE image coordinates. They are useful
 * diagram attachment sites, not measured anatomy or validated clinical regions.
 */

const ink = '#171918';
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const attrs = (prefix, id, name) => `id="${prefix}-${id}" data-name="${escape(name)}"`;
const path = (prefix, id, name, d, width = 2.4, fill = 'none') =>
  `<path ${attrs(prefix, id, name)} d="${d}" fill="${fill}" stroke="${width ? ink : 'none'}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ellipse = (prefix, id, name, cx, cy, rx, ry, fill = 'white', width = 1.4) =>
  `<ellipse ${attrs(prefix, id, name)} cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${ink}" stroke-width="${width}"/>`;
const group = (prefix, id, name, content, transform = '') =>
  `<g ${attrs(prefix, id, name)}${transform ? ` transform="${transform}"` : ''}>${content}</g>`;

// The contour is split at useful anatomical boundaries so the visible artwork
// itself provides semantic attachment targets. The invisible closing edge is
// used only for its white fill, never drawn through the body.
function halfFigure(prefix, side, mirror, parts, details) {
  const sidePrefix = `${prefix}-${side}`;
  const combined = `M${parts[0].start} ${parts.map((p) => p.d).join(' ')} Z`;
  const fill = path(sidePrefix, 'surface', `${side} body surface`, combined, 0, 'white');
  const contours = parts.map((p) => path(sidePrefix, p.id, p.name, `M${p.start} ${p.d}`)).join('');
  return group(prefix, `${side}-regions`, `${side} anatomical regions`, fill + contours + details(sidePrefix), mirror ? `translate(${mirror} 0) scale(-1 1)` : '');
}

function anterior(prefix) {
  // Original chart coordinates. The source is an unshaded anterior line drawing.
  const parts = [
    { id: 'head', name: 'Head and ear contour', start: '283.5 25', d: 'C263 24 247 34 241 49 C235 61 237 77 239 90 C235 81 230 86 232 97 L233 109 C234 117 237 123 242 121 C244 128 247 134 249 139' },
    { id: 'neck-shoulder', name: 'Neck and shoulder', start: '249 139', d: 'L251 161 C252 168 244 174 236 179 L213 194 C195 198 181 204 172 218 C160 235 158 258 162 277 L164 286' },
    { id: 'arm-hand-outline', name: 'Arm, wrist and hand outline', start: '164 286', d: 'C159 310 158 339 160 366 C154 387 150 408 152 430 L159 493 C161 503 158 511 161 518 L156 553 C155 558 157 562 160 566 L168 586 C174 593 183 598 191 601 C195 603 199 600 196 596 C196 590 190 588 184 583 L179 563 C178 558 180 554 182 552 C185 556 187 565 188 574 C190 581 200 582 200 576 C198 562 195 552 194 539 L191 527' },
    { id: 'outer-thigh-knee-calf', name: 'Outer thigh, knee and calf', start: '191 527', d: 'L196 581 C200 610 209 646 219 674 C218 693 225 709 221 731 C214 759 215 781 222 810 L238 870 C242 882 236 890 240 898' },
    { id: 'foot', name: 'Ankle, foot and toes', start: '240 898', d: 'C237 906 234 918 228 928 C222 936 217 941 218 949 C218 954 221 955 223 952 C222 959 226 960 230 956 C228 962 233 964 237 959 C235 965 242 966 246 960 C248 965 258 963 262 958 C267 952 264 944 267 936 L272 923 C277 914 272 907 272 900' },
    { id: 'inner-calf-knee-thigh', name: 'Inner calf, knee and thigh', start: '272 900', d: 'C269 893 275 887 272 879 C267 868 267 856 270 832 L277 794 C280 775 275 756 270 738 C266 722 273 701 275 684 C278 663 279 643 280 622 L282 553 L283.5 533' },
  ];
  const details = (p) => [
    path(p, 'axilla', 'Axilla and upper arm', 'M196 262 C202 270 203 282 205 296 L205 330 C207 347 200 366 200 384 C201 401 197 425 192 446 L185 487 C183 499 184 510 183 517 L191 531', 2.1),
    path(p, 'trunk', 'Lateral chest and abdomen', 'M205 290 C205 312 205 335 211 357 C217 376 211 393 209 409 C207 431 198 460 194 482 C191 498 192 513 191 527', 2.2),
    path(p, 'axillary-fold', 'Anterior axillary fold', 'M205 285 C209 291 211 295 214 296', 1.3),
    ellipse(p, 'nipple', 'Nipple', 219, 289.5, 4.1, 2.7, 'white', 1.5),
    path(p, 'pectoral-fold', 'Medial pectoral contour', 'M281 298 C278 302 276 305 272 307', 1.2),
    path(p, 'elbow-crease', 'Elbow crease', 'M171 376 C176 380 183 379 189 375', 1.35),
    path(p, 'wrist-crease', 'Wrist contour', 'M186 510 C184 516 185 521 189 526', 1.3),
    path(p, 'thumb-web', 'Thumb web and base', 'M179 549 C182 553 184 556 185 560', 1.8),
    path(p, 'index-finger', 'Index finger', 'M162 558 L174 585 C180 590 187 594 193 597', 1.55),
    path(p, 'finger-tip-fold', 'Curled finger tip crease', 'M188 596 C190 594 194 596 195 599', 1.1),
    path(p, 'thumb-nail', 'Thumbnail', 'M194 570 C190 570 189 574 191 577 C194 580 198 578 198 575', 1.0),
    path(p, 'thigh-tendon', 'Lateral thigh tendon', 'M214 657 C216 664 218 670 222 674', 1.15),
    path(p, 'patella-outer', 'Outer knee contour', 'M228 675 C223 686 227 693 231 702 L232 712', 1.25),
    path(p, 'patella-inner', 'Inner knee contour', 'M265 678 C269 685 267 693 265 698 M264 705 C266 716 262 724 255 728', 1.25),
    path(p, 'patella-lower', 'Lower knee contour', 'M232 716 C232 722 235 725 239 727', 1.15),
    path(p, 'ankle-tendon', 'Anterior ankle tendon', 'M270 887 C271 896 269 904 270 912', 1.2),
    path(p, 'great-toe', 'Great toe contour', 'M245 958 C243 953 245 947 249 944 M247 953 C252 951 258 952 261 955', 1.35),
    path(p, 'second-toe', 'Second toe contour', 'M237 959 C237 954 239 949 242 944', 1.2),
    path(p, 'third-toe', 'Third toe contour', 'M230 956 C231 951 233 946 236 942', 1.15),
    path(p, 'fourth-toe', 'Fourth toe contour', 'M223 952 C224 948 227 943 230 940', 1.15),
    path(p, 'little-toe', 'Little toe contour', 'M219 947 C220 944 222 941 224 939', 1.0),
  ].join('');
  const halves = halfFigure(prefix, 'right', 0, parts, details) + halfFigure(prefix, 'left', 567, parts, details);
  const face = [
    path(prefix, 'right-jaw', 'Right jaw contour', 'M241 117 C245 132 255 145 267 153', 1.5),
    path(prefix, 'left-jaw', 'Left jaw contour', 'M326 117 C322 132 312 145 301 153', 1.5),
    path(prefix, 'chin', 'Chin contour', 'M273 158 C280 162 289 162 296 158', 1.5),
    path(prefix, 'right-ear-fold', 'Right ear cartilage', 'M238 92 C233 90 234 99 237 102 C234 109 237 115 239 115 M238 96 C241 99 237 104 239 109', 1.35),
    path(prefix, 'left-ear-fold', 'Left ear cartilage', 'M329 92 C334 90 333 99 330 102 C333 109 330 115 328 115 M329 96 C326 99 330 104 328 109', 1.35),
    path(prefix, 'right-eyebrow', 'Right eyebrow', 'M252 84 C258 78 267 77 273 82 C266 81 259 81 252 84 Z', 0, ink),
    path(prefix, 'left-eyebrow', 'Left eyebrow', 'M292 82 C299 77 308 79 315 84 C306 81 299 81 292 82 Z', 0, ink),
    path(prefix, 'right-eye', 'Right eyelids', 'M250 93 C256 87 266 87 273 93 C266 98 257 97 250 93 Z', 1.05, 'white'),
    path(prefix, 'left-eye', 'Left eyelids', 'M293 93 C299 87 309 87 315 93 C309 97 300 98 293 93 Z', 1.05, 'white'),
    ellipse(prefix, 'right-iris', 'Right iris', 262.5, 93, 3.4, 3.25, ink, 0),
    ellipse(prefix, 'left-iris', 'Left iris', 303.5, 93, 3.4, 3.25, ink, 0),
    ellipse(prefix, 'right-eye-highlight', 'Right eye highlight', 263.4, 91.8, 0.8, 0.8, 'white', 0),
    ellipse(prefix, 'left-eye-highlight', 'Left eye highlight', 304.4, 91.8, 0.8, 0.8, 'white', 0),
    path(prefix, 'nose-bridge', 'Nasal bridge', 'M274 88 C279 94 278 104 275 109 M292 89 C288 96 290 104 292 109', 1.25),
    path(prefix, 'nose-tip', 'Nasal tip and nostrils', 'M276 108 C272 109 271 114 274 115 L280 114 C282 117 286 117 289 114 L293 115 C297 114 294 109 292 108', 1.35),
    path(prefix, 'philtrum', 'Philtrum', 'M281 119 L281 125 C282 127 285 127 285 124 L285 119', 1.0),
    path(prefix, 'upper-lip', 'Upper lip', 'M271 133 C276 132 280 127 284 130 C287 128 292 132 299 133 C289 136 280 136 271 133 Z', 1.05, 'white'),
    path(prefix, 'lower-lip', 'Lower lip', 'M274 137 C280 142 289 141 296 137', 1.1),
    path(prefix, 'lip-shadow', 'Lower lip crease', 'M281 146 L287 146', 1.0),
    path(prefix, 'right-neck-tendon', 'Right neck tendon', 'M267 172 C274 188 275 202 283 204', 1.25),
    path(prefix, 'left-neck-tendon', 'Left neck tendon', 'M304 172 C298 188 293 205 283 204', 1.25),
    path(prefix, 'right-clavicle', 'Right clavicle', 'M239 198 C251 201 263 198 273 199', 1.2),
    path(prefix, 'left-clavicle', 'Left clavicle', 'M299 199 C311 198 323 201 337 198', 1.2),
    ellipse(prefix, 'umbilicus', 'Umbilicus', 283.5, 409, 4.4, 1.75, 'white', 1.7),
    path(prefix, 'pubic-fold', 'Pubic fold', 'M275 525 C279 535 287 537 291 525', 1.7),
  ].join('');
  return halves + group(prefix, 'central-anatomy', 'Face and central anatomy', face);
}

function posterior(prefix) {
  const parts = [
    { id: 'head', name: 'Occiput and ear contour', start: '1006 25', d: 'C985 25 969 35 963 51 C958 63 958 82 960 97 C954 90 952 97 955 106 C956 115 961 123 967 125 L967 119' },
    { id: 'neck-shoulder', name: 'Neck and shoulder', start: '967 119', d: 'C971 131 975 143 976 155 C977 164 973 171 968 175 L934 195 C915 201 900 211 891 229 C882 247 881 268 886 292' },
    { id: 'arm-hand-outline', name: 'Arm, wrist and hand outline', start: '886 292', d: 'C880 317 881 343 883 369 C877 389 877 413 879 438 L886 501 C888 510 884 518 888 525 L890 554 C890 560 894 565 897 571 L904 585 C910 592 918 598 927 601 L925 590 C918 586 912 581 910 576 L905 562 C907 556 910 551 911 545 L910 531' },
    { id: 'outer-thigh-knee-calf', name: 'Outer thigh, knee and calf', start: '910 531', d: 'L922 580 C927 613 936 646 944 674 C942 692 948 710 946 726 C940 752 941 777 948 803 L966 870 C969 880 971 888 967 897' },
    { id: 'foot', name: 'Heel, foot and toes', start: '967 897', d: 'C963 893 959 896 960 899 C955 895 951 899 954 902 C949 898 945 902 948 905 C943 903 941 907 945 911 C941 914 946 920 950 925 C955 932 961 934 966 939 C971 947 978 951 989 950 C1001 950 1006 943 1003 932 L998 913 C994 899 995 885 997 869' },
    { id: 'inner-calf-knee-thigh', name: 'Inner calf, knee and thigh', start: '997 869', d: 'L1003 800 C1007 778 1001 756 997 738 C993 723 997 712 1001 699 C1009 675 1003 655 1002 638 C1002 617 1006 591 1006 570 L1006 518' },
  ];
  const details = (p) => [
    path(p, 'axilla', 'Posterior axilla and upper arm', 'M914 262 L922 276 C926 300 925 318 926 338 C925 354 921 368 925 385 C928 400 922 425 919 446 L910 491 C908 504 908 518 912 531', 2.1),
    path(p, 'flank', 'Lateral back and waist', 'M926 338 C933 358 939 382 934 403 L929 432 C923 454 917 481 918 505 L920 533 L922 580', 2.2),
    path(p, 'scapula-upper', 'Upper scapular contour', 'M983 216 C987 220 989 226 989 234', 1.1),
    path(p, 'scapula-medial', 'Medial scapular border', 'M989 245 C987 266 980 280 968 294', 1.2),
    path(p, 'scapula-lateral', 'Lateral scapular contour', 'M940 290 C943 294 947 295 950 296', 1.0),
    path(p, 'elbow', 'Posterior elbow crease', 'M897 390 C903 401 910 396 914 385', 1.35),
    path(p, 'lumbar-fold', 'Lateral lumbar contour', 'M939 450 C945 464 943 480 940 494', 1.1),
    path(p, 'gluteal-fold', 'Gluteal fold', 'M944 525 C960 533 981 533 995 526 C1003 522 1006 518 1006 511', 1.85),
    path(p, 'hand-dorsum', 'Dorsal hand tendons', 'M908 517 C915 526 917 539 913 551', 1.55),
    path(p, 'hand-fingers', 'Posterior finger contours', 'M892 555 L908 584 L923 595 M913 551 C918 555 922 568 924 575', 1.3),
    path(p, 'lateral-knee', 'Lateral posterior knee contour', 'M951 674 C958 682 960 690 958 700', 1.2),
    path(p, 'medial-knee', 'Medial posterior knee contour', 'M988 666 C985 676 986 684 987 693', 1.2),
    path(p, 'knee-tendon', 'Posterior medial knee tendon', 'M998 625 C994 642 995 657 999 672', 1.3),
    path(p, 'calf-tendon', 'Upper medial calf tendon', 'M997 717 C992 726 993 738 998 746', 1.2),
    path(p, 'achilles', 'Achilles tendon', 'M998 816 C991 858 992 886 999 918', 1.4),
    path(p, 'ankle-tendon', 'Lateral ankle contour', 'M974 897 C972 905 975 914 978 919 M984 899 C984 906 984 913 983 921', 1.15),
    path(p, 'toe-folds', 'Posterior toe contours', 'M960 899 L966 900 M954 902 L963 904 M948 905 L958 908 M945 911 L953 912', 1.15),
  ].join('');
  return halfFigure(prefix, 'left', 0, parts, details) + halfFigure(prefix, 'right', 2012, parts, details)
    + group(prefix, 'central-back', 'Central back and sacrum', [
      path(prefix, 'lumbar-spine', 'Lumbar midline', 'M1006 367 C1008 381 1008 393 1006 404', 1.25),
      path(prefix, 'sacral-fold', 'Sacral crease', 'M1003 450 L1006 455 L1009 450', 1.3),
      path(prefix, 'gluteal-cleft', 'Gluteal cleft', 'M1006 461 L1006 514', 2.0),
    ].join(''));
}

function profile(prefix) {
  const farLeg = path(prefix, 'far-leg-foot', 'Far lower leg and foot',
    'M646 655 C642 672 644 688 650 699 C649 708 653 717 659 722 C657 748 664 781 670 815 C675 842 672 859 658 871 C649 879 630 883 615 890 C605 890 598 890 592 893 C586 894 587 900 592 902 C598 905 607 904 611 902 C620 908 632 906 640 902 L660 890 C675 875 678 853 677 833 L688 764 C695 728 696 691 686 661 Z', 2.3, 'white');
  const farCalf = path(prefix, 'far-calf', 'Far calf contour',
    'M707 655 C707 688 724 713 729 733 C734 751 727 770 721 783 L701 844 L688 800 L690 698 Z', 2.3, 'white');
  const bodyD = 'M647 27 C672 26 692 35 701 53 C709 69 709 87 702 101 C698 111 690 119 687 132 C684 142 684 150 687 158 L714 194 C718 218 730 240 732 257 C734 274 725 284 720 299 L708 341 C710 357 707 370 704 385 C701 402 705 420 714 437 C729 462 735 479 730 498 C727 514 719 527 709 534 L709 568 C712 608 711 640 707 671 C706 695 713 719 717 738 C723 757 724 772 721 790 L711 849 C707 872 706 886 711 904 C714 915 717 925 707 930 C697 935 680 937 666 942 L637 950 C632 951 628 951 625 949 C621 953 615 951 616 948 C611 952 604 950 605 946 C599 950 592 947 595 942 C589 946 582 942 585 937 C581 937 580 932 586 929 L611 921 C632 914 650 903 661 890 C671 876 674 857 673 841 C673 819 669 794 665 771 C661 751 657 734 659 721 C652 716 649 707 649 696 C644 684 643 674 644 660 C636 644 626 620 619 596 L617 545 C616 526 615 509 614 486 C602 469 594 450 592 433 C589 417 595 401 591 386 C588 374 593 359 591 347 C588 337 591 322 594 309 L598 285 C591 278 592 269 598 258 L615 232 C628 211 635 198 633 185 C631 171 623 160 614 156 C603 157 592 156 593 147 L595 140 C597 137 592 137 590 134 C588 133 590 131 594 130 C592 125 592 121 585 121 C580 122 575 118 579 113 L588 99 C592 93 593 90 590 86 C587 83 590 75 592 68 C597 41 616 29 647 27 Z';
  const body = path(prefix, 'body-contour', 'Profile head, neck, trunk and near leg', bodyD, 2.4, 'white');
  const armD = 'M712 252 C706 270 711 305 707 329 C706 338 706 344 707 351 C709 362 708 369 704 376 C701 384 698 397 693 411 C682 443 666 474 652 494 C650 499 648 505 648 510 C653 521 652 532 649 544 C648 558 643 578 639 581 C637 584 634 583 634 580 C633 589 630 594 626 594 C623 594 622 591 623 587 C623 594 622 599 618 598 C614 598 612 593 613 588 C610 592 607 589 605 583 C602 572 602 558 604 548 C601 555 598 560 595 558 C591 557 596 551 599 545 C602 539 604 534 606 529 C609 518 613 509 617 499 C626 470 633 440 639 412 C643 393 648 380 653 369 C655 365 655 358 655.5 352 L656 345 C656 341 654 337 653 334 C649 323 647 311 646 300 C645 287 639 277 635 272';
  const arm = path(prefix, 'near-arm-hand', 'Near shoulder, arm and hand', armD, 2.25, 'white');
  const face = [
    path(prefix, 'ear', 'Ear contour', 'M650 108 C656 108 664 101 665 91 C666 80 660 74 654 77 C648 79 648 86 650 91', 1.65),
    path(prefix, 'ear-inner', 'Ear cartilage', 'M653 81 C659 77 663 86 661 92 M653 84 C658 83 661 89 657 93 L654 99 C652 101 650 102 649 101 M651 88 C655 87 657 91 654 94 M656 100 L659 98', 1.2),
    path(prefix, 'jaw', 'Mandible contour', 'M649 103 C648 119 637 137 624 146', 1.25),
    path(prefix, 'eyebrow', 'Eyebrow', 'M593 84 C599 80 606 82 612 87 C605 85 599 85 593 86 Z', 0, ink),
    path(prefix, 'eye', 'Eye and eyelids', 'M596 91 C601 90 606 93 609 94 L598 97 C600 94 598 93 596 91 Z', 1.0, 'white'),
    ellipse(prefix, 'iris', 'Iris', 601, 94, 2.1, 2.2, ink, 0),
    path(prefix, 'nose', 'Nose and nostril', 'M590 112 C596 110 599 117 594 120 M585 118 L588 118', 1.3),
    path(prefix, 'mouth', 'Mouth and lips', 'M590 130 C595 132 599 133 603 131 M593 138 C596 137 599 135 600 134', 1.35),
    path(prefix, 'neck-tendon', 'Neck tendons', 'M641 184 C640 194 635 196 633 200 M656 189 C652 201 645 208 641 218 C633 227 630 238 632 249', 1.4),
    path(prefix, 'clavicle', 'Clavicular contour', 'M647 207 C651 204 655 203 660 204', 1.2),
    path(prefix, 'nipple', 'Profile nipple', 'M596 270 C602 271 601 279 596 279', 1.2),
    path(prefix, 'chest-fold', 'Chest contour', 'M597 283 C597 287 599 289 601 290', 1.1),
    path(prefix, 'anterior-pelvis', 'Anterior pelvis contour', 'M612 461 C615 479 615 490 614 501', 1.2),
    path(prefix, 'elbow', 'Elbow contour', 'M693 363 C691 369 685 370 683 376 L680 386', 1.2),
    path(prefix, 'wrist', 'Wrist contour', 'M651 495 L648 508', 1.3),
    path(prefix, 'thumb', 'Thumb contour', 'M604 546 C601 550 600 555 596 556', 1.15),
    path(prefix, 'index-finger', 'Index finger contour', 'M613 554 C614 567 612 579 613 588', 1.25),
    path(prefix, 'middle-finger', 'Middle finger contour', 'M625 557 C623 568 623 579 623 587', 1.25),
    path(prefix, 'ring-finger', 'Ring finger contour', 'M637 557 C634 566 634 574 634 580', 1.25),
    path(prefix, 'finger-creases', 'Finger joint creases', 'M607 575 L610 575 M616 580 L620 580 M626 577 L630 577 M637 569 L640 569 M615 593 C617 591 620 591 621 593', 0.65),
    path(prefix, 'hip-fold', 'Gluteal profile fold', 'M716 528 L708 534', 1.4),
    path(prefix, 'anterior-knee', 'Anterior knee contour', 'M644 660 C649 671 658 678 661 689', 1.2),
    path(prefix, 'posterior-knee', 'Posterior knee contour', 'M707 670 C704 681 697 697 702 709', 1.25),
    path(prefix, 'ankle', 'Ankle tendon', 'M703 865 C699 881 708 903 692 908', 1.35),
    path(prefix, 'far-foot-toe', 'Far foot toe detail', 'M591 894 C595 896 600 895 603 893', 1.0),
    path(prefix, 'great-toe', 'Near great toe contour', 'M585 935 C592 935 596 930 603 928 M585 930 C585 933 588 934 591 932', 1.25),
    path(prefix, 'second-toe', 'Near second toe contour', 'M595 942 C601 935 607 932 614 931 M590 939 C590 942 593 942 596 940', 1.15),
    path(prefix, 'third-toe', 'Near third toe contour', 'M605 946 C610 939 616 935 623 934 M601 944 C602 946 605 946 608 943', 1.15),
    path(prefix, 'fourth-toe', 'Near fourth toe contour', 'M616 948 C620 942 625 938 631 937', 1.15),
    path(prefix, 'little-toe', 'Near little toe contour', 'M625 949 C628 944 631 942 634 941', 1.1),
  ].join('');
  return farLeg + farCalf + body + arm + group(prefix, 'anatomy-details', 'Profile anatomy details', face);
}

function landmark(asset, id, label, x, y, target) {
  return { id: `${asset.id}-${id}`, label, x: x - asset.x, y: y - asset.y, ...(target ? { targetId: `${asset.id}-${target}` } : {}) };
}

/** Build source-aligned, independently editable views and illustrative sites. */
export function buildBodyPack() {
  const front = { id: 'body-anterior', name: 'Body — anterior', x: 144, y: 16, width: 280, height: 962, view: 'anterior' };
  front.inner = group(front.id, 'artwork', 'Anterior body artwork', anterior(front.id), `translate(${-front.x} ${-front.y})`);
  front.landmarks = [
    landmark(front, 'forehead', 'Forehead', 283.5, 58, 'right-head'),
    landmark(front, 'chin-site', 'Chin', 283.5, 158, 'chin'),
    landmark(front, 'neck-site', 'Anterior neck', 283.5, 185, 'central-anatomy'),
    landmark(front, 'right-shoulder-site', 'Right shoulder', 184, 215, 'right-neck-shoulder'),
    landmark(front, 'left-shoulder-site', 'Left shoulder', 383, 215, 'left-neck-shoulder'),
    landmark(front, 'sternum', 'Sternum', 283.5, 270, 'right-surface'),
    landmark(front, 'umbilicus-site', 'Umbilicus', 283.5, 409, 'umbilicus'),
    landmark(front, 'right-elbow-site', 'Right elbow', 181, 376, 'right-elbow-crease'),
    landmark(front, 'left-elbow-site', 'Left elbow', 386, 376, 'left-elbow-crease'),
    landmark(front, 'right-hand-site', 'Right hand', 180, 569, 'right-arm-hand-outline'),
    landmark(front, 'left-hand-site', 'Left hand', 387, 569, 'left-arm-hand-outline'),
    landmark(front, 'right-knee-site', 'Right knee', 246, 703, 'right-outer-thigh-knee-calf'),
    landmark(front, 'left-knee-site', 'Left knee', 321, 703, 'left-outer-thigh-knee-calf'),
    landmark(front, 'right-foot-site', 'Right foot', 242, 936, 'right-foot'),
    landmark(front, 'left-foot-site', 'Left foot', 325, 936, 'left-foot'),
  ];
  const back = { id: 'body-posterior', name: 'Body — posterior', x: 870, y: 18, width: 274, height: 945, view: 'posterior' };
  back.inner = group(back.id, 'artwork', 'Posterior body artwork', posterior(back.id), `translate(${-back.x} ${-back.y})`);
  back.landmarks = [
    landmark(back, 'occiput', 'Occiput', 1006, 72, 'left-head'),
    landmark(back, 'neck-site', 'Posterior neck', 1006, 162, 'left-surface'),
    landmark(back, 'left-shoulder-site', 'Left shoulder', 916, 220, 'left-neck-shoulder'),
    landmark(back, 'right-shoulder-site', 'Right shoulder', 1096, 220, 'right-neck-shoulder'),
    landmark(back, 'left-scapula-site', 'Left scapula', 974, 265, 'left-scapula-medial'),
    landmark(back, 'right-scapula-site', 'Right scapula', 1038, 265, 'right-scapula-medial'),
    landmark(back, 'lumbar-site', 'Lumbar midline', 1006, 388, 'lumbar-spine'),
    landmark(back, 'sacrum', 'Sacrum', 1006, 452, 'sacral-fold'),
    landmark(back, 'left-elbow-site', 'Left elbow', 905, 390, 'left-elbow'),
    landmark(back, 'right-elbow-site', 'Right elbow', 1107, 390, 'right-elbow'),
    landmark(back, 'left-hand-site', 'Left hand', 909, 567, 'left-hand-dorsum'),
    landmark(back, 'right-hand-site', 'Right hand', 1103, 567, 'right-hand-dorsum'),
    landmark(back, 'left-knee-site', 'Left posterior knee', 970, 688, 'left-outer-thigh-knee-calf'),
    landmark(back, 'right-knee-site', 'Right posterior knee', 1042, 688, 'right-outer-thigh-knee-calf'),
    landmark(back, 'heel-site', 'Left heel', 985, 936, 'left-foot'),
  ];
  const profileSites = [
    ['temple', 'Temple', 637, 82, 'body-contour'],
    ['ear-site', 'Ear', 655, 92, 'ear'],
    ['jaw-site', 'Jaw', 636, 133, 'jaw'],
    ['neck-site', 'Neck', 651, 196, 'neck-tendon'],
    ['shoulder-site', 'Shoulder', 689, 265, 'near-arm-hand'],
    ['chest-site', 'Chest', 607, 275, 'body-contour'],
    ['abdomen', 'Abdomen', 610, 409, 'body-contour'],
    ['elbow-site', 'Elbow', 686, 375, 'elbow'],
    ['wrist-site', 'Wrist', 632, 515, 'near-arm-hand'],
    ['hand-site', 'Hand', 623, 565, 'near-arm-hand'],
    ['hip-site', 'Hip', 710, 492, 'body-contour'],
    ['knee-site', 'Knee', 673, 692, 'body-contour'],
    ['ankle-site', 'Ankle', 697, 884, 'ankle'],
    ['foot-site', 'Near foot', 650, 926, 'body-contour'],
  ];
  const left = { id: 'body-profile-left', name: 'Body — left-facing profile', x: 571, y: 20, width: 170, height: 943, view: 'left-facing profile' };
  left.inner = group(left.id, 'artwork', 'Left-facing profile body artwork', profile(left.id), `translate(${-left.x} ${-left.y})`);
  left.landmarks = profileSites.map(([id, label, x, y, target]) => landmark(left, id, label, x, y, target));
  const right = { id: 'body-profile-right', name: 'Body — right-facing profile', x: 1274, y: 20, width: 175, height: 943, view: 'right-facing profile' };
  right.inner = group(right.id, 'artwork', 'Right-facing profile body artwork', group(right.id, 'reflected-construction', 'Reflected profile construction', profile(right.id), 'translate(2018 0) scale(-1 1)'), `translate(${-right.x} ${-right.y})`);
  right.landmarks = profileSites.map(([id, label, x, y, target]) => landmark(right, id, label, 2018 - x, y, target));
  return {
    id: 'body',
    title: 'Four-view clinical body chart — vector reconstruction',
    source: { filename: 'Four-view clinical body chart(1).png', width: 1575, height: 999 },
    assets: [front, left, back, right],
    texts: [],
  };
}
