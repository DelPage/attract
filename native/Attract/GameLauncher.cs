using System;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Windows.Storage;
using Windows.System;

namespace Attract
{
    /// <summary>
    /// Starts a game in RetroArch through its "retroarch:" protocol and asks
    /// RetroArch to reopen Attract ("attract:") when the player quits.
    ///
    /// RetroArch ignores a new game while it is still running (for example
    /// after the player pressed the Xbox button instead of quitting). In that
    /// case Attract remembers the game, asks RetroArch to exit and reopen
    /// "attract:continue", and starts the remembered game from there.
    /// Only games inside the console's emulation folder can be started.
    /// </summary>
    internal static class GameLauncher
    {
        private const string RomRoot = @"D:\DevelopmentFiles\Emulation\roms\";
        private const string ReturnUri = "attract:";
        private const string ContinueUri = "attract:continue";
        private const string ActiveKey = "retroarchActive";
        private const string PendingCoreKey = "pendingCore";
        private const string PendingPathKey = "pendingPath";
        private static readonly Regex CorePattern = new Regex(@"^[a-z0-9_]+_libretro\.dll$", RegexOptions.CultureInvariant);

        private static ApplicationDataContainer Settings => ApplicationData.Current.LocalSettings;

        public static bool IsAllowed(string core, string path)
        {
            if (string.IsNullOrEmpty(core) || string.IsNullOrEmpty(path) || path.Length > 400) return false;
            if (!CorePattern.IsMatch(core)) return false;
            if (!path.StartsWith(RomRoot, StringComparison.OrdinalIgnoreCase)) return false;
            if (path.Contains("..") || path.Contains("\"") || path.IndexOf('/') >= 0) return false;
            foreach (var c in path)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static Uri GameUri(string core, string path)
        {
            var command = "retroarch -L cores\\" + core + " \"" + path + "\"";
            return new Uri("retroarch:?cmd=" + Uri.EscapeDataString(command) + "&launchOnExit=" + Uri.EscapeDataString(ReturnUri));
        }

        public static async Task<bool> IsRetroArchInstalledAsync()
        {
            try
            {
                var support = await Launcher.QueryUriSupportAsync(new Uri("retroarch:"), LaunchQuerySupportType.Uri);
                return support == LaunchQuerySupportStatus.Available;
            }
            catch
            {
                return false;
            }
        }

        public static async Task<bool> LaunchAsync(string core, string path)
        {
            if (!IsAllowed(core, path)) return false;
            try
            {
                if (Settings.Values[ActiveKey] as bool? == true)
                {
                    Settings.Values[PendingCoreKey] = core;
                    Settings.Values[PendingPathKey] = path;
                    var restart = "retroarch:?launchOnExit=" + Uri.EscapeDataString(ContinueUri) + "&forceExit=1";
                    return await Launcher.LaunchUriAsync(new Uri(restart));
                }
                return await StartAsync(core, path);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>RetroArch closed after a restart request; start the remembered game.</summary>
        public static async Task<bool> ContinuePendingAsync()
        {
            var core = Settings.Values[PendingCoreKey] as string;
            var path = Settings.Values[PendingPathKey] as string;
            Settings.Values.Remove(PendingCoreKey);
            Settings.Values.Remove(PendingPathKey);
            if (!IsAllowed(core, path)) return false;
            try
            {
                return await StartAsync(core, path);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>The player quit RetroArch normally, so it is no longer running.</summary>
        public static void MarkReturned()
        {
            Settings.Values[ActiveKey] = false;
        }

        public static bool IsContinue(Uri uri)
        {
            return uri != null && string.Equals(uri.AbsoluteUri.TrimEnd('/'), ContinueUri, StringComparison.OrdinalIgnoreCase);
        }

        private static async Task<bool> StartAsync(string core, string path)
        {
            var started = await Launcher.LaunchUriAsync(GameUri(core, path));
            if (started) Settings.Values[ActiveKey] = true;
            return started;
        }
    }
}
