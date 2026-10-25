import { finc } from "./finc-lib";
import { SALT_KEY } from "./finc-games";

finc([SALT_KEY], ["desktop"], { settleBudgetMs: 1800000 });
