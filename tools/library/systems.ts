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
}

export const SYSTEMS: readonly SystemDef[] = [
  { id: 'nes', folder: 'nes', name: 'Nintendo Entertainment System', shortName: 'NES', maker: 'Nintendo', year: 1985,
    libretro: 'Nintendo - Nintendo Entertainment System', core: 'nestopia_libretro.dll', extensions: ['zip', 'nes', '7z'] },
  { id: 'snes', folder: 'snes', name: 'Super Nintendo', shortName: 'SNES', maker: 'Nintendo', year: 1991,
    libretro: 'Nintendo - Super Nintendo Entertainment System', core: 'snes9x_libretro.dll', extensions: ['zip', 'sfc', 'smc', '7z'] },
  { id: 'n64', folder: 'n64', name: 'Nintendo 64', shortName: 'N64', maker: 'Nintendo', year: 1996,
    libretro: 'Nintendo - Nintendo 64', core: 'mupen64plus_next_libretro.dll', extensions: ['z64', 'n64', 'v64', 'zip'] },
  { id: 'gba', folder: 'gba', name: 'Game Boy Advance', shortName: 'GBA', maker: 'Nintendo', year: 2001,
    libretro: 'Nintendo - Game Boy Advance', core: 'mgba_libretro.dll', extensions: ['zip', 'gba', '7z'] },
  { id: 'genesis', folder: 'genesis', name: 'Sega Genesis', shortName: 'Genesis', maker: 'Sega', year: 1989,
    libretro: 'Sega - Mega Drive - Genesis', core: 'genesis_plus_gx_libretro.dll', extensions: ['zip', 'md', 'gen', 'bin', 'smd', '7z'] },
  { id: 'mastersystem', folder: 'mastersystem', name: 'Sega Master System', shortName: 'Master System', maker: 'Sega', year: 1986,
    libretro: 'Sega - Master System - Mark III', core: 'genesis_plus_gx_libretro.dll', extensions: ['zip', 'sms', '7z'] },
  { id: 'pcengine', folder: 'pcengine', name: 'TurboGrafx-16', shortName: 'TurboGrafx-16', maker: 'NEC', year: 1989,
    libretro: 'NEC - PC Engine - TurboGrafx 16', core: 'mednafen_pce_fast_libretro.dll', extensions: ['zip', 'pce', '7z'] },
  { id: 'atari2600', folder: 'atari2600', name: 'Atari 2600', shortName: 'Atari 2600', maker: 'Atari', year: 1977,
    libretro: 'Atari - 2600', core: 'stella2014_libretro.dll', extensions: ['bin', 'a26', 'zip'] },
  { id: 'psx', folder: 'psx', name: 'PlayStation', shortName: 'PlayStation', maker: 'Sony', year: 1995,
    libretro: 'Sony - PlayStation', core: 'swanstation_libretro.dll', extensions: ['cue', 'chd', 'pbp', 'm3u'] },
  { id: 'arcade', folder: 'arcade', name: 'Arcade', shortName: 'Arcade', maker: 'Various', year: 1978,
    libretro: 'FBNeo - Arcade Games', libretroFallbacks: ['MAME'], core: 'fbneo_libretro.dll', extensions: ['zip'], arcade: true },
];

export const systemById = (id: string): SystemDef | undefined => SYSTEMS.find((s) => s.id === id);
