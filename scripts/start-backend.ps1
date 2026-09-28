param([string]$EnvironmentFile = (Join-Path $PSScriptRoot '../.env'))
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (Test-Path -LiteralPath $EnvironmentFile) {
    foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
        $entry = $line.Trim()
        if ($entry -eq '' -or $entry.StartsWith('#')) { continue }
        if ($entry -notmatch '^([A-Z][A-Z0-9_]*)=(.*)$') { throw 'Invalid environment file entry' }
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
    }
}
$requiredSettings = @('DATABASE_URL', 'DATABASE_USER', 'DATABASE_PASSWORD', 'ENCRYPTION_ACTIVE_KEY_ID', 'ENCRYPTION_KEYS')
if ($env:SPRING_PROFILES_ACTIVE -eq 'local') { $requiredSettings += 'AUTH_LOOKUP_KEY' }
else { $requiredSettings += @('OIDC_ISSUER_URI', 'OIDC_JWK_SET_URI', 'OIDC_AUDIENCE') }
foreach ($setting in $requiredSettings) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($setting, 'Process'))) {
        throw "Missing required environment setting: $setting"
    }
}
Push-Location $projectRoot
try {
    & (Join-Path $projectRoot 'mvnw.cmd') spring-boot:run
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
