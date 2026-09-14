Option Explicit
Dim shell, fso, folder, script, powershell, command, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(folder, "ensure-jam-server.ps1")
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Chr(34) & powershell & Chr(34) & " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34)
' Hide the process from creation and wait so Task Scheduler tracks its result.
result = shell.Run(command, 0, True)
WScript.Quit result
