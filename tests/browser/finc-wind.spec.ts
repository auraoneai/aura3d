import { finc } from "./finc-lib";
import { WIND } from "./finc-games";

finc([WIND], ["desktop", "mobile", "card"], { settleBudgetMs: 480000 });
