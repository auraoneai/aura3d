import { finc } from "./finc-lib";
import { SALT_KEY } from "./finc-games";

finc([SALT_KEY], ["mobile"], { settleBudgetMs: 1800000 });
