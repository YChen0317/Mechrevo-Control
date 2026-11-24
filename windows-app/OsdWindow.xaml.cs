using System.Windows;
using System.Windows.Threading;
using MechrevoControl.Frontend.Contracts;

namespace MechrevoControl.Frontend;

public partial class OsdWindow : Window
{
    private readonly DispatcherTimer _timer;

    public OsdWindow(HotkeyEvent evt)
    {
        InitializeComponent();
        TitleText.Text = $"{evt.Title} · 本应用 OSD";
        CodeText.Text = $"{evt.CodeHex} · {evt.OsdDurationMs} ms";
        StateText.Text = evt.StateLabel;

        var area = SystemParameters.WorkArea;
        Left = area.Left + (area.Width - Width) / 2;
        Top = area.Bottom - Height - 48;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(evt.OsdDurationMs) };
        _timer.Tick += (_, _) =>
        {
            _timer.Stop();
            Close();
        };
        _timer.Start();
    }
}
