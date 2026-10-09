import { pocket } from "./pocket";
import { foul } from "./foul";
import { eightFinish } from "./eight-finish";
import { rackFail } from "./rack-fail";

export const bankShotScenarios = {
  pocket,
  foul,
  "eight-finish": eightFinish,
  "rack-fail": rackFail
} as const;
