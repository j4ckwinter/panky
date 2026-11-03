#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('panky-launcher-test-' + [guid]::NewGuid() + ' with spaces')
$nodePath = (Get-Command node.exe).Source
$originalPort = $env:PORT
$originalHost = $env:HOST
$originalEndpoint = $env:MODEL_ENDPOINT
$originalLocation = Get-Location
$global:PankyLauncherTest = @{ nodePath = $nodePath; mode = 'tunnel-exit'; updateCalls = @(); spawned = @() }

function Get-Command {
    param([string[]]$Name, $ErrorAction)
    foreach ($item in $Name) {
        if ($item -eq 'ngrok.exe') { [pscustomobject]@{ Source = 'fixture-ngrok' } }
        else { Microsoft.PowerShell.Core\Get-Command $item -ErrorAction Stop }
    }
}

function Invoke-RestMethod {
    param($Uri, $TimeoutSec)
    if ($global:PankyLauncherTest.mode -eq 'ollama-down') { throw 'Fixture Ollama is unavailable.' }
    return @{ models = @() }
}

function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru, $RedirectStandardOutput, $RedirectStandardError)
    if ($FilePath -eq 'fixture-ngrok') {
        $FilePath = $global:PankyLauncherTest.nodePath
        $ArgumentList = @('tunnel.cjs')
    }
    $child = Microsoft.PowerShell.Management\Start-Process -FilePath $FilePath -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $RedirectStandardOutput -RedirectStandardError $RedirectStandardError
    $global:PankyLauncherTest.spawned += $child.Id
    return $child
}

function git {
    $global:PankyLauncherTest.updateCalls += 'git'
    $global:LASTEXITCODE = 0
    if ($global:PankyLauncherTest.mode -eq 'git-failure') { $global:LASTEXITCODE = 1 }
}

function pnpm {
    $global:PankyLauncherTest.updateCalls += "pnpm $($args[0])"
    $global:LASTEXITCODE = 0
    if ($global:PankyLauncherTest.mode -eq "$($args[0])-failure") { $global:LASTEXITCODE = 1 }
}

function Assert-Failure {
    param([string]$Expected, [switch]$Update)
    $caught = $null
    try { & (Join-Path $fixture 'scripts/start-panky.ps1') -Update:$Update }
    catch { $caught = $_.Exception.Message }
    if (-not $caught -or $caught -notlike "*$Expected*") {
        throw "Expected '$Expected', got '$caught'."
    }
    if ((Get-Location).Path -ne $originalLocation.Path) { throw 'Launcher did not restore the working directory.' }
    foreach ($child in $global:PankyLauncherTest.spawned) {
        if (Get-Process -Id $child -ErrorAction SilentlyContinue) { throw "Child $child survived cleanup." }
    }
    $global:PankyLauncherTest.spawned = @()
    Write-Host "PASS: $($global:PankyLauncherTest.mode) ($Expected)"
}

try {
    New-Item -ItemType Directory -Path "$fixture/scripts", "$fixture/apps/server/dist" -Force | Out-Null
    New-Item -ItemType File -Path "$fixture/apps/server/.env" | Out-Null
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    $source = Get-Content (Join-Path $PSScriptRoot 'start-panky.ps1') -Raw
    $source.Replace('3001', [string]$port) | Set-Content "$fixture/scripts/start-panky.ps1"
    $env:PORT = [string]$port
    $env:HOST = '127.0.0.1'
    $env:MODEL_ENDPOINT = 'http://127.0.0.1:11434'
    @'
const http = require('node:http');
console.log('fixture backend started');
http.createServer((req, res) => res.end('fixture')).listen(Number(process.env.PORT), '127.0.0.1');
if (require('node:fs').existsSync('exit-backend')) setTimeout(() => process.exit(23), 1000);
'@ | Set-Content "$fixture/apps/server/dist/index.js"
    "console.log('fixture tunnel started'); setTimeout(() => process.exit(42), 300);" | Set-Content "$fixture/apps/server/tunnel.cjs"
    Assert-Failure 'ngrok exited with code 42'

    $global:PankyLauncherTest.mode = 'update-success'
    Assert-Failure 'ngrok exited with code 42' -Update
    if (($global:PankyLauncherTest.updateCalls -join ',') -ne 'git,pnpm install,pnpm build') {
        throw 'Update did not run pull, install and build in order.'
    }

    $global:PankyLauncherTest.mode = 'backend-exit'
    New-Item "$fixture/apps/server/exit-backend" -ItemType File | Out-Null
    "console.log('fixture tunnel started'); setInterval(() => {}, 1000);" | Set-Content "$fixture/apps/server/tunnel.cjs"
    Assert-Failure 'Backend exited with code 23'

    $global:PankyLauncherTest.mode = 'pipeline-stop'
    Remove-Item -LiteralPath "$fixture/apps/server/exit-backend"
    $runspace = [runspacefactory]::CreateRunspace()
    $runspace.Open()
    $runspace.SessionStateProxy.SetVariable('PankyLauncherTest', $global:PankyLauncherTest)
    $runner = [powershell]::Create()
    $runner.Runspace = $runspace
    try {
        foreach ($name in @('Get-Command', 'Invoke-RestMethod', 'Start-Process')) {
            $definition = (Get-Item "Function:\$name").Definition
            $runner.AddScript("function global:$name { $definition }").Invoke() | Out-Null
            $runner.Commands.Clear()
        }
        $runner.AddCommand("$fixture/scripts/start-panky.ps1") | Out-Null
        $pending = $runner.BeginInvoke()
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        while ($global:PankyLauncherTest.spawned.Count -lt 2 -and -not $pending.IsCompleted -and [DateTime]::UtcNow -lt $deadline) {
            Start-Sleep -Milliseconds 100
        }
        if ($global:PankyLauncherTest.spawned.Count -ne 2) {
            $runner.EndInvoke($pending)
            throw "Cancellation fixture did not start both children: $($runner.Streams.Error)"
        }
        $duplicateError = $null
        try { & "$fixture/scripts/start-panky.ps1" }
        catch { $duplicateError = $_.Exception.Message }
        if ($duplicateError -ne 'Another Panky launcher is already running.') {
            throw "Duplicate launcher was not rejected: $duplicateError"
        }
        Write-Host 'PASS: duplicate launcher rejected while the first remains running'
        $runner.Stop()
        foreach ($child in $global:PankyLauncherTest.spawned) {
            if (Get-Process -Id $child -ErrorAction SilentlyContinue) { throw "Child $child survived pipeline cancellation." }
        }
        $global:PankyLauncherTest.spawned = @()
        Write-Host 'PASS: PowerShell pipeline cancellation stops both children'
    } finally {
        $runner.Dispose()
        $runspace.Dispose()
    }

    $global:PankyLauncherTest.mode = 'port-occupied'
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $listener.Start()
    try { Assert-Failure 'already in use' } finally { $listener.Stop() }

    $global:PankyLauncherTest.mode = 'ollama-down'
    Assert-Failure 'Ollama is not reachable'

    foreach ($failure in @('git', 'install', 'build')) {
        $global:PankyLauncherTest.mode = "$failure-failure"
        $global:PankyLauncherTest.updateCalls = @()
        Assert-Failure 'failed with exit code 1' -Update
        $expectedCalls = switch ($failure) {
            'git' { 'git' }
            'install' { 'git,pnpm install' }
            'build' { 'git,pnpm install,pnpm build' }
        }
        if (($global:PankyLauncherTest.updateCalls -join ',') -ne $expectedCalls) { throw 'Update continued past a failed command.' }
    }

    $global:PankyLauncherTest.mode = 'missing-build'
    Remove-Item -LiteralPath "$fixture/apps/server/dist/index.js"
    Assert-Failure 'has not been built'
} finally {
    foreach ($child in $global:PankyLauncherTest.spawned) {
        Stop-Process -Id $child -Force -ErrorAction SilentlyContinue
    }
    $env:PORT = $originalPort
    $env:HOST = $originalHost
    $env:MODEL_ENDPOINT = $originalEndpoint
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixture)
    $expectedParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedFixture.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedFixture) -like 'panky-launcher-test-*') {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
    Remove-Variable PankyLauncherTest -Scope Global
}
