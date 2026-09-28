import { RegionCode, RegionPack } from "./types";

const packs = new Map<RegionCode, RegionPack>();

/** Region packs self-register at boot; the setup flow picks one by code. */
export function registerRegionPack(pack: RegionPack): void {
  packs.set(pack.code, pack);
}

export function getRegionPack(code: string): RegionPack | undefined {
  return packs.get(code as RegionCode);
}

export function listRegionPacks(): RegionPack[] {
  return [...packs.values()];
}
