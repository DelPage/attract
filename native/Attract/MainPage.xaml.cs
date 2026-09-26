using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using System;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.UI;
using Windows.UI.Core;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Media;

namespace Attract
{
    public sealed partial class MainPage : Windows.UI.Xaml.Controls.Page
    {
        private const string AppHost = "attract.internal";
        private const string LibraryHost = "library.attract.internal";
        private const string AppOrigin = "http://" + AppHost;
        private const string LibraryPrefix = "http://" + LibraryHost + "/";

        private readonly DispatcherTimer gamepadTimer;
        private readonly GamepadBridge gamepad = new GamepadBridge();
        private WebView2 browser;
        private bool pageReady;
        private bool isSuspended;
        private bool keyboardVisible;
        private bool isStarting;
        private DateTimeOffset lastBackAt = DateTimeOffset.MinValue;

        public MainPage()
        {
            InitializeComponent();
            ApplicationView.GetForCurrentView().SetDesiredBoundsMode(ApplicationViewBoundsMode.UseCoreWindow);
            gamepadTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
            gamepadTimer.Tick += OnGamepadTick;
            var inputPane = InputPane.GetForCurrentView();
            inputPane.Showing += (s, e) => { keyboardVisible = true; PostMessage(Message("input-owner", "active", false)); };
            inputPane.Hiding += (s, e) => { keyboardVisible = false; gamepad.RequireNeutral(); };
            SystemNavigationManager.GetForCurrentView().BackRequested += OnBackRequested;
            _ = StartAsync();
        }

        private async Task StartAsync()
        {
            if (isStarting) return;
            isStarting = true;
            RetryButton.Visibility = Visibility.Collapsed;
            try
            {
                if (await LibraryStore.HasPendingImportAsync())
                {
                    ShowStatus("Setting up your game library", "This takes a minute the first time.", showProgress: true);
                    var progress = new Progress<int>(p => StatusProgress.Value = p);
                    await LibraryStore.ImportAsync(progress);
                }
                StatusOverlay.Visibility = Visibility.Collapsed;
                await InitializeWebViewAsync();
            }
            catch
            {
                ShowStatus("Your game library could not be opened", "Upload the library again, then try again.", showRetry: true);
            }
            finally
            {
                isStarting = false;
            }
        }

        private void ShowStatus(string title, string text, bool showProgress = false, bool showRetry = false)
        {
            StatusTitle.Text = title;
            StatusText.Text = text;
            StatusProgress.Visibility = showProgress ? Visibility.Visible : Visibility.Collapsed;
            RetryButton.Visibility = showRetry ? Visibility.Visible : Visibility.Collapsed;
            StatusOverlay.Visibility = Visibility.Visible;
            if (showRetry) RetryButton.Focus(FocusState.Programmatic);
        }

        private async Task InitializeWebViewAsync()
        {
            pageReady = false;
            browser = new WebView2 { Background = new SolidColorBrush(Color.FromArgb(255, 20, 18, 24)) };
            BrowserHost.Children.Clear();
            BrowserHost.Children.Add(browser);
            await browser.EnsureCoreWebView2Async();
            var core = browser.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.SetVirtualHostNameToFolderMapping(AppHost, "WebCode", CoreWebView2HostResourceAccessKind.DenyCors);
            await core.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.ATTRACT_NATIVE=true;window.ATTRACT_LIBRARY='" + LibraryPrefix + "';");
            core.AddWebResourceRequestedFilter(LibraryPrefix + "*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += OnLibraryRequested;
            core.NavigationStarting += (s, e) => { if (!IsAppUri(e.Uri)) e.Cancel = true; };
            core.NewWindowRequested += (s, e) => e.Handled = true;
            core.LaunchingExternalUriScheme += (s, e) => e.Cancel = true;
            core.ProcessFailed += (s, e) => ShowStatus("Attract stopped unexpectedly", "Try again to reopen your library.", showRetry: true);
            browser.WebMessageReceived += OnWebMessage;
            browser.Focus(FocusState.Programmatic);
            browser.Source = new Uri(AppOrigin + "/index.html");
        }

        private static bool IsAppUri(string value)
        {
            return Uri.TryCreate(value, UriKind.Absolute, out var uri)
                && uri.Scheme == "http" && string.Equals(uri.Host, AppHost, StringComparison.OrdinalIgnoreCase) && uri.IsDefaultPort;
        }

        /// <summary>Serves catalog.json and artwork from LocalState\library.</summary>
        private async void OnLibraryRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs args)
        {
            var deferral = args.GetDeferral();
            try
            {
                var uri = new Uri(args.Request.Uri);
                var relative = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
                var stream = args.Request.Method == "GET" ? await LibraryStore.OpenAsync(relative) : null;
                var cache = relative == "catalog.json" ? "no-cache" : "max-age=31536000, immutable";
                var headers = "Access-Control-Allow-Origin: " + AppOrigin + "\r\nCache-Control: " + cache;
                args.Response = stream == null
                    ? sender.Environment.CreateWebResourceResponse(null, 404, "Not Found", "Access-Control-Allow-Origin: " + AppOrigin)
                    : sender.Environment.CreateWebResourceResponse(stream, 200, "OK", "Content-Type: " + LibraryStore.ContentType(relative) + "\r\n" + headers);
            }
            catch
            {
                args.Response = sender.Environment.CreateWebResourceResponse(null, 500, "Error", string.Empty);
            }
            finally
            {
                deferral.Complete();
            }
        }

        private async void OnWebMessage(WebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            if (!IsAppUri(args.Source) || !JsonObject.TryParse(args.WebMessageAsJson, out var message)) return;
            try
            {
                switch (message.GetNamedString("type", string.Empty))
                {
                    case "ready":
                        pageReady = true;
                        gamepad.RequireNeutral();
                        if (!isSuspended) gamepadTimer.Start();
                        await SendStartupStateAsync();
                        break;
                    case "launch":
                        await LaunchAsync(message);
                        break;
                    case "user-state":
                        var state = message.GetNamedObject("state", null);
                        if (state != null) await LibraryStore.WriteUserStateAsync(state.Stringify());
                        break;
                    case "keyboard":
                        if (message.GetNamedBoolean("show", false)) InputPane.GetForCurrentView().TryShow();
                        else InputPane.GetForCurrentView().TryHide();
                        break;
                }
            }
            catch
            {
                // A failed message never takes the interface down.
            }
        }

        private async Task SendStartupStateAsync()
        {
            var saved = await LibraryStore.ReadUserStateAsync();
            if (saved != null && JsonObject.TryParse(saved, out var state))
            {
                var message = Message("user-state");
                message["state"] = state;
                PostMessage(message);
            }
            var retroarch = Message("retroarch");
            retroarch["available"] = JsonValue.CreateBooleanValue(await GameLauncher.IsRetroArchInstalledAsync());
            PostMessage(retroarch);
        }

        private async Task LaunchAsync(JsonObject message)
        {
            var core = message.GetNamedString("core", string.Empty);
            var path = message.GetNamedString("path", string.Empty);
            var started = await GameLauncher.LaunchAsync(core, path);
            if (!started)
            {
                PostMessage(Message("launch-failed"));
                return;
            }
            // The controller belongs to RetroArch until the player comes back.
            gamepad.RequireNeutral();
            PostMessage(Message("input-owner", "active", false));
        }

        public void ReturnedFromGame()
        {
            gamepad.RequireNeutral();
            PostMessage(Message("returned"));
        }

        private void OnGamepadTick(object sender, object e)
        {
            if (isSuspended || keyboardVisible || !pageReady) return;
            var snapshot = gamepad.Poll();
            if (snapshot != null) PostMessage(snapshot);
        }

        private void OnBackRequested(object sender, BackRequestedEventArgs args)
        {
            // The Xbox B button also raises BackRequested; the gamepad bridge already sent it.
            args.Handled = true;
            if (gamepad.Connected && !keyboardVisible) return;
            if (DateTimeOffset.UtcNow - lastBackAt < TimeSpan.FromMilliseconds(150)) return;
            lastBackAt = DateTimeOffset.UtcNow;
            PostMessage(Message("back"));
        }

        private async void RetryButton_Click(object sender, RoutedEventArgs e)
        {
            await StartAsync();
        }

        public void Suspend()
        {
            isSuspended = true;
            gamepadTimer.Stop();
            PostMessage(Message("input-owner", "active", false));
        }

        public void Resume()
        {
            isSuspended = false;
            gamepad.RequireNeutral();
            if (pageReady) gamepadTimer.Start();
        }

        private void PostMessage(JsonObject message)
        {
            if (pageReady && browser?.CoreWebView2 != null) browser.CoreWebView2.PostWebMessageAsJson(message.Stringify());
        }

        private static JsonObject Message(string type)
        {
            return new JsonObject { ["type"] = JsonValue.CreateStringValue(type) };
        }

        private static JsonObject Message(string type, string key, bool value)
        {
            var message = Message(type);
            message[key] = JsonValue.CreateBooleanValue(value);
            return message;
        }
    }
}
