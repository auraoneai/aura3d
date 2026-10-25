import { finc } from "./finc-lib";
import { SALT } from "./finc-games";

finc([SALT], ["title-mobile"], { settleBudgetMs: 1800000 });
