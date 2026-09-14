$ErrorActionPreference = 'Stop'
$jamRoot = $PSScriptRoot
$jamNode = (Get-Command node -ErrorAction Stop).Source
$jamServer = Join-Path $jamRoot 'spotify-jam-lan-server.js'

# The scheduled task runs once per minute and never overlaps itself.
# Also recognise a server started manually from this folder.
$jamRunning = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($jamServer) }
if ($jamRunning) { exit 0 }

if (!(Test-Path -LiteralPath $jamNode) -or !(Test-Path -LiteralPath $jamServer)) {
    throw 'Node.js ou o servidor Jam não foi encontrado.'
}
$jamProcess = Start-Process -FilePath $jamNode -ArgumentList ('"' + $jamServer + '"') `
    -WorkingDirectory $jamRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $jamRoot 'jam-server.log') `
    -RedirectStandardError (Join-Path $jamRoot 'jam-server-error.log')
Start-Sleep -Seconds 2
if ($jamProcess.HasExited) {
    throw 'O servidor Jam terminou durante o arranque. Consulta jam-server-error.log.'
}
