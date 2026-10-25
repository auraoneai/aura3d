import { finc } from "./finc-lib";
import { TRAIN_RESULTS } from "./finc-games";

finc([TRAIN_RESULTS], ["desktop"], { settleBudgetMs: 120000 });
