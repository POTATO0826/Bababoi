# Only detached runtime processes belonging to this generated test fixture may be stopped.
$ErrorActionPreference = 'Stop'
$fixtureRoot = $env:WAREORB_SMOKE_DIR
$expectedParent = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.convex'))
if (!$fixtureRoot -or [IO.Path]::GetDirectoryName($fixtureRoot) -ine $expectedParent -or [IO.Path]::GetFileName($fixtureRoot) -notlike 'startup-*') {
  throw 'Refusing a path outside the generated startup fixture'
}
$fixtureRoot = $fixtureRoot.Replace([char]47, [char]92).TrimEnd([char]92) + [char]92
Write-Host '[startup] Inspecting test-owned Windows runtime processes'
$ownedProcesses = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe' OR Name='bun.exe' OR Name='convex-local-backend.exe'" -Property Name,ProcessId,CommandLine -OperationTimeoutSec 10 | Where-Object {
  $_.Name -in @('node.exe', 'bun.exe', 'convex-local-backend.exe') -and
  $_.CommandLine -and
  $_.CommandLine.Replace([char]47, [char]92).IndexOf($fixtureRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
})
Write-Host ('[startup] Remaining fixture runtimes: ' + $ownedProcesses.Count)
foreach ($fixtureProcess in $ownedProcesses) {
  Write-Host ('[startup] Stopping fixture process: ' + $fixtureProcess.Name + ' PID ' + $fixtureProcess.ProcessId)
  $fixtureRuntime = Get-Process -Id $fixtureProcess.ProcessId -ErrorAction SilentlyContinue
  if ($fixtureRuntime) {
    $fixtureRuntime | Stop-Process -Force
    if (!$fixtureRuntime.WaitForExit(10000)) { throw 'Fixture runtime did not stop' }
  }
}
