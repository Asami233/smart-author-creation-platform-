param(
    [switch]$SkipInstall,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "命令执行失败：$FilePath $($Arguments -join ' ')"
    }
}

function Resolve-CommandPath {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$PreferredPath
    )

    if ($PreferredPath -and (Test-Path -LiteralPath $PreferredPath)) {
        return $PreferredPath
    }

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "未找到 $Name。请先安装 Node.js 22 或更高版本。"
    }
    return $command.Source
}

try {
    $npmPath = Resolve-CommandPath -Name 'npm.cmd' -PreferredPath 'D:\nodejs\npm.cmd'
    $nodePath = Resolve-CommandPath -Name 'node.exe' -PreferredPath 'D:\nodejs\node.exe'

    Write-Host '智能作者创作平台 - 本地开发启动器' -ForegroundColor Cyan
    Write-Host "项目目录：$projectRoot"

    $vinextPath = Join-Path $projectRoot 'node_modules\.bin\vinext.cmd'
    if (-not $SkipInstall -and -not (Test-Path -LiteralPath $vinextPath)) {
        Write-Host '[1/4] 正在安装依赖…' -ForegroundColor Yellow
        Invoke-Checked $npmPath 'ci' '--workspaces=false' '--include=dev' '--include=optional' '--prefer-offline' '--no-audit' '--no-fund'
    }
    else {
        Write-Host '[1/4] 依赖已就绪。' -ForegroundColor DarkGray
    }

    $devVarsPath = Join-Path $projectRoot '.dev.vars'
    if (-not (Test-Path -LiteralPath $devVarsPath)) {
        $randomBytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
        $encryptionKey = [Convert]::ToBase64String($randomBytes)
        [System.IO.File]::WriteAllText(
            $devVarsPath,
            "APP_ENCRYPTION_KEY=$encryptionKey`r`n",
            [System.Text.UTF8Encoding]::new($false)
        )
        Write-Host '[2/4] 已创建本机 AI 配置加密密钥。' -ForegroundColor Green
    }
    else {
        Write-Host '[2/4] 本机加密配置已存在，保持不变。' -ForegroundColor DarkGray
    }

    $wranglerConfigPath = Join-Path $projectRoot 'dist\server\wrangler.json'
    if (-not $SkipBuild -or -not (Test-Path -LiteralPath $wranglerConfigPath)) {
        Write-Host '[3/4] 正在构建并准备数据库配置…' -ForegroundColor Yellow
        Invoke-Checked $npmPath 'run' 'build'
    }
    else {
        Write-Host '[3/4] 使用现有构建结果。' -ForegroundColor DarkGray
    }

    $hostingConfig = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.openai\hosting.json') | ConvertFrom-Json
    if ($hostingConfig.d1) {
        $wranglerConfig = Get-Content -Raw -LiteralPath $wranglerConfigPath | ConvertFrom-Json
        $databaseBinding = $wranglerConfig.d1_databases | Where-Object { $_.binding -eq $hostingConfig.d1 } | Select-Object -First 1
        if (-not $databaseBinding) {
            throw "未在 Wrangler 配置中找到 D1 绑定：$($hostingConfig.d1)"
        }

        $migrationsPath = Join-Path $projectRoot 'drizzle'
        if (-not (Test-Path -LiteralPath $migrationsPath)) {
            throw "未找到数据库迁移目录：$migrationsPath"
        }

        $databaseBinding | Add-Member -NotePropertyName 'migrations_dir' -NotePropertyValue $migrationsPath -Force
        $wranglerJson = $wranglerConfig | ConvertTo-Json -Depth 100 -Compress
        [System.IO.File]::WriteAllText($wranglerConfigPath, $wranglerJson, [System.Text.UTF8Encoding]::new($false))

        Write-Host '[4/4] 正在应用本地数据库迁移…' -ForegroundColor Yellow
        $previousCi = $env:CI
        try {
            # Wrangler skips its confirmation prompt in CI mode. This only affects
            # the migration subprocesses launched by this script.
            $env:CI = 'true'
            Invoke-Checked $nodePath '--import' './scripts/sites-env.mjs' './node_modules/wrangler/bin/wrangler.js' 'd1' 'migrations' 'apply' $hostingConfig.d1 '--local' '--config' './dist/server/wrangler.json' '--persist-to' '.wrangler/state'
            Invoke-Checked $nodePath '--import' './scripts/sites-env.mjs' './node_modules/wrangler/bin/wrangler.js' 'd1' 'execute' $hostingConfig.d1 '--local' '--config' './dist/server/wrangler.json' '--persist-to' '.wrangler/state' '--command' 'PRAGMA optimize'
        }
        finally {
            $env:CI = $previousCi
        }
    }
    else {
        Write-Host '[4/4] 当前未启用数据库。' -ForegroundColor DarkGray
    }

    Write-Host ''
    Write-Host '准备完成，正在启动开发服务器。按 Ctrl+C 停止。' -ForegroundColor Green
    Invoke-Checked $npmPath 'run' 'dev'
}
catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
