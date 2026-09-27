export interface SystemDef {
  id: string;
  folder: string;
  name: string;
  shortName: string;
  maker: string;
  year: number;
  /** libretro-thumbnails / libretro-database system name */
  libretro: string;
  /** Extra thumbnail sets to try after `libretro` (arcade uses both FBNeo and MAME art). */
  libretroFallbacks?: string[];
  core: string;
  extensions: string[];
  /** Arcade sets are named by short ROM names instead of titles. */
  arcade?: boolean;
  /** The system's own brand colors (top, bottom) for its home screen card. */
  brand: [string, string];
}

export const SYSTEMS: readonly SystemDef[] = [
  { id: 'nes', folder: 'nes', name: 'Nintendo Entertainment System', shortName: 'NES', maker: 'Nintendo', year: 1985,
    libretro: 'Nintendo - Nintendo Entertainment System', core: 'nestopia_libretro.dll', extensions: ['zip', 'nes', '7z'], brand: ['#c8102e', '#3b0610'] },
  { id: 'snes', folder: 'snes', name: 'Super Nintendo', shortName: 'SNES', maker: 'Nintendo', year: 1991,
    libretro: 'Nintendo - Super Nintendo Entertainment System', core: 'snes9x_libretro.dll', extensions: ['zip', 'sfc', 'smc', '7z'], brand: ['#6a4fc2', '#1c1238'] },
  { id: 'n64', folder: 'n64', name: 'Nintendo 64', shortName: 'N64', maker: 'Nintendo', year: 1996,
    libretro: 'Nintendo - Nintendo 64', core: 'mupen64plus_next_libretro.dll', extensions: ['z64', 'n64', 'v64', 'zip'], brand: ['#0f8a44', '#062616'] },
  { id: 'gba', folder: 'gba', name: 'Game Boy Advance', shortName: 'GBA', maker: 'Nintendo', year: 2001,
    libretro: 'Nintendo - Game Boy Advance', core: 'mgba_libretro.dll', extensions: ['zip', 'gba', '7z'], brand: ['#4a33b0', '#120b34'] },
  { id: 'genesis', folder: 'genesis', name: 'Sega Genesis', shortName: 'Genesis', maker: 'Sega', year: 1989,
    libretro: 'Sega - Mega Drive - Genesis', core: 'genesis_plus_gx_libretro.dll', extensions: ['zip', 'md', 'gen', 'bin', 'smd', '7z'], brand: ['#2b2b30', '#0a0a0c'] },
  { id: 'mastersystem', folder: 'mastersystem', name: 'Sega Master System', shortName: 'Master System', maker: 'Sega', year: 1986,
    libretro: 'Sega - Master System - Mark III', core: 'genesis_plus_gx_libretro.dll', extensions: ['zip', 'sms', '7z'], brand: ['#1352c4', '#061536'] },
  { id: 'pcengine', folder: 'pcengine', name: 'TurboGrafx-16', shortName: 'TurboGrafx-16', maker: 'NEC', year: 1989,
    libretro: 'NEC - PC Engine - TurboGrafx 16', core: 'mednafen_pce_fast_libretro.dll', extensions: ['zip', 'pce', '7z'], brand: ['#f26722', '#3a1204'] },
  { id: 'atari2600', folder: 'atari2600', name: 'Atari 2600', shortName: 'Atari 2600', maker: 'Atari', year: 1977,
    libretro: 'Atari - 2600', core: 'stella2014_libretro.dll', extensions: ['bin', 'a26', 'zip'], brand: ['#8a5528', '#1f1108'] },
  { id: 'psx', folder: 'psx', name: 'PlayStation', shortName: 'PlayStation', maker: 'Sony', year: 1995,
    libretro: 'Sony - PlayStation', core: 'swanstation_libretro.dll', extensions: ['cue', 'chd', 'pbp', 'm3u'], brand: ['#7b8088', '#18191c'] },
  { id: 'arcade', folder: 'arcade', name: 'Arcade', shortName: 'Arcade', maker: 'Various', year: 1978,
    libretro: 'FBNeo - Arcade Games', libretroFallbacks: ['MAME'], core: 'fbneo_libretro.dll', extensions: ['zip'], arcade: true, brand: ['#c2177c', '#1d0533'] },
];

export const systemById = (id: string): SystemDef | undefined => SYSTEMS.find((s) => s.id === id);
