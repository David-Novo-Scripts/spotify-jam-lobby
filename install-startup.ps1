$ErrorActionPreference = 'Stop'
$jamRoot = $PSScriptRoot
$jamUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$jamScript = Join-Path $jamRoot 'ensure-jam-server-hidden.vbs'
Get-Command node -ErrorAction Stop | Out-Null
$jamAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument ('//B //NoLogo "' + $jamScript + '"') -WorkingDirectory $jamRoot
$jamLogon = New-ScheduledTaskTrigger -AtLogOn -User $jamUser
$jamPeriodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$jamSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
$jamPrincipal = New-ScheduledTaskPrincipal -UserId $jamUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Spotify Jam Lobby Server' -Action $jamAction -Trigger @($jamLogon,$jamPeriodic) -Settings $jamSettings -Principal $jamPrincipal -Description 'Start and recover the Spotify Jam Lobby server.'
Start-ScheduledTask -TaskName 'Spotify Jam Lobby Server'
