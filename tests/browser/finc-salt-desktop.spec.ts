import { finc } from "./finc-lib";
import { SALT } from "./finc-games";

finc([SALT], ["desktop"], { settleBudgetMs: 1800000 });
