import { ActionModule } from "./types";
import * as strategy from "./strategy";
import * as swap from "./swap";
import * as wallet from "./wallet";
import * as position from "./position";
import * as withdraw from "./withdraw";

export const modules: ActionModule[] = [
  strategy,
  swap,
  wallet,
  position,
  withdraw,
];
