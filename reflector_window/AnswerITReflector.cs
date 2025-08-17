using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AnswerITReflector
{
    public partial class StealthForm : Form
    {
        private WebView2 webView2;
        private string tempWebViewFolder;
        private Panel opacitySlider;
        private int sliderValue = 80;
        private bool isDraggingSlider = false;

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
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int WM_HOTKEY = 0x0312;
        private const uint MOD_ALT = 0x0001;
        private const int HOTKEY_ID = 0xB001;
        private const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;

        public StealthForm()
        {
            // Create temp folder for WebView2 data
            tempWebViewFolder = Path.Combine(Path.GetTempPath(), "AIT_" + Guid.NewGuid().ToString("N")[..8]);
            Directory.CreateDirectory(tempWebViewFolder);
            
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.SuspendLayout();
            
            // Form properties
            this.ClientSize = new Size(400, 720);
            this.Text = "AIT Reflector";
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.BackColor = Color.FromArgb(20, 20, 20);
            this.TopMost = true;
            this.MinimumSize = new Size(400, 300);
            this.ShowInTaskbar = false;
            this.Opacity = 0.8; // Default 80% opacity
            
            // Custom opacity slider
            this.opacitySlider = new Panel();
            this.opacitySlider.Size = new Size(100, 5);
            this.opacitySlider.Location = new Point(this.Width - 120, 10);
            this.opacitySlider.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            this.opacitySlider.BackColor = Color.Gray;
            this.opacitySlider.Paint += (s, e) => {
                // Draw slider track and thumb
                int thumbX = (sliderValue - 5) * (opacitySlider.Width - 4) / 94; // 5-99 range
                e.Graphics.FillRectangle(Brushes.DarkGray, 0, 0, opacitySlider.Width, opacitySlider.Height);
                e.Graphics.FillRectangle(Brushes.White, thumbX, 0, 4, opacitySlider.Height);
            };
            this.opacitySlider.MouseDown += (s, e) => { isDraggingSlider = true; UpdateSlider(e.X); };
            this.opacitySlider.MouseMove += (s, e) => { if (isDraggingSlider) UpdateSlider(e.X); };
            this.opacitySlider.MouseUp += (s, e) => { isDraggingSlider = false; };
            this.Controls.Add(this.opacitySlider);
            
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
                    // Use temp folder for WebView2 data
                    var env = await CoreWebView2Environment.CreateAsync(null, tempWebViewFolder);
                    await webView2.EnsureCoreWebView2Async(env);
                    
                    // Disable tooltips via JavaScript injection
                    webView2.CoreWebView2.NavigationCompleted += (s, e) => {
                        // Remove all existing title attributes
                        webView2.CoreWebView2.ExecuteScriptAsync("[...document.querySelectorAll('[title]')].forEach(e=>e.removeAttribute('title'))");
                        // Prevent new tooltips from being set
                        webView2.CoreWebView2.ExecuteScriptAsync(@"
                            new MutationObserver(muts => {
                                muts.forEach(mut => {
                                    if (mut.type === 'attributes' && mut.attributeName === 'title') {
                                        mut.target.removeAttribute('title');
                                    }
                                });
                            }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['title'] });
                        ");
                        // Inject CSS to set cursor to default everywhere
                        webView2.CoreWebView2.ExecuteScriptAsync(@"
                            var style = document.createElement('style');
                            style.innerHTML = '* { cursor: default !important; }';
                            document.head.appendChild(style);
                        ");
                    };
                    
                    webView2.CoreWebView2.Navigate("https://nytlyt512.github.io/AnswerIT/reflector.html");
                    ApplyStealth();
                } catch (Exception ex) {
                    MessageBox.Show("Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };
            
            this.ResumeLayout(false);
        }

        private void UpdateSlider(int mouseX)
        {
            // Calculate value from mouse position (5-99 range)
            sliderValue = Math.Max(5, Math.Min(99, 5 + (mouseX * 94) / (opacitySlider.Width - 4)));
            this.Opacity = sliderValue / 100.0;
            opacitySlider.Invalidate(); // Redraw slider
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
                
                // Enable dark titlebar
                int darkMode = 1;
                DwmSetWindowAttribute(handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));
                
                // Hide from screenshare and disable DWM transitions
                int value = 1;
                DwmSetWindowAttribute(handle, DWMWA_EXCLUDED_FROM_PEEK, ref value, sizeof(int));
                DwmSetWindowAttribute(handle, DWMWA_TRANSITIONS_FORCEDISABLED, ref value, sizeof(int));
                SetWindowDisplayAffinity(handle, WDA_EXCLUDEFROMCAPTURE);
            }
            catch { }
        }

        protected override bool ShowWithoutActivation 
        { 
            get { return true; } 
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

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            // Force dispose WebView2 first to release file locks
            try
            {
                webView2?.Dispose();
            }
            catch { }
            
            base.OnFormClosed(e);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Clean up WebView2 before closing
            try
            {
                if (webView2?.CoreWebView2 != null)
                {
                    webView2.CoreWebView2.Stop();
                }
            }
            catch { }
            
            base.OnFormClosing(e);
        }

        public void CleanupTempFolder()
        {
            try
            {
                if (Directory.Exists(tempWebViewFolder))
                {
                    // Wait a bit for file handles to be released
                    System.Threading.Thread.Sleep(100);
                    Directory.Delete(tempWebViewFolder, true);
                }
            }
            catch
            {
                // If immediate cleanup fails, schedule for later cleanup
                try
                {
                    var batch = Path.GetTempFileName() + ".bat";
                    File.WriteAllText(batch, $@"
                        @echo off
                        timeout /t 2 /nobreak >nul
                        rmdir /s /q ""{tempWebViewFolder}"" >nul 2>&1
                        del ""%~f0"" >nul 2>&1
                        ");
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(batch)
                    {
                        WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                        CreateNoWindow = true
                    });
                }
                catch { }
            }
        }        protected override void WndProc(ref Message m)
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
            
            StealthForm form = null;
            
            // Add process exit handler for cleanup
            AppDomain.CurrentDomain.ProcessExit += (s, e) => {
                form?.CleanupTempFolder();
            };
            
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
            
            form = new StealthForm();
            Application.Run(form);
            
            // Force cleanup on normal exit too
            form.CleanupTempFolder();
        }
    }
}