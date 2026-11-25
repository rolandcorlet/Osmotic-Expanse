# Turns off QuickEdit in the console window that runs it, so a click inside the window (which starts a
# text selection) cannot pause the bench or the Director until a key is pressed. The classic Windows
# console pauses a program while text is selected; Windows Terminal does not, and ignores this.
# Called by the launchers; any failure is ignored and the launcher carries on.
try {
  $sig = @'
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@
  $k = Add-Type -MemberDefinition $sig -Name ConsoleMode -Namespace Sponge -PassThru
  $h = $k::GetStdHandle(-10)
  $mode = [uint32]0
  if ($k::GetConsoleMode($h, [ref]$mode)) {
    $new = [uint32]$mode
    if (($new -band 0x40) -ne 0) { $new = [uint32]($new - 0x40) }   # ENABLE_QUICK_EDIT_MODE off
    $new = [uint32]($new -bor 0x80)                                    # ENABLE_EXTENDED_FLAGS on
    [void]$k::SetConsoleMode($h, $new)
  }
} catch { }
