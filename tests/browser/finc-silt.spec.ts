import { finc } from "./finc-lib";
import { SILT } from "./finc-games";

finc([SILT], ["desktop", "mobile", "card"], { settleBudgetMs: 480000 });
