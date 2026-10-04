param([string] $Forge = 'forge')
$ErrorActionPreference = 'Stop'
$contractRoot = Split-Path -Parent $PSScriptRoot
Push-Location $contractRoot
try {
    & $Forge build
    if ($LASTEXITCODE -ne 0) { throw 'Contract compilation failed' }
    foreach ($name in @('AgentRegistry', 'ReputationRegistry', 'ValidationRegistry', 'AetherisRouter', 'EphemeralShard', 'ICREReceiver')) {
        $artifact = Get-Content -Raw -LiteralPath (Join-Path $contractRoot ('out/' + $name + '.sol/' + $name + '.json')) | ConvertFrom-Json
        $json = ConvertTo-Json -InputObject $artifact.abi -Depth 100
        [System.IO.File]::WriteAllText((Join-Path $contractRoot ('abi/' + $name + '.json')), $json + "`n", [System.Text.UTF8Encoding]::new($false))
    }
} finally { Pop-Location }
