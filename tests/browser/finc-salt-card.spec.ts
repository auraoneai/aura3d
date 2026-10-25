import { finc } from "./finc-lib";
import { SALT } from "./finc-games";

finc([SALT], ["card"], { settleBudgetMs: 1800000 });
