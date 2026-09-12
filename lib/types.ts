/** Mirrors src/lib/types.ts from the desktop app -- same shape, since both
 * talk to the same Jellyfin REST API. */
export interface Library {
  Id: string;
  Name: string;
  CollectionType: string | null;
}

export interface UserData {
  PlaybackPositionTicks: number | null;
  PlayedPercentage: number | null;
}

export interface MediaStream {
  Index: number;
  Type: "Audio" | "Subtitle" | "Video" | string;
  DisplayTitle?: string | null;
  Language?: string | null;
  Codec?: string | null;
}

export interface MediaSource {
  Id: string;
  MediaStreams?: MediaStream[];
}

export interface Item {
  Id: string;
  Name: string;
  Type: "Movie" | "Series" | "Season" | "Episode" | string;
  Overview: string | null;
  ProductionYear: number | null;
  RunTimeTicks: number | null;
  IndexNumber: number | null;
  SeriesName: string | null;
  SeriesId: string | null;
  SeasonId: string | null;
  UserData: UserData | null;
  BackdropImageTags: string[] | null;
  ParentBackdropItemId: string | null;
  Genres: string[] | null;
  CommunityRating: number | null;
  OfficialRating: string | null;
  Taglines: string[] | null;
  ImageTags: Record<string, string> | null;
  People?: { Name: string; Role?: string }[];
}

export function hasLogo(item: Item): boolean {
  return !!item.ImageTags?.Logo;
}

export function backdropSourceId(item: Item): string | null {
  if (item.BackdropImageTags && item.BackdropImageTags.length > 0) return item.Id;
  return item.ParentBackdropItemId;
}

export function formatRuntime(ticks: number | null): string {
  if (!ticks) return "";
  const totalMinutes = Math.round(ticks / 10_000_000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function episodeLabel(item: Item): string {
  return item.IndexNumber ? `E${item.IndexNumber} · ${item.Name}` : item.Name;
}
