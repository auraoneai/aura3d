import { finc } from "./finc-lib";
import { SALT } from "./finc-games";

finc([SALT], ["mobile"], { settleBudgetMs: 1800000 });
