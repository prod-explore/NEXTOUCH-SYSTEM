using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;

namespace TouchpadInput
{
    class Program
    {
        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_HWHEEL = 0x01000;

        static void Main(string[] args)
        {
            Console.WriteLine("READY");
            while (true)
            {
                string line = Console.ReadLine();
                if (string.IsNullOrEmpty(line)) continue;
                ProcessCommand(line);
            }
        }

        static void ProcessCommand(string cmd)
        {
            try
            {
                string[] parts = cmd.Split(' ');
                string type = parts[0];

                switch (type)
                {
                    case "M": // Move Relative: M dx dy
                        if (parts.Length < 3) return;
                         POINT p;
                         GetCursorPos(out p);
                         int dx = int.Parse(parts[1]);
                         int dy = int.Parse(parts[2]);
                         SetCursorPos(p.X + dx, p.Y + dy);
                        break;

                    case "MA": // Move Absolute: MA x y (normalized 0-1)
                        if (parts.Length < 3) return;
                        float nx = float.Parse(parts[1]);
                        float ny = float.Parse(parts[2]);
                        Rectangle resolution = Screen.PrimaryScreen.Bounds;
                        SetCursorPos((int)(nx * resolution.Width), (int)(ny * resolution.Height));
                        break;

                    case "C": // Click: C L/R/M (Click full down+up)
                        if (parts.Length < 2) return;
                        string btn = parts[1];
                        uint down = 0, up = 0;
                        if (btn == "L") { down = MOUSEEVENTF_LEFTDOWN; up = MOUSEEVENTF_LEFTUP; }
                        else if (btn == "R") { down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; }
                        else if (btn == "M") { down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; }
                        
                        mouse_event(down, 0, 0, 0, 0);
                        mouse_event(up, 0, 0, 0, 0);
                        break;

                    case "D": // Mouse Down: D L/R/M
                        if (parts.Length < 2) return;
                        string btnD = parts[1];
                        uint downOnly = 0;
                        if (btnD == "L") downOnly = MOUSEEVENTF_LEFTDOWN;
                        else if (btnD == "R") downOnly = MOUSEEVENTF_RIGHTDOWN;
                        else if (btnD == "M") downOnly = MOUSEEVENTF_MIDDLEDOWN;
                        mouse_event(downOnly, 0, 0, 0, 0);
                        break;

                    case "U": // Mouse Up: U L/R/M
                        if (parts.Length < 2) return;
                        string btnU = parts[1];
                        uint upOnly = 0;
                        if (btnU == "L") upOnly = MOUSEEVENTF_LEFTUP;
                        else if (btnU == "R") upOnly = MOUSEEVENTF_RIGHTUP;
                        else if (btnU == "M") upOnly = MOUSEEVENTF_MIDDLEUP;
                        mouse_event(upOnly, 0, 0, 0, 0);
                        break;
                    
                    case "S": // Scroll: S dy (vertical) dx (horizontal) - High precision (no multiplier)
                         if (parts.Length < 2) return;
                         int scrollY = int.Parse(parts[1]);
                         if (scrollY != 0) mouse_event(MOUSEEVENTF_WHEEL, 0, 0, scrollY, 0);
                         if (parts.Length > 2) {
                            int scrollX = int.Parse(parts[2]);
                            if (scrollX != 0) mouse_event(MOUSEEVENTF_HWHEEL, 0, 0, scrollX, 0);
                         }
                         break;

                   case "K": // Keyboard: K text
                        if (parts.Length < 2) return;
                        string text = cmd.Substring(2);
                        SendKeys.SendWait(text);
                        break;
                }
            }
            catch (Exception) { }
        }
    }
}
