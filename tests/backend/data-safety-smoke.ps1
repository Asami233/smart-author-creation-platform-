param([string]$BaseUrl = 'http://localhost:5173')

$ErrorActionPreference = 'Stop'

function Invoke-Json {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body
    )
    $parameters = @{ Method = $Method; Uri = "$BaseUrl$Path"; UseBasicParsing = $true }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json; charset=utf-8'
        $parameters.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 30 -Compress }
    }
    $response = Invoke-WebRequest @parameters
    if (-not $response.Content) { return $null }
    return $response.Content | ConvertFrom-Json
}

$work = (Invoke-Json -Method POST -Path '/api/works' -Body @{
    title = '数据保全测试作品'
    description = '用于验证备份和回收站'
    genre = '测试'
    targetWords = 10000
}).data

$chapterId = $work.chapters[0].id
$chapter = (Invoke-Json -Method PATCH -Path "/api/chapters/$chapterId" -Body @{
    content = '<p>雨夜来客，数据不可丢失。</p>'
    expectedRevision = $work.chapters[0].revision
}).data

$backupResponse = Invoke-WebRequest -Method GET -Uri "$BaseUrl/api/backup" -UseBasicParsing
$backup = $backupResponse.Content | ConvertFrom-Json
if ($backup.format -ne 'smart-author-backup' -or $backup.schemaVersion -ne 1) {
    throw '导出的备份格式不正确'
}
if (-not ($backup.data.works.id -contains $work.work.id)) {
    throw '完整备份中缺少测试作品'
}
if ($backupResponse.Content -match 'encryptedApiKey|"apiKey"') {
    throw '完整备份中不应包含 API Key'
}

$validation = (Invoke-Json -Method POST -Path '/api/backup/validate' -Body $backupResponse.Content).data
if (-not $validation.valid) {
    throw "备份校验失败：$($validation.issues -join '; ')"
}

$sourceWorkId = [guid]::NewGuid().ToString()
$sourceChapterId = [guid]::NewGuid().ToString()
$now = [DateTime]::UtcNow.ToString('o')
$minimalBackup = @{
    format = 'smart-author-backup'
    schemaVersion = 1
    appVersion = '0.1.0'
    exportedAt = $now
    data = @{
        works = @(@{ id = $sourceWorkId; title = '导入测试作品'; description = ''; genre = '测试'; status = 'draft'; targetWords = 5000; createdAt = $now; updatedAt = $now })
        volumes = @()
        chapters = @(@{ id = $sourceChapterId; workId = $sourceWorkId; volumeId = $null; title = '导入章节'; summary = ''; content = '<p>合并导入成功。</p>'; plainText = '合并导入成功。'; wordCount = 7; status = 'draft'; sortOrder = 0; revision = 1; deletedAt = $null; createdAt = $now; updatedAt = $now })
        outlines = @()
        characters = @()
        worldEntries = @()
        timelineEvents = @()
        chapterLinks = @()
        chapterVersions = @()
        writingDailyStats = @()
        aiSettings = $null
    }
}
$preflight = (Invoke-Json -Method POST -Path '/api/backup/preflight' -Body $minimalBackup).data
if ($preflight.mode -ne 'merge-copy' -or -not $preflight.previewToken) { throw '备份预检没有返回恢复凭据' }
$restoreRequest = @{
    backup = $minimalBackup
    previewToken = $preflight.previewToken
    mode = 'merge-copy'
    confirm = $true
}
$imported = (Invoke-Json -Method POST -Path '/api/backup/import' -Body $restoreRequest).data
if ($imported.importedWorkIds.Count -ne 1) { throw '安全合并导入没有创建作品' }
$retried = (Invoke-Json -Method POST -Path '/api/backup/import' -Body $restoreRequest).data
if (-not $retried.alreadyImported -or $retried.importedWorkIds[0] -ne $imported.importedWorkIds[0]) {
    throw '重复恢复没有返回幂等结果'
}

$storage = (Invoke-Json -Method GET -Path '/api/storage').data
if ($storage.activeWorks -lt 2 -or $storage.activeChapters -lt 2) {
    throw '存储统计没有包含新建和导入的数据'
}

Invoke-Json -Method DELETE -Path "/api/chapters/$chapterId" | Out-Null
$trash = (Invoke-Json -Method GET -Path '/api/trash').data
if (-not ($trash.chapters.id -contains $chapterId)) { throw '章节没有进入回收站' }
$restoredChapter = (Invoke-Json -Method POST -Path "/api/trash/chapters/$chapterId/restore").data
if (-not $restoredChapter.restored) { throw '章节恢复失败' }

Invoke-Json -Method DELETE -Path "/api/works/$($work.work.id)" | Out-Null
$trash = (Invoke-Json -Method GET -Path '/api/trash').data
if (-not ($trash.works.id -contains $work.work.id)) { throw '作品没有进入回收站' }
$restoredWork = (Invoke-Json -Method POST -Path "/api/trash/works/$($work.work.id)/restore").data
if (-not $restoredWork.restored) { throw '作品恢复失败' }

# 将冒烟测试创建的作品归档，避免影响正常作品列表。
Invoke-Json -Method DELETE -Path "/api/works/$($work.work.id)" | Out-Null
Invoke-Json -Method DELETE -Path "/api/works/$($imported.importedWorkIds[0])" | Out-Null

Write-Output "Data safety smoke test passed: $($work.work.id)"
