import { registerRegionPack } from "../registry";
import { usRegionPack } from "./us";

/** Every region pack the build ships with. New regions are added here. */
export function registerBuiltinRegionPacks(): void {
  registerRegionPack(usRegionPack);
}
