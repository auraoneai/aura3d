import { finc } from "./finc-lib";
import { TRAIN } from "./finc-games";

finc([TRAIN], ["desktop", "mobile", "card"], { settleBudgetMs: 240000 });
