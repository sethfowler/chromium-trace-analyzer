import { Attribution } from './attributions';
import { Breakdown } from './breakdowns';

export type PlayByPlayEntry = {
  name: string;
  attribution: Attribution;
  breakdown: Breakdown;
  taskIds: number[];
}

export type PlayByPlay = PlayByPlayEntry[];

export type HasPlayByPlay = {
  playByPlay: PlayByPlay;
}
