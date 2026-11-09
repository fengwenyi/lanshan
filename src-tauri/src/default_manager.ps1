$ErrorActionPreference = 'Stop'
$user = [Microsoft.Win32.Registry]::CurrentUser
$base = 'Software\Classes'
$backup = 'Software\Lanshan\DefaultManagerBackup'
$verb = 'Lanshan.Open'
$types = @('Directory', 'Drive')
$command = '"' + $env:LANSHAN_EXECUTABLE + '" --open-folder "%1\."'

function Restore-Defaults {
    foreach ($type in $types) {
        $saved = $user.OpenSubKey("$backup\$type")
        if ($null -eq $saved) { continue }
        try {
            $shell = $user.CreateSubKey("$base\$type\shell")
            try {
                # Do not overwrite a default selected by another application later.
                if ($shell.GetValue('') -eq $verb) {
                    if ($saved.GetValue('Present') -eq 1) {
                        $shell.SetValue('', $saved.GetValue('Value'), $saved.GetValueKind('Value'))
                    } else { $shell.DeleteValue('', $false) }
                }
                $shell.DeleteSubKeyTree($verb, $false)
            } finally { $shell.Dispose() }
        } finally { $saved.Dispose() }
        $user.DeleteSubKeyTree("$backup\$type", $false)
    }
}

if ($env:LANSHAN_MANAGER_ACTION -eq 'enable') {
    try {
        foreach ($type in $types) {
            $shell = $user.CreateSubKey("$base\$type\shell")
            try {
                $saved = $user.OpenSubKey("$backup\$type")
                if ($null -eq $saved) {
                    $saved = $user.CreateSubKey("$backup\$type")
                    $present = $shell.GetValueNames() -contains ''
                    if ($present) { $saved.SetValue('Value', $shell.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames), $shell.GetValueKind('')) }
                    $saved.SetValue('Present', [int]$present)
                }
                $saved.Dispose()
                $entry = $shell.CreateSubKey($verb)
                try {
                    $entry.SetValue('', 'Open with Lanshan')
                    $entry.SetValue('Icon', $env:LANSHAN_EXECUTABLE)
                    $cmd = $entry.CreateSubKey('command')
                    try { $cmd.SetValue('', $command) } finally { $cmd.Dispose() }
                } finally { $entry.Dispose() }
                $shell.SetValue('', $verb)
            } finally { $shell.Dispose() }
        }
    } catch { Restore-Defaults; throw }
} elseif ($env:LANSHAN_MANAGER_ACTION -eq 'disable') { Restore-Defaults }

if ($env:LANSHAN_MANAGER_ACTION -ne 'status') {
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class LanshanShellNotify { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2); }'
    [LanshanShellNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}

$enabled = 0
$recoverable = $false
foreach ($type in $types) {
    $shell = $user.OpenSubKey("$base\$type\shell")
    if ($null -ne $shell) {
        try {
            $cmd = $shell.OpenSubKey("$verb\command")
            if ($null -ne $cmd) {
                try { if ($shell.GetValue('') -eq $verb -and $cmd.GetValue('') -eq $command) { $enabled++ } } finally { $cmd.Dispose() }
            }
        } finally { $shell.Dispose() }
    }
    $saved = $user.OpenSubKey("$backup\$type")
    if ($null -ne $saved) { $recoverable = $true; $saved.Dispose() }
}
Write-Output "$enabled,$recoverable"
