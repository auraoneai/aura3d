import { finc } from "../finc-lib";
import { TRAIN, TRAIN_CARD } from "../finc-games";

/** Lamplight Line evidence screens (RH-05 retake): desktop frames incl. the results card, and the 720x450 card. Remote only. */
finc([TRAIN, TRAIN_CARD], ["desktop", "card"], { settleBudgetMs: 120000 });
