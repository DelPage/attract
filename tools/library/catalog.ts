/** Shape of the library file the app reads. Shared by the builder and the app. */

export interface CatalogSystem {
  id: string;
  name: string;
  shortName: string;
  maker: string;
  year: number;
  gameCount: number;
  /** Console photo for the home screen card, relative to the library. */
  image?: string;
}

export interface CatalogVersion { label: string; path: string }

export interface CatalogArt { cover?: string; screen?: string; title?: string }

export interface CatalogGame {
  id: string;
  system: string;
  title: string;
  sortTitle: string;
  path: string;
  core: string;
  /** Other dumps of the same game (regions, revisions). */
  versions: CatalogVersion[];
  /** Demos, utilities and prototypes stay out of the default view. */
  extra: boolean;
  year?: number;
  developer?: string;
  publisher?: string;
  genre?: string;
  players?: number;
  description?: string;
  /** Size of the game's encyclopedia article; a rough measure of how well known it is. */
  fame?: number;
  /** Artwork source names on the libretro thumbnail server, per kind. */
  artSource: { set: string; cover?: string; screen?: string; title?: string };
  art: CatalogArt;
}

export interface Catalog {
  version: 1;
  generatedAt: string;
  systems: CatalogSystem[];
  games: CatalogGame[];
}
