import { finc } from "../finc-lib";
import { TRAIN_CARD } from "../finc-games";

/** Lamplight Line evidence screens (RH-05 retake): the 720x450 card at 2x and 1x. Remote only. */
finc([TRAIN_CARD], ["card"], { settleBudgetMs: 120000 });
