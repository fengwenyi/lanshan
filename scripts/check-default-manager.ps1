# Exercise the production registry script against an in-memory registry.
# This test never changes Windows associations.
$ErrorActionPreference = 'Stop'
class MemoryKey {
    static [string] $FailPath = ''
    [hashtable] $Tree
    [string] $Path
    MemoryKey([hashtable] $tree, [string] $path) { $this.Tree = $tree; $this.Path = $path }
    [MemoryKey] OpenSubKey([string] $path) {
        $full = $this.Path + '\' + $path
        if (!$this.Tree.ContainsKey($full)) { return $null }
        return [MemoryKey]::new($this.Tree, $full)
    }
    [MemoryKey] CreateSubKey([string] $path) {
        $full = $this.Path + '\' + $path
        if (!$this.Tree.ContainsKey($full)) { $this.Tree[$full] = @{} }
        return [MemoryKey]::new($this.Tree, $full)
    }
    [object] GetValue([string] $name) { return $this.Tree[$this.Path][$name] }
    [object] GetValue([string] $name, [object] $fallback, [object] $options) { return $this.GetValue($name) }
    [string[]] GetValueNames() { return @($this.Tree[$this.Path].Keys) }
    [Microsoft.Win32.RegistryValueKind] GetValueKind([string] $name) { return [Microsoft.Win32.RegistryValueKind]::String }
    [void] SetValue([string] $name, [object] $value) {
        if ($this.Path -eq [MemoryKey]::FailPath) { [MemoryKey]::FailPath = ''; throw 'Simulated registry write failure' }
        $this.Tree[$this.Path][$name] = $value
    }
    [void] SetValue([string] $name, [object] $value, [object] $kind) { $this.SetValue($name, $value) }
    [void] DeleteValue([string] $name, [bool] $missing) { $this.Tree[$this.Path].Remove($name) }
    [void] DeleteSubKeyTree([string] $path, [bool] $missing) {
        $full = $this.Path + '\' + $path
        foreach ($key in @($this.Tree.Keys)) {
            if ($key -eq $full -or $key.StartsWith($full + '\')) { $this.Tree.Remove($key) }
        }
    }
    [void] Dispose() {}
}
$tree = @{}
$memory = [MemoryKey]::new($tree, '')
$source = Get-Content -Raw -LiteralPath "$PSScriptRoot\..\src-tauri\src\default_manager.ps1"
$source = $source.Replace('$user = [Microsoft.Win32.Registry]::CurrentUser', '$user = $memory')
$source = [regex]::Replace($source, '(?s)if \(\$env:LANSHAN_MANAGER_ACTION -ne ''status''\) \{.*?\r?\n\}', '')
$oldExecutable = $env:LANSHAN_EXECUTABLE
$oldAction = $env:LANSHAN_MANAGER_ACTION
function Run([string] $action) {
    $env:LANSHAN_MANAGER_ACTION = $action
    return (Invoke-Expression $source)
}
function Assert([bool] $condition, [string] $message) { if (!$condition) { throw $message } }
try {
    $env:LANSHAN_EXECUTABLE = 'C:\Program Files\Lanshan\lanshan.exe'
    Assert ((Run 'status') -eq '0,False') 'Fresh state should be disabled'
    $directory = $memory.CreateSubKey('Software\Classes\Directory\shell')
    $directory.SetValue('', 'PreviousManager')
    Assert ((Run 'enable') -eq '2,True') 'Both folder and drive should be enabled'
    Assert ((Run 'enable') -eq '2,True') 'Repeated enable should retain the original backup'
    $cmd = $memory.OpenSubKey('Software\Classes\Drive\shell\Lanshan.Open\command')
    Assert ($cmd.GetValue('') -eq '"C:\Program Files\Lanshan\lanshan.exe" --open-folder "%1\."') 'Executable and folder arguments must be quoted; drive roots must not escape the quote'
    Assert ((Run 'disable') -eq '0,False') 'Restore should remove registration and backup'
    Assert ($directory.GetValue('') -eq 'PreviousManager') 'Restore must preserve the previous custom manager'
    $drive = $memory.OpenSubKey('Software\Classes\Drive\shell')
    Assert (!($drive.GetValueNames() -contains '')) 'Originally absent defaults must remain absent'
    $null = Run 'enable'
    $directory.SetValue('', 'LaterManager')
    Assert ((Run 'status') -eq '1,True') 'Mixed registration must be detected'
    $null = Run 'disable'
    Assert ($directory.GetValue('') -eq 'LaterManager') 'Restore must not overwrite a later manager'
    Assert ((Run 'disable') -eq '0,False') 'Repeated restore must be harmless'
    [MemoryKey]::FailPath = '\Software\Classes\Drive\shell'
    $failed = $false
    try { $null = Run 'enable' } catch { $failed = $true }
    Assert $failed 'Write failure must reach the caller'
    Assert ((Run 'status') -eq '0,False') 'A partial enable failure must roll back both registrations'
    Assert ($directory.GetValue('') -eq 'LaterManager') 'Rollback must preserve the previous default'
    Write-Output 'Default manager registry checks passed (in-memory; no system changes).'
} finally {
    $env:LANSHAN_EXECUTABLE = $oldExecutable
    $env:LANSHAN_MANAGER_ACTION = $oldAction
}
