using System;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace Attract
{
    sealed partial class App : Application
    {
        public App()
        {
            InitializeComponent();
            Suspending += OnSuspending;
            Resuming += OnResuming;
            // Controller navigation is handled by the page; never show the Xbox mouse cursor.
            RequiresPointerMode = ApplicationRequiresPointerMode.WhenRequested;
            ApplicationViewScaling.TrySetDisableLayoutScaling(true);
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            EnsurePage();
            Window.Current.Activate();
        }

        /// <summary>RetroArch opens "attract:" when the player quits a game.</summary>
        protected override void OnActivated(IActivatedEventArgs args)
        {
            var page = EnsurePage();
            Window.Current.Activate();
            if (args.Kind == ActivationKind.Protocol)
            {
                page?.ReturnedFromGame();
            }
        }

        private static MainPage EnsurePage()
        {
            var rootFrame = Window.Current.Content as Frame;
            if (rootFrame == null)
            {
                rootFrame = new Frame();
                rootFrame.NavigationFailed += OnNavigationFailed;
                Window.Current.Content = rootFrame;
            }
            if (rootFrame.Content == null)
            {
                rootFrame.Navigate(typeof(MainPage));
            }
            return rootFrame.Content as MainPage;
        }

        private void OnSuspending(object sender, SuspendingEventArgs e)
        {
            var deferral = e.SuspendingOperation.GetDeferral();
            CurrentPage()?.Suspend();
            deferral.Complete();
        }

        private void OnResuming(object sender, object e)
        {
            CurrentPage()?.Resume();
        }

        private static MainPage CurrentPage() => (Window.Current.Content as Frame)?.Content as MainPage;

        private static void OnNavigationFailed(object sender, NavigationFailedEventArgs e)
        {
            // MainPage owns the visible error state; keep the process alive.
        }
    }
}
