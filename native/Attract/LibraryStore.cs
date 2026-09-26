using System;
using System.IO;
using System.IO.Compression;
using System.Threading.Tasks;
using Windows.Storage;
using Windows.Storage.Streams;

namespace Attract
{
    /// <summary>
    /// The game library (catalog.json plus artwork) lives in LocalState\library.
    /// A new library is delivered as LocalState\attract-library.zip through
    /// Device Portal and unpacked here on the next launch.
    /// </summary>
    internal static class LibraryStore
    {
        public const string ImportFileName = "attract-library.zip";
        private const string LibraryFolder = "library";
        private const string StagingFolder = "library-incoming";
        private const string UserStateFile = "user-state.json";
        private const int MaxUserStateChars = 256 * 1024;
        private const long MaxEntryBytes = 64L * 1024 * 1024;

        private static StorageFolder Local => ApplicationData.Current.LocalFolder;

        public static async Task<bool> HasPendingImportAsync()
        {
            return await Local.TryGetItemAsync(ImportFileName) is StorageFile;
        }

        public static async Task<bool> HasLibraryAsync()
        {
            var folder = await Local.TryGetItemAsync(LibraryFolder) as StorageFolder;
            return folder != null && await folder.TryGetItemAsync("catalog.json") is StorageFile;
        }

        /// <summary>Unpacks the uploaded zip into a staging folder, then swaps it in.</summary>
        public static async Task ImportAsync(IProgress<int> progress)
        {
            var zipFile = (StorageFile)await Local.GetItemAsync(ImportFileName);
            var staging = await Local.CreateFolderAsync(StagingFolder, CreationCollisionOption.ReplaceExisting);
            var root = Path.GetFullPath(staging.Path) + Path.DirectorySeparatorChar;
            await Task.Run(() =>
            {
                using (var archive = ZipFile.OpenRead(zipFile.Path))
                {
                    var total = Math.Max(1, archive.Entries.Count);
                    var done = 0;
                    foreach (var entry in archive.Entries)
                    {
                        var target = Path.GetFullPath(Path.Combine(root, entry.FullName));
                        if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidDataException("Library archive contains an unsafe path.");
                        }
                        if (string.IsNullOrEmpty(entry.Name))
                        {
                            Directory.CreateDirectory(target);
                        }
                        else
                        {
                            if (entry.Length > MaxEntryBytes) throw new InvalidDataException("Library archive entry is too large.");
                            Directory.CreateDirectory(Path.GetDirectoryName(target));
                            entry.ExtractToFile(target, true);
                        }
                        if (++done % 100 == 0) progress.Report(done * 100 / total);
                    }
                }
            });
            if (await staging.TryGetItemAsync("catalog.json") == null)
            {
                await staging.DeleteAsync(StorageDeleteOption.PermanentDelete);
                throw new InvalidDataException("Library archive has no catalog.");
            }
            var existing = await Local.TryGetItemAsync(LibraryFolder);
            if (existing != null) await existing.DeleteAsync(StorageDeleteOption.PermanentDelete);
            await staging.RenameAsync(LibraryFolder);
            await zipFile.DeleteAsync(StorageDeleteOption.PermanentDelete);
            progress.Report(100);
        }

        /// <summary>Opens a library file for the web view, or null when the path is invalid or missing.</summary>
        public static async Task<IRandomAccessStream> OpenAsync(string relativePath)
        {
            if (!IsSafeRelativePath(relativePath)) return null;
            try
            {
                var library = await Local.GetFolderAsync(LibraryFolder);
                var file = await library.TryGetItemAsync(relativePath.Replace('/', '\\')) as StorageFile;
                return file == null ? null : await file.OpenReadAsync();
            }
            catch
            {
                return null;
            }
        }

        private static bool IsSafeRelativePath(string path)
        {
            if (string.IsNullOrEmpty(path) || path.Length > 200 || path.Contains("..") || path.Contains("\\") || path.StartsWith("/")) return false;
            foreach (var c in path)
            {
                if (!(char.IsLetterOrDigit(c) || c == '/' || c == '-' || c == '_' || c == '.')) return false;
            }
            return true;
        }

        public static string ContentType(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".json": return "application/json";
                case ".webp": return "image/webp";
                case ".png": return "image/png";
                case ".jpg": return "image/jpeg";
                default: return "application/octet-stream";
            }
        }

        public static async Task<string> ReadUserStateAsync()
        {
            try
            {
                var file = await Local.TryGetItemAsync(UserStateFile) as StorageFile;
                if (file == null) return null;
                var text = await FileIO.ReadTextAsync(file);
                return text.Length <= MaxUserStateChars ? text : null;
            }
            catch
            {
                return null;
            }
        }

        public static async Task WriteUserStateAsync(string json)
        {
            if (json == null || json.Length > MaxUserStateChars) return;
            var file = await Local.CreateFileAsync(UserStateFile + ".tmp", CreationCollisionOption.ReplaceExisting);
            await FileIO.WriteTextAsync(file, json, Windows.Storage.Streams.UnicodeEncoding.Utf8);
            await file.RenameAsync(UserStateFile, NameCollisionOption.ReplaceExisting);
        }
    }
}
