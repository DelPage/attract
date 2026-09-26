using System;
using System.Linq;
using Windows.Data.Json;
using Windows.Gaming.Input;

namespace Attract
{
    /// <summary>
    /// Polls the first connected controller and produces numbered snapshots
    /// for the web view. Unchanged snapshots are repeated every 250 ms as a
    /// heartbeat so the page knows native input is live. Same protocol as Lume.
    /// </summary>
    internal sealed class GamepadBridge
    {
        private static readonly TimeSpan Heartbeat = TimeSpan.FromMilliseconds(250);
        private Gamepad active;
        private bool needsNeutral = true;
        private bool[] lastButtons;
        private double[] lastAxes;
        private DateTimeOffset lastSentAt = DateTimeOffset.MinValue;
        private long sequence;

        public bool Connected { get; private set; }

        /// <summary>Require all buttons released before input resumes (after the keyboard or a game).</summary>
        public void RequireNeutral()
        {
            needsNeutral = true;
            lastButtons = null;
            lastAxes = null;
        }

        /// <summary>Returns a message to post, or null when nothing needs to be sent.</summary>
        public JsonObject Poll()
        {
            var pads = Gamepad.Gamepads;
            if (active == null || !pads.Contains(active))
            {
                active = pads.FirstOrDefault();
                RequireNeutral();
            }
            if (active == null)
            {
                Connected = false;
                return null;
            }

            var reading = active.GetCurrentReading();
            var buttons = new[]
            {
                Has(reading, GamepadButtons.A), Has(reading, GamepadButtons.B), Has(reading, GamepadButtons.X), Has(reading, GamepadButtons.Y),
                Has(reading, GamepadButtons.LeftShoulder), Has(reading, GamepadButtons.RightShoulder),
                reading.LeftTrigger >= 0.5, reading.RightTrigger >= 0.5,
                Has(reading, GamepadButtons.View), Has(reading, GamepadButtons.Menu),
                Has(reading, GamepadButtons.LeftThumbstick), Has(reading, GamepadButtons.RightThumbstick),
                Has(reading, GamepadButtons.DPadUp), Has(reading, GamepadButtons.DPadDown),
                Has(reading, GamepadButtons.DPadLeft), Has(reading, GamepadButtons.DPadRight),
                false,
            };
            var axes = new[]
            {
                Quantize(reading.LeftThumbstickX), Quantize(-reading.LeftThumbstickY),
                Quantize(reading.RightThumbstickX), Quantize(-reading.RightThumbstickY),
            };

            if (needsNeutral)
            {
                if (buttons.Any(b => b) || axes.Any(a => Math.Abs(a) >= 0.35)) return null;
                needsNeutral = false;
            }
            Connected = true;

            var now = DateTimeOffset.UtcNow;
            if (lastButtons != null && buttons.SequenceEqual(lastButtons) && axes.SequenceEqual(lastAxes) && now - lastSentAt < Heartbeat)
            {
                return null;
            }
            lastButtons = buttons;
            lastAxes = axes;
            lastSentAt = now;

            var message = new JsonObject { ["type"] = JsonValue.CreateStringValue("gamepad") };
            var buttonValues = new JsonArray();
            foreach (var value in buttons) buttonValues.Add(JsonValue.CreateBooleanValue(value));
            var axisValues = new JsonArray();
            foreach (var value in axes) axisValues.Add(JsonValue.CreateNumberValue(value));
            message["buttons"] = buttonValues;
            message["axes"] = axisValues;
            message["sequence"] = JsonValue.CreateNumberValue(++sequence);
            return message;
        }

        public bool IsBHeld => lastButtons != null && lastButtons[1];

        private static bool Has(GamepadReading reading, GamepadButtons button) => (reading.Buttons & button) == button;

        private static double Quantize(double value) => Math.Round(Math.Max(-1d, Math.Min(1d, value)), 3);
    }
}
