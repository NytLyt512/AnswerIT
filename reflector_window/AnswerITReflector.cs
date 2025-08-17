using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AnswerITReflector
{
    public partial class StealthForm : Form
    {
        private WebView2 webView2;

        // Windows API
        [DllImport("user32.dll")]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
        [DllImport("user32.dll")]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
        [DllImport("user32.dll")]
        private static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);
        
        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int WS_EX_NOACTIVATE = 0x08000000;
        private const int DWMWA_EXCLUDED_FROM_PEEK = 12;
        private const int DWMWA_TRANSITIONS_FORCEDISABLED = 3;
        private const int WM_HOTKEY = 0x0312;
        private const uint MOD_ALT = 0x0001;
        private const int HOTKEY_ID = 0xB001;
        private const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;

        public StealthForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.SuspendLayout();
            
            // Form properties
            this.ClientSize = new Size(400, 720);
            this.Text = "AnswerIT Reflector";
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.BackColor = Color.FromArgb(20, 20, 20);
            this.TopMost = true;
            this.MinimumSize = new Size(400, 300);
            this.ShowInTaskbar = false;
            
            // WebView2
            this.webView2 = new WebView2();
            this.webView2.Dock = DockStyle.Fill;
            this.Controls.Add(this.webView2);
            
            // Event handlers
            this.KeyPreview = true;
            this.KeyDown += (s, e) => {
                if (e.KeyCode == Keys.A && e.Alt) {
                    e.Handled = true;
                    this.Visible = !this.Visible;
                    if (this.Visible) { 
                        this.WindowState = FormWindowState.Normal; 
                        this.BringToFront(); 
                    }
                }
            };
            this.Load += async (s, e) => {
                try {
                    await webView2.EnsureCoreWebView2Async(null);
                    webView2.CoreWebView2.Navigate("https://nytlyt512.github.io/AnswerIT/reflector.html");
                    ApplyStealth();
                } catch (Exception ex) {
                    MessageBox.Show("Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };
            
            this.ResumeLayout(false);
        }

        private void ApplyStealth()
        {
            if (!this.IsHandleCreated) return;

            try
            {
                IntPtr handle = this.Handle;

                // Hide from taskbar/Alt+Tab
                int exStyle = GetWindowLong(handle, GWL_EXSTYLE);
                SetWindowLong(handle, GWL_EXSTYLE, exStyle | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
                this.ShowInTaskbar = false;
                
                // Hide from screenshare and disable DWM transitions
                int value = 1;
                DwmSetWindowAttribute(handle, DWMWA_EXCLUDED_FROM_PEEK, ref value, sizeof(int));
                DwmSetWindowAttribute(handle, DWMWA_TRANSITIONS_FORCEDISABLED, ref value, sizeof(int));
                SetWindowDisplayAffinity(handle, WDA_EXCLUDEFROMCAPTURE);
            }
            catch { }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            
            // Apply stealth immediately when handle is created
            ApplyStealth();
            
            try
            {
                RegisterHotKey(this.Handle, HOTKEY_ID, MOD_ALT, (uint)Keys.A);
            }
            catch { }
        }

        protected override void OnHandleDestroyed(EventArgs e)
        {
            try
            {
                UnregisterHotKey(this.Handle, HOTKEY_ID);
            }
            catch { }
            base.OnHandleDestroyed(e);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HOTKEY_ID)
            {
                // Simple visibility toggle like Window Hider
                this.Visible = !this.Visible;
                if (this.Visible) { 
                    this.WindowState = FormWindowState.Normal; 
                    this.BringToFront(); 
                }
                return;
            }
            
            base.WndProc(ref m);
        }
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            
            try
            {
                CoreWebView2Environment.GetAvailableBrowserVersionString();
            }
            catch (WebView2RuntimeNotFoundException)
            {
                var result = MessageBox.Show(
                    "WebView2 Runtime is required but not installed.\n\n" +
                    "Click Yes to download it automatically, or No to exit.",
                    "Missing Dependency",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                );
                
                if (result == DialogResult.Yes)
                {
                    System.Diagnostics.Process.Start("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
                }
                return;
            }
            
            Application.Run(new StealthForm());
        }
    }
}