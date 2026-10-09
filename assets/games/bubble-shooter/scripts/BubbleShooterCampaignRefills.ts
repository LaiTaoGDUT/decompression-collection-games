import type { CraftedLayout } from './BubbleShooterCraftedBoards';

/** Three finite, distinct refill layouts for each boss, with fresh identities on entry. */
export const CAMPAIGN_BOSS_REFILLS: Readonly<Record<string, readonly CraftedLayout[]>> = {
    "cloud-10": [
        {
            rows: [".YY....RR....", ".Y.....R....", ".BB....Y.....", ".BB.YYYYRR..", ".BB.YYBBRR...", "..BBYYBBYY..", "...RRYYBBR...", "...RRYYBB..."],
        },
        {
            rows: [".RR..YY..BB..", ".R...Y...B..", ".YY..RR..YY..", ".YYY.RR.YYY.", "..BB.RR.BB...", "..BBYYYBB...", "...RRYYRR....", "...RR..RR..."],
            frost: [{"row":2,"col":1},{"row":2,"col":9}],
        },
        {
            rows: ["..Y.......B..", "..R......R..", "..YYRRRBB....", "..YYRRBB....", "...BBYYRR....", "...BBYYR...."],
            frost: [{"row":2,"col":3},{"row":2,"col":7},{"row":3,"col":3}],
        },
    ],
    "cloud-20": [
        {
            rows: ["....RYB......", "....RYB.....", "...RRRRYY....", "...RRRYY....", "..BBYYRRBB...", "..BBYYRRBB..", ".YYBBPPYYRR..", ".YYBBPPYYRR.", "..YY..PP..RR."],
            frost: [{"row":4,"col":2},{"row":4,"col":3},{"row":4,"col":6},{"row":4,"col":7},{"row":6,"col":1},{"row":6,"col":2},{"row":6,"col":5},{"row":6,"col":6}],
        },
        {
            rows: [".RY..BP..YR..", ".RY..BP..YR.", ".BB..YY..PP..", ".BB..YY..PP.", "..RRYYBBPP...", "..RRYYBBPP..", "...YYRRYY....", "...YYRRYY...", "....BBYY.....", "....BBY....."],
            frost: [{"row":2,"col":1},{"row":2,"col":2},{"row":2,"col":9},{"row":2,"col":10},{"row":6,"col":5},{"row":6,"col":6}],
        },
        {
            rows: ["..RY....BP...", "..RY...BP...", "..BBRRYYBB...", "..BBRRYYBB..", "...YYBBYY....", "...YYBBY....", "....RRYY.....", "....RRYY....", ".....BB......"],
            frost: [{"row":2,"col":4},{"row":2,"col":5},{"row":3,"col":4},{"row":3,"col":5},{"row":6,"col":4},{"row":6,"col":5}],
        },
    ],
    "cloud-30": [
        {
            rows: ["..RR..YY..BB.", "..R...Y...B.", "..BB..YY..PP.", "..BB..YY..PP", ".YYBBRRYYPP..", ".YYBBRRYYPP.", ".BBYYPPRRBB..", ".BBYYPPRRBB.", "..YYBBPPYYRR.", "..YYBBPPYYR.", "...PP..YY..R."],
            frost: [{"row":4,"col":5},{"row":4,"col":6},{"row":6,"col":1},{"row":6,"col":2},{"row":6,"col":7},{"row":6,"col":8}],
        },
        {
            rows: [".RY..BP..YP..", ".RY..BP..YP.", ".BB..YY..RR..", ".BB..YY..RR.", "..PPBBRRYY...", "..PPBBRRYY..", "...YYBBPPRR..", "...YYBBPPRR.", "....RRYYBB...", "....RRYYB...", ".....PPBB...."],
            frost: [{"row":2,"col":5},{"row":2,"col":6},{"row":4,"col":6},{"row":4,"col":7},{"row":6,"col":7},{"row":6,"col":8},{"row":8,"col":4},{"row":8,"col":5}],
        },
        {
            rows: [".RY..BP..YR..", ".RY..BP..YR.", ".YY..BB..RR..", ".YY..BB..RR.", "..PPYYBBRR...", "..PPYBBRR...", "...BBYYPP....", "...BBYYPP...", "....RRYYPP...", "....RRYYP..."],
            frost: [{"row":2,"col":1},{"row":2,"col":2},{"row":2,"col":9},{"row":2,"col":10},{"row":6,"col":3},{"row":6,"col":4},{"row":6,"col":5},{"row":6,"col":6}],
        },
    ],
    "ocean-10": [
        {
            rows: [".....RY......", ".....RY.....", "....BBBB.....", "....BBB.....", "...YYRRYY....", "...YYRYY....", "..RRBBYYBB...", "..RRBBYYB...", "...RRYYBB...."],
            anchors: [{"row":4,"col":5},{"row":4,"col":6},{"row":5,"col":5}],
        },
        {
            rows: [".RY..BY..YR..", ".RY..BY..YR.", ".BB..YY..YY..", ".BB..YY..YY.", "..RRRRBBYY...", "..RRRBBY.Y..", "...YYBBRR....", "...YYBBRR...", "....YYYY....."],
            anchors: [{"row":4,"col":4},{"row":4,"col":5},{"row":5,"col":4}],
        },
        {
            rows: [".RY..BB..YY..", ".RY..BB..YY.", ".YY..RR..BB..", ".YYR.RR.BBR.", "..BB.YY.RR...", "..BBYYYRR...", "...RRBBYY....", "...RRBBY...."],
            anchors: [{"row":3,"col":3},{"row":3,"col":10}],
        },
    ],
    "ocean-20": [
        {
            rows: ["..RY.....BP..", "..RY....BP..", "..BB....YY...", "..BBB..YYY..", ".YYRRBBRRRPP.", ".YYRRBBRRRPP", "..BBYYPPBBYY.", "..BBYYPPBBY.", "...RR..YYBB.."],
            anchors: [{"row":4,"col":3},{"row":4,"col":4},{"row":4,"col":7},{"row":5,"col":3},{"row":5,"col":4},{"row":5,"col":7}],
        },
        {
            rows: ["RY..BP..YP...", "RY..BP..YP..", ".BB.YY..RR...", ".BB.YY.RRR..", "..RR.BB.RRPP.", "..RRBB.RRPP.", "...YYBBRPP...", "...YYBBRPP..", "....RRYYPP..."],
            anchors: [{"row":4,"col":2},{"row":4,"col":3},{"row":4,"col":8},{"row":4,"col":9},{"row":6,"col":7},{"row":5,"col":2}],
        },
        {
            rows: ["RY..BP....YR.", "RY..BP...YR.", ".BB.YY...PP..", ".BBRRYY.PPP.", "..RR..BBYYY..", "..RR.BBYYY..", "...YYPPBB....", "...YYRPPB...", "....RRBBPP..."],
            anchors: [{"row":3,"col":3},{"row":3,"col":4},{"row":7,"col":5}],
        },
    ],
    "ocean-30": [
        {
            rows: [".RR......BB..", ".R.......B..", ".BB..YY..RR..", ".BBB.YY.RRR.", "..YYBBPPYYR..", "..YYBBPPYY..", ".RR.RRBB.RRPP", ".RRRRBB.RRPP", "..YYBBPPYYBB.", "..YYBBPPYYB.", "...RR..PPYY.."],
            anchors: [{"row":6,"col":4},{"row":6,"col":5},{"row":6,"col":9},{"row":7,"col":3},{"row":7,"col":4},{"row":7,"col":8}],
        },
        {
            rows: ["RY..BP..YR..P", "RY..BP..YR.P", ".BB.YY..PP.RR", ".BB.YY.PP.RR", "..RR.BB.RRPPY", "..RRBB.RRPPY", "...YYBB.RRPP.", "...YYBBRRPP.", "....RRYYPPBB.", "....RRYYPPB.", ".....BBPP...."],
            anchors: [{"row":4,"col":2},{"row":4,"col":3},{"row":4,"col":8},{"row":4,"col":9},{"row":7,"col":7},{"row":7,"col":8}],
        },
        {
            rows: [".RY..BP...YP.", ".RY..BP..YP.", ".BB..YY..RR..", ".BBB.YY.RRR.", "..YYRRBBPP...", "..YYRRBBPP..", "...BBYYR.PP..", "...BBYYRPP..", "....RRBBYY...", "....RRBBY...", ".....PPYY...."],
            anchors: [{"row":6,"col":7},{"row":7,"col":7}],
        },
    ],
    "toy-10": [
        {
            rows: ["...RY...BY...", "...RY..BY...", "...BB..YY....", "...BB..YY...", "..RRRYYBBB...", "..RRYYBBB...", "..YYBBRRYYB..", "..YYBBRRYY..", "...RRYYBB...."],
            rails: [{"row":3,"start":2,"end":10,"direction":1}],
        },
        {
            rows: [".RY..BY..RB..", ".RY..BY..RB.", ".BB..YY..RR..", ".BBR.YY.RRR.", "..YY.RR.BB...", "..YY.RR.BB..", "...BBYYRR....", "...BBYYRR...", "....YYBB....."],
            rails: [{"row":2,"start":1,"end":10,"direction":1},{"row":4,"start":2,"end":10,"direction":1}],
        },
        {
            rows: ["RY.......BY..", "RY......BY..", ".BB.....YY...", ".BBR...YYY..", "..YY..RRBB...", "..YY..RRBB..", "...BBYYRR....", "...BBYYR....", "....RRBB....."],
            rails: [{"row":2,"start":1,"end":10,"direction":-1}],
        },
    ],
    "toy-20": [
        {
            rows: [".RY...BP..YP.", ".RY..BP..YP.", ".BB..YY..RR..", ".BB..YY.RRR.", "..RRBBYYPP...", "..RRB.YYPP..", ".YYPPBBRRYY..", ".YYPPBBRRYY.", "..BBYYPPBBR..", "..BBYYPPBB.."],
            rails: [{"row":3,"start":1,"end":10,"direction":1},{"row":5,"start":2,"end":10,"direction":-1}],
        },
        {
            rows: ["..RY..BP..YP.", "..RY..BP.YP.", "..BB..YY.RR..", "..BBR.YY.RR.", "...RR.BBYY...", "...RRBBYY...", "..YYPPBBRR...", "..YYPPBBRR..", "...BBYYPP...."],
            rails: [{"row":3,"start":1,"end":10,"direction":1},{"row":5,"start":2,"end":10,"direction":-1}],
        },
        {
            rows: [".RY..BP..YR..", ".RY..BP..YR.", ".BB..YY..PP..", ".BBR.YY.PPP.", "..YY.RR.PPB..", "..YYYRRPPB..", "...BBYYRR....", "...BBYYRR...", "....YYPPBB..."],
            rails: [{"row":3,"start":1,"end":10,"direction":1},{"row":5,"start":2,"end":10,"direction":-1}],
        },
    ],
    "toy-30": [
        {
            rows: [".RY...BP..YP.", ".RY..BP..YP.", ".BB..YY..RR..", ".BB..YY.RRR.", "..RR.BBYYPP..", "..RRBBYYPP..", ".YYPP.BBRRYY.", ".YYPPBBRRYY.", "..BBYY.PPBBR.", "..BBYYPPBB..", "..RR..YY..PP."],
            rails: [{"row":3,"start":1,"end":10,"direction":1},{"row":6,"start":1,"end":11,"direction":-1},{"row":8,"start":2,"end":10,"direction":1}],
        },
        {
            rows: ["RY..BP..YP..R", "RY..BP..YP.R", ".BB.YY..RR.PP", ".BB.YY.RR.PP", "..RR.BBYYPP..", "..RRBBYYPP..", "...YY.PPBBR..", "...YYPPBBR..", "..BB.RRYYPP..", "..BBRRYYPP..", "...PP.BBYYR..", "...PPBBYYR.."],
            rails: [{"row":2,"start":1,"end":11,"direction":1},{"row":4,"start":2,"end":10,"direction":-1},{"row":8,"start":2,"end":10,"direction":1}],
        },
        {
            rows: ["R..BP.....YP.", "R..BP....YP.", ".BBYY....RR..", ".BBYY...RRR.", "..RR.BBYYY...", "..RRBBYYY...", "...YY.PPBBR..", "...YYPPBBR..", "....RR.BBYY..", "....RRBBYY..", ".....PPBB...."],
            rails: [{"row":2,"start":1,"end":10,"direction":1},{"row":6,"start":2,"end":10,"direction":-1},{"row":8,"start":2,"end":10,"direction":1}],
        },
    ],
    "magic-10": [
        {
            rows: ["...R....Y....", "...R...Y....", "...RB..YY....", "...BB..YY...", "..RRRYYBBB...", "..RRYYBBB...", "..YYBBRRYYB..", "..YYBBRRYY..", "...RRYYBB...."],
            runes: [{"row":2,"col":3,"next":"blue"},{"row":2,"col":4,"next":"red"}],
        },
        {
            rows: [".R...Y...P...", ".R...Y...P..", ".RB..YY..YP..", ".BBR.YY.PPP.", "..YY.RR.BB...", "..YY.RR.BB..", "...BBYYRR....", "...BBYYRR...", "....YYBB....."],
            runes: [{"row":2,"col":1,"next":"blue"},{"row":2,"col":2,"next":"red"},{"row":2,"col":9,"next":"purple"},{"row":2,"col":10,"next":"yellow"}],
        },
        {
            rows: ["R.........R..", "B........B..", ".YY.....YY...", ".YYR...YYY..", "..YY..RRBB...", "..YY..RRBB..", "...BBYYRR....", "...BBYYR....", "....RRBB....."],
            runes: [{"row":1,"col":0,"next":"red"},{"row":1,"col":9,"next":"red"}],
        },
    ],
    "magic-20": [
        {
            rows: [".R....Y...P..", ".R...Y...P..", ".RB..YY..YP..", ".BB..YY.PPP.", "..RRBBYYPP...", "..RRB.YYPP..", ".YYPPBBRRYY..", ".YYPPBBRRYY.", "..BBYYPPBBR..", "..BBYYPPBB.."],
            runes: [{"row":2,"col":1,"next":"blue"},{"row":2,"col":2,"next":"red"},{"row":2,"col":9,"next":"purple"},{"row":2,"col":10,"next":"yellow"}],
        },
        {
            rows: ["..R...Y...P..", "..R...Y..P..", "..RB..YY.YP..", "..BBR.YY.PP.", "...RR.BBYY...", "...RRBBYY...", "..YYPPRBRR...", "..YYPPBBRR..", "...BBYYPP...."],
            runes: [{"row":2,"col":2,"next":"blue"},{"row":2,"col":3,"next":"red"},{"row":2,"col":9,"next":"purple"},{"row":2,"col":10,"next":"yellow"},{"row":6,"col":6,"next":"blue"},{"row":6,"col":7,"next":"red"}],
        },
        {
            rows: [".R...Y...P...", ".R...Y...P..", ".RB..YP..PP..", ".BBR.YY.PPP.", "..YY.RR.PPB..", "..YYYRRPPB..", "...BBRBRR....", "...BBYYRR...", "....YYPPBB..."],
            runes: [{"row":2,"col":1,"next":"blue"},{"row":2,"col":2,"next":"red"},{"row":2,"col":5,"next":"purple"},{"row":2,"col":6,"next":"yellow"},{"row":6,"col":5,"next":"blue"},{"row":6,"col":6,"next":"red"}],
        },
    ],
    "magic-30": [
        {
            rows: [".R....Y...P..", ".R...Y...P..", ".RB..YY..YP..", ".BB..YY.PPP.", "..RR.RBYYPP..", "..RRBBYYPP..", ".YYPP.YPRRYY.", ".YYPPBBRRYY.", "..BBYY.PPBBR.", "..BBYYPPBB..", "..RR..YY..PP."],
            runes: [{"row":2,"col":1,"next":"blue"},{"row":2,"col":2,"next":"red"},{"row":2,"col":9,"next":"purple"},{"row":2,"col":10,"next":"yellow"},{"row":4,"col":5,"next":"blue"},{"row":4,"col":6,"next":"red"},{"row":6,"col":6,"next":"purple"},{"row":6,"col":7,"next":"yellow"}],
        },
        {
            rows: ["R...Y...P...B", "R...Y...P..B", ".RB.YY..YP.PP", ".BB.YY.PP.PP", "..RR.RBYYPP..", "..RRBBYYPP..", "...YY.YPBBR..", "...YYPPBBR..", "..BB.RBYYPP..", "..BBRRYYPP..", "...PP.YPYYR..", "...PPBBYYR.."],
            runes: [{"row":2,"col":1,"next":"blue"},{"row":2,"col":2,"next":"red"},{"row":2,"col":8,"next":"purple"},{"row":2,"col":9,"next":"yellow"},{"row":4,"col":5,"next":"blue"},{"row":4,"col":6,"next":"red"},{"row":6,"col":6,"next":"purple"},{"row":6,"col":7,"next":"yellow"},{"row":8,"col":5,"next":"blue"},{"row":8,"col":6,"next":"red"},{"row":10,"col":6,"next":"purple"},{"row":10,"col":7,"next":"yellow"}],
        },
        {
            rows: ["R..Y......P..", "R..Y.....P..", ".RBYY....YP..", ".BBYY...PPP.", "..RR.RBYYY...", "..RRBBYYY...", "...YY.YPBBR..", "...YYPPBBR..", "....RR.RBYY..", "....RRBBYY..", ".....PPBB...."],
            runes: [{"row":2,"col":1,"next":"blue"},{"row":2,"col":2,"next":"red"},{"row":2,"col":9,"next":"purple"},{"row":2,"col":10,"next":"yellow"},{"row":4,"col":5,"next":"blue"},{"row":4,"col":6,"next":"red"},{"row":6,"col":6,"next":"purple"},{"row":6,"col":7,"next":"yellow"},{"row":8,"col":7,"next":"blue"},{"row":8,"col":8,"next":"red"}],
        },
    ],
};
