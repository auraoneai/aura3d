import { finc } from "./finc-lib";
import { TRAIN_CARD } from "./finc-games";

finc([TRAIN_CARD], ["card"], { settleBudgetMs: 60000 });
