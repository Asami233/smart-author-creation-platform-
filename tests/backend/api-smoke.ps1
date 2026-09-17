param(
    [string]$BaseUrl = 'http://localhost:5173'
)

$ErrorActionPreference = 'Stop'

function Invoke-JsonApi {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body
    )

    $parameters = @{
        Method = $Method
        Uri = "$BaseUrl$Path"
        UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json; charset=utf-8'
        $parameters.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }
    $response = Invoke-WebRequest @parameters
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "$Method $Path 返回 $($response.StatusCode)"
    }
    if (-not $response.Content) { return $null }
    return $response.Content | ConvertFrom-Json
}

$health = Invoke-JsonApi -Method GET -Path '/api/health'
if ($health.data.status -ne 'ok') { throw '健康检查失败' }

$created = Invoke-JsonApi -Method POST -Path '/api/works' -Body @{
    title = '后端联调样例'
    description = '由 API smoke test 创建'
    genre = '玄幻'
    targetWords = 100000
}
$workId = $created.data.work.id
$chapterId = $created.data.chapters[0].id

$chapter = Invoke-JsonApi -Method PATCH -Path "/api/chapters/$chapterId" -Body @{
    content = '<p>雨落青石巷，故人叩门。</p>'
    expectedRevision = 1
}
if ($chapter.data.wordCount -le 0) { throw '章节字数统计失败' }

$manualVersion = Invoke-JsonApi -Method POST -Path "/api/chapters/$chapterId/versions" -Body @{
    label = '联调版本'
}
$versionId = $manualVersion.data.id

$null = Invoke-JsonApi -Method POST -Path "/api/works/$workId/knowledge/outlines" -Body @{
    title = '卷一大纲'
    content = '故人归来，旧案重启。'
    scopeType = 'work'
}
$null = Invoke-JsonApi -Method POST -Path "/api/works/$workId/knowledge/characters" -Body @{
    name = '沈砚'
    role = '主角'
    description = '旧书铺掌柜。'
}
$null = Invoke-JsonApi -Method POST -Path "/api/works/$workId/knowledge/world" -Body @{
    category = 'location'
    name = '青石巷'
    summary = '故事开始的地点。'
}
$null = Invoke-JsonApi -Method POST -Path "/api/works/$workId/knowledge/timeline" -Body @{
    title = '雨夜来客'
    storyTime = '霜降后第三日三更'
    relatedChapterId = $chapterId
}

$stats = Invoke-JsonApi -Method GET -Path "/api/works/$workId/stats"
if ($stats.data.totalWords -le 0) { throw '统计接口失败' }

$restored = Invoke-JsonApi -Method POST -Path "/api/chapter-versions/$versionId/restore"
if ($restored.data.id -ne $chapterId) { throw '版本恢复失败' }

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "smart-author-smoke-$([Guid]::NewGuid())"
[System.IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null
try {
    foreach ($format in @('txt', 'docx', 'pdf')) {
        $filePath = Join-Path $temporaryDirectory "export.$format"
        Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/works/$workId/export?format=$format" -OutFile $filePath
        if ((Get-Item -LiteralPath $filePath).Length -lt 20) { throw "$format 导出内容为空" }
    }
}
finally {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

$null = Invoke-JsonApi -Method DELETE -Path "/api/works/$workId"

Write-Host "API smoke test passed: $workId" -ForegroundColor Green
