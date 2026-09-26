using System;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Windows.System;

namespace Attract
{
    /// <summary>
    /// Starts a game in RetroArch through its "retroarch:" protocol and asks
    /// RetroArch to reopen Attract ("attract:") when the player quits.
    /// Only games inside the console's emulation folder can be started.
    /// </summary>
    internal static class GameLauncher
    {
        private const string RomRoot = @"D:\DevelopmentFiles\Emulation\roms\";
        private const string ReturnUri = "attract:";
        private static readonly Regex CorePattern = new Regex(@"^[a-z0-9_]+_libretro\.dll$", RegexOptions.CultureInvariant);

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

        public static Uri BuildUri(string core, string path)
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
                return await Launcher.LaunchUriAsync(BuildUri(core, path));
            }
            catch
            {
                return false;
            }
        }
    }
}
