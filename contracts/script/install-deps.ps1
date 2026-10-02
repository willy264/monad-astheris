$ErrorActionPreference = 'Stop'
$contractRoot = Split-Path -Parent $PSScriptRoot
$deps = @(
    @{ Name = 'openzeppelin-contracts'; Url = 'https://github.com/OpenZeppelin/openzeppelin-contracts.git'; Tag = 'v5.4.0'; Commit = 'c64a1edb67b6e3f4a15cca8909c9482ad33a02b0' },
    @{ Name = 'forge-std'; Url = 'https://github.com/foundry-rs/forge-std.git'; Tag = 'v1.9.7'; Commit = '77041d2ce690e692d6e03cc812b57d1ddaa4d505' }
)
New-Item -ItemType Directory -Force -Path (Join-Path $contractRoot 'lib') | Out-Null
foreach ($dep in $deps) {
    $destination = Join-Path $contractRoot ('lib/' + $dep.Name)
    if (-not (Test-Path -LiteralPath $destination)) {
        & git clone --depth 1 --branch $dep.Tag $dep.Url $destination
        if ($LASTEXITCODE -ne 0) { throw ('Failed cloning ' + $dep.Name) }
    }
    $actual = & git -C $destination rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $dep.Commit) { throw ('Unexpected dependency revision: ' + $dep.Name) }
}
