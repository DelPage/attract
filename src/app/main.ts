import { onNativeMessage, postNative } from './bridge';
import { loadLibrary, type CatalogGame, type Library } from './data';
import { startInput } from './input';
import { DetailScreen } from './screens/detail';
import { HomeScreen } from './screens/home';
import { LibraryScreen } from './screens/library';
import { SearchScreen } from './screens/search';
import { Shell } from './shell';
import { restoreUserState } from './store';
import { h } from './ui';

function start(library: Library, root: HTMLElement): Shell {
  const shell = new Shell(root);
  const openGame = (game: CatalogGame, list: CatalogGame[]) => shell.push(new DetailScreen(library, game, list, shell));
  const openSearch = () => {
    if (shell.current instanceof SearchScreen) return;
    shell.push(new SearchScreen(library, shell, openGame));
  };
  shell.push(new HomeScreen(library, shell, {
    openSystem: (system) => shell.push(new LibraryScreen(library, system, shell, { openGame, openSearch })),
    openGame: (game) => openGame(game, [game]),
    openSearch,
  }));
  startInput((command) => shell.handle(command));
  onNativeMessage((m) => {
    const screen = shell.current;
    if (!(screen instanceof DetailScreen)) return;
    if (m.type === 'returned') screen.clearLaunch();
    else if (m.type === 'launch-failed') screen.clearLaunch('RetroArch could not start this game.');
  });
  onNativeMessage((m) => { if (m.type === 'retroarch' && m.available === false) shell.notice('RetroArch is not installed on this console, so games cannot start yet.'); });
  document.addEventListener('focusin', (e) => { if (e.target instanceof HTMLInputElement) postNative({ type: 'keyboard', show: true }); });
  document.addEventListener('focusout', (e) => { if (e.target instanceof HTMLInputElement) postNative({ type: 'keyboard', show: false }); });
  return shell;
}

function showProblem(root: HTMLElement, reason: string): void {
  const text = reason === 'library-missing'
    ? 'Your game library has not been set up on this console yet.'
    : 'Your game library could not be opened.';
  root.replaceChildren(h('div', { class: 'problem' }, h('h1', { text: 'Attract' }), h('p', { text })));
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  onNativeMessage((m) => { if (m.type === 'user-state') restoreUserState(m.state); });
  try {
    const library = await loadLibrary();
    start(library, root);
  } catch (error) {
    showProblem(root, error instanceof Error ? error.message : '');
  }
  postNative({ type: 'ready' });
}

void boot();
