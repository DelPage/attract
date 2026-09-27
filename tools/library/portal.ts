/** Read-only Xbox Device Portal file listing for the emulation folder. */
import { Agent, fetch } from 'undici';

// The console serves Device Portal with a self-signed certificate on the owner's LAN.
const portalAgent = new Agent({ connect: { rejectUnauthorized: false } });

export interface PortalFile { name: string; relPath: string; size: number }

const ROMS = '\\Emulation\\roms';
/** The same folder as RetroArch sees it on the console. */
export const CONSOLE_ROMS = 'D:\\DevelopmentFiles\\Emulation\\roms';

interface PortalItem { Name: string; Type: number; FileSize?: number }
const DIRECTORY = 16;

export class Portal {
  constructor(private readonly base: string) {}

  private async list(path: string): Promise<PortalItem[]> {
    const url = `${this.base}/api/filesystem/apps/files?knownfolderid=DevelopmentFiles&path=${encodeURIComponent(path)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000), dispatcher: portalAgent });
    if (!response.ok) throw new Error(`Device Portal listing failed for ${path}: HTTP ${response.status}`);
    const body = (await response.json()) as { Items?: PortalItem[] };
    return body.Items ?? [];
  }

  /** Files under roms\<folder>, recursing into subfolders up to `depth` levels (disc games live in folders). */
  async systemFiles(folder: string, depth = 3): Promise<PortalFile[]> {
    const out: PortalFile[] = [];
    const walk = async (rel: string, level: number): Promise<void> => {
      for (const item of await this.list(`${ROMS}\\${folder}${rel}`)) {
        const relPath = `${rel}\\${item.Name}`;
        if (item.Type & DIRECTORY) { if (level < depth) await walk(relPath, level + 1); }
        else out.push({ name: item.Name, relPath: relPath.slice(1), size: item.FileSize ?? 0 });
      }
    };
    await walk('', 0);
    return out;
  }
}

