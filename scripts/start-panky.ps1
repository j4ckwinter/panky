#Requires -Version 5.1
[CmdletBinding()]
param([switch]$Update)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $projectRoot 'apps/server'
$children = @()
$readers = @()
$logDirectory = $null
$ownsMutex = $false
$mutex = New-Object System.Threading.Mutex($false, 'Local\PankyLauncher3001')

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE. Startup stopped."
    }
}

function Test-BackendPort {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connection = $client.ConnectAsync('127.0.0.1', 3001)
        return ($connection.Wait(300) -and $client.Connected)
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Open-LogReader {
    param([string]$Path)
    $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
    return New-Object System.IO.StreamReader($stream)
}

function Show-Logs {
    foreach ($reader in $script:readers) {
        $content = $reader.ReadToEnd()
        if ($content) { Write-Host -NoNewline $content }
    }
}

function Start-Child {
    param([string]$Name, [string]$Executable, [string[]]$Arguments)
    $stdout = Join-Path $script:logDirectory "$Name.stdout.log"
    $stderr = Join-Path $script:logDirectory "$Name.stderr.log"
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments `
        -WorkingDirectory $serverRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $script:children += $process
    $null = $process.Handle
    $script:readers += Open-LogReader $stdout
    $script:readers += Open-LogReader $stderr
    return $process
}

Push-Location $projectRoot
try {
    try { $ownsMutex = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw 'Another Panky launcher is already running.' }
    if (Test-BackendPort) { throw 'Port 3001 is already in use. Stop the existing backend before launching Panky.' }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $ngrok = (Get-Command ngrok.exe -ErrorAction Stop).Source
    Invoke-Checked $node @('-e', "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)")

    if ($Update) {
        Get-Command git, pnpm -ErrorAction Stop | Out-Null
        Invoke-Checked 'git' @('pull', '--ff-only')
        Invoke-Checked 'pnpm' @('install', '--frozen-lockfile')
        Invoke-Checked 'pnpm' @('build')
    }
    if (-not (Test-Path (Join-Path $serverRoot 'dist/index.js'))) {
        throw 'The backend has not been built. Run this launcher with -Update first.'
    }

    Push-Location $serverRoot
    try {
        $settings = & $node --env-file-if-exists=.env -e "console.log(JSON.stringify({host:process.env.HOST||'127.0.0.1',port:process.env.PORT||'3001',endpoint:process.env.MODEL_ENDPOINT||'http://127.0.0.1:11434'}))"
        if ($LASTEXITCODE -ne 0) { throw 'Could not read the backend configuration.' }
        $settings = $settings | ConvertFrom-Json
    } finally { Pop-Location }
    if ($settings.host -ne '127.0.0.1' -or $settings.port -ne '3001') {
        throw 'This launcher requires HOST=127.0.0.1 and PORT=3001. Check apps/server/.env and shell environment variables.'
    }
    $endpoint = [uri]$settings.endpoint
    if ($endpoint.Scheme -ne 'http' -or $endpoint.Host -notin @('127.0.0.1', '[::1]') -or
        $endpoint.UserInfo -or $endpoint.AbsolutePath -ne '/' -or $endpoint.Query -or $endpoint.Fragment) {
        throw 'MODEL_ENDPOINT must be a local loopback HTTP origin.'
    }
    try {
        Invoke-RestMethod -Uri ($endpoint.AbsoluteUri.TrimEnd('/') + '/api/tags') -TimeoutSec 5 | Out-Null
    } catch { throw 'Ollama is not reachable. Start Ollama on this PC, then run the launcher again.' }

    $logDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('panky-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $logDirectory | Out-Null
    Write-Host 'Starting Panky backend...'
    $backend = Start-Child 'backend' $node @('--env-file-if-exists=.env', 'dist/index.js')
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (-not (Test-BackendPort)) {
        Show-Logs
        if ($backend.HasExited) { throw "Backend exited with code $($backend.ExitCode)." }
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Backend did not listen on port 3001 within 20 seconds.' }
        Start-Sleep -Milliseconds 200
    }
    if ($backend.HasExited) { throw "Backend exited with code $($backend.ExitCode)." }
    $tunnel = Start-Child 'ngrok' $ngrok @('http', 'http://127.0.0.1:3001', '--url=https://upcountry-scheme-excretory.ngrok-free.dev', '--inspect=false', '--log=stdout')
    Write-Host 'Backend is ready; ngrok is starting. Press Ctrl+C to stop both. Ollama will keep running.'
    while ($true) {
        Show-Logs
        if ($backend.HasExited) { throw "Backend exited with code $($backend.ExitCode)." }
        if ($tunnel.HasExited) { throw "ngrok exited with code $($tunnel.ExitCode)." }
        Start-Sleep -Milliseconds 200
    }
} finally {
    foreach ($child in $children) {
        if (-not $child.HasExited) {
            Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
            $child.WaitForExit()
        }
    }
    Show-Logs
    foreach ($reader in $readers) { $reader.Dispose() }
    foreach ($child in $children) { $child.Dispose() }
    if ($logDirectory) {
        Get-ChildItem -LiteralPath $logDirectory -File | Remove-Item -Force
        Remove-Item -LiteralPath $logDirectory -Force
    }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
    Pop-Location
}
