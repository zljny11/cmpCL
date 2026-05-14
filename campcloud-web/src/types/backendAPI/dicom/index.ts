import { Series } from '../list';

export interface SeriesData extends Series {
  volumeId: string;
  ImageIds: string[];
}
